// Mubisys (ERP) ao vivo e pedido de material ao módulo Compras, pela ponte.
//
// ERP: só LEITURA, e só de um registro por vez (uma O.S. ou um orçamento pelo
// número, um cliente ou fornecedor pelo CPF/CNPJ). Relatório vem das visões
// donboy.mubi_* (a carga do Painel já copia o ERP de hora em hora); o ERP ao
// vivo é lento (25 a 200 s por página) e serve para o status de agora. As
// credenciais (MUBI_PUBLIC_KEY e MUBI_TOKEN) são segredos deste projeto,
// os mesmos do Compras: nada sai daqui.
//
// Regras do ERP que esta porta segue (medidas pela casa):
//   • cabeçalho Access-Token; sucesso é 201 (200 também vale);
//   • 404 é "não achou", mas o ERP pisca 404 em registro que existe: só é
//     "não encontrado" quando dois 404 seguidos concordam;
//   • 429 e 5xx: uma nova tentativa; tempo esgotado nunca vira "não existe".
//
// Compras: a solicitação entra pela mesma porta do link público da equipe
// (compras-nucleo, ação novaSolicitacao), com o token do Compras deste
// projeto. Vira uma SC nova, que o comprador cota e transforma em ordem.

const TIMEOUT_MUBI_MS = 55_000;

export const CONSULTAS_MUBI = {
  os: (chave: string) => `ordem-servico/numero/${chave}`,
  orcamento: (chave: string) => `orcamento/numero/${chave}`,
  cliente: (chave: string) => `cliente/cpfcnpj/${chave}`,
  fornecedor: (chave: string) => `fornecedor/cpfcnpj/${chave}`,
} as const;
export type ConsultaMubi = keyof typeof CONSULTAS_MUBI;

type Ambiente = (nome: string) => string | undefined;
type Buscar = typeof fetch;

// Segredos do projeto (Deno na Edge Function; nos testes, o ambiente é passado).
const ambientePadrao: Ambiente = (nome) =>
  (globalThis as { Deno?: { env: { get(n: string): string | undefined } } }).Deno?.env.get(nome);

// Chave de busca: número de O.S./orçamento, ou CPF/CNPJ só com dígitos.
export function caminhoMubi(tipo: string, chave: string): string {
  if (!(tipo in CONSULTAS_MUBI)) throw new Error("consulta do ERP não permitida");
  const limpa = String(chave ?? "").replace(/\D/g, "");
  const tamanhoOk = tipo === "cliente" || tipo === "fornecedor" ? limpa.length === 11 || limpa.length === 14 : limpa.length >= 1 && limpa.length <= 9;
  if (!tamanhoOk) throw new Error(tipo === "cliente" || tipo === "fornecedor" ? "informe um CPF ou CNPJ válido" : "informe o número");
  return CONSULTAS_MUBI[tipo as ConsultaMubi](limpa);
}

// Tira do que o ERP devolve o que parece credencial.
function semSegredo(valor: unknown, nivel = 0): unknown {
  if (nivel > 8 || valor === null || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) return valor.map((v) => semSegredo(v, nivel + 1));
  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>)
      .filter(([k]) => !/token|senha|password|secret|hash/i.test(k))
      .map(([k, v]) => [k, semSegredo(v, nivel + 1)]),
  );
}

export async function consultarMubisys(tipo: string, chave: string, env: Ambiente = ambientePadrao, buscar: Buscar = fetch) {
  const caminho = caminhoMubi(tipo, chave);
  const publica = env("MUBI_PUBLIC_KEY");
  const token = env("MUBI_TOKEN");
  if (!publica || !token) throw new Error("credenciais do ERP não configuradas neste projeto");
  const url = `https://api.mubisys.com/api/${encodeURIComponent(publica)}/${caminho}`;

  let naoAchou = 0;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    let resp: Response;
    try {
      resp = await buscar(url, {
        headers: { Accept: "application/json", "Access-Token": token },
        signal: AbortSignal.timeout(TIMEOUT_MUBI_MS),
        redirect: "error",
      });
    } catch (e) {
      if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") {
        throw new Error("o ERP demorou demais para responder; tente de novo em alguns minutos");
      }
      throw new Error("não foi possível falar com o ERP agora");
    }
    if (resp.status === 404) {
      await resp.body?.cancel();
      if (++naoAchou >= 2) return { encontrado: false };
      continue;
    }
    if (resp.status === 401) throw new Error("o ERP recusou a credencial");
    if (resp.status === 403) throw new Error("o plano do ERP não libera esta consulta");
    if ([429, 500, 502, 503, 504].includes(resp.status) && tentativa < 2) {
      await resp.body?.cancel();
      continue;
    }
    if (resp.status !== 200 && resp.status !== 201) throw new Error(`o ERP respondeu ${resp.status}`);
    const corpo = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
    if (!corpo) throw new Error("o ERP devolveu uma resposta que não deu para ler");
    return { encontrado: true, registro: semSegredo(corpo.data ?? corpo) };
  }
  throw new Error("o ERP está instável agora; tente de novo em alguns minutos");
}

export interface ItemCompra {
  descricao: string;
  qtd: number;
  unid: string;
}

export interface SolicitacaoCompra {
  itens: ItemCompra[];
  setor: string;
  urgencia: "normal" | "urgente" | "critica";
  necessidadeEm: string;
  justificativa: string;
  obra: string;
}

export async function solicitarCompra(
  solicitacao: SolicitacaoCompra,
  env: Ambiente = ambientePadrao,
  buscar: Buscar = fetch,
) {
  const token = env("COMPRAS_TOKEN");
  const base = (env("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  if (!token || !base) throw new Error("o módulo Compras não está configurado neste projeto");
  const itens = (solicitacao.itens ?? []).slice(0, 40).filter((i) => String(i.descricao ?? "").trim() && Number(i.qtd) > 0);
  if (itens.length === 0) throw new Error("a solicitação precisa de ao menos um item com quantidade");
  const resp = await buscar(`${base}/functions/v1/compras-nucleo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-token": token },
    body: JSON.stringify({
      action: "novaSolicitacao",
      registro: {
        obraId: "producao",
        obra: solicitacao.obra || "Produção",
        solicitante: { nome: "Leonardo (pelo Don Boy)", funcao: "Direção", telefone: "" },
        setor: solicitacao.setor,
        urgencia: solicitacao.urgencia,
        necessidadeEm: solicitacao.necessidadeEm,
        justificativa: solicitacao.justificativa,
        itens: itens.map((i) => ({ descricao: i.descricao, qtd: i.qtd, unid: i.unid || "un" })),
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const dados = (await resp.json().catch(() => ({}))) as { ok?: boolean; codigo?: string; numero?: number; error?: string };
  if (!resp.ok || !dados.ok) throw new Error(dados.error || `o Compras respondeu ${resp.status}`);
  return { codigo: dados.codigo, numero: dados.numero };
}
