// Regras puras da porta de dados vof-sync.
//
// Este arquivo roda em DOIS lugares: no Deno (importado pelo index.ts) e no
// Node 20 (pelos testes, sem rede). Por isso aqui só entra JavaScript comum e
// APIs da web que existem nos dois (crypto.subtle, atob, TextEncoder).
// Nada aqui fala com o banco: o que depende do Supabase fica no index.ts.
//
// Publicar a função exige subir index.ts E regras.mjs juntos
// (supabase/publicar-functions.sh faz isso).

export const SISTEMA = "vof";

// Papéis que o crachá do V.O.F. pode trazer. Qualquer outro é recusado na
// porta, mesmo com assinatura válida.
//   admin: o Léo, tudo.
//   facilitador: lê tudo; cria e edita turmas, empresas, diagnósticos, planos
//     e salas; não apaga, não restaura, não mexe na configuração e não edita o
//     conteúdo do complemento APN.
export const PAPEIS = Object.freeze(["admin", "facilitador"]);

// A mesma lista mora na vof_gravar (0001_init.sql); o teste compara as duas.
export const COLECOES = Object.freeze(["turmas", "empresas", "diagnosticos", "planos", "salas", "conteudo"]);
export const COLECOES_DO_FACILITADOR = Object.freeze(["turmas", "empresas", "diagnosticos", "planos", "salas"]);

// Documentos do complemento APN 109. Lista fechada: nada fora dela entra na coleção.
export const CONTEUDO_IDS = Object.freeze(["dinamicas", "insights", "modulos", "checklist"]);

// Arquivos do bucket privado que a tela pode pedir. Lista fechada: o nome que
// vem da tela é só uma CHAVE; o caminho no bucket nunca vem de fora.
export const ARQUIVOS = Object.freeze({ apostila: "apostila/Metodo_VOF_Apostila_Completa.pdf" });
export const URL_VALIDADE_SEG = 600;

// O x-token é só de máquina (backup). Segredo curto demais não vale como
// credencial: gere com `openssl rand -hex 32`.
export const MIN_TOKEN_MAQUINA = 32;

export const IDS_PRATICA = /^[vofpg][1-5]$/;
export const MOMENTOS = Object.freeze(["linha_de_base", "dia_30", "dia_60", "dia_90", "outro"]);
export const ALVOS = Object.freeze(["turma", "empresa"]);
export const STATUS_TURMA = Object.freeze(["planejada", "em andamento", "concluída"]);
export const FASES_PLANO = Object.freeze(["Dia 0", "Até dia 30", "Até dia 60", "Até dia 90"]);
export const MODOS_SALA = Object.freeze(["apresentar", "aplicar"]);

const LIMITE_BYTES = Object.freeze({ conteudo: 2_000_000, salas: 4_000 });
const LIMITE_PADRAO = 500_000;
export const LIMITE_CONFIG = 200_000;

export class Falha extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "Falha";
    this.status = status;
  }
}

export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const ehObjeto = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const vazio = (v) => v === undefined || v === null || v === "";

export function negar() {
  throw new Falha("Seu acesso não permite esta alteração.", 403);
}

export function idValido(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9._:-]{1,160}$/.test(id)) throw new Falha("Identificador inválido.");
  return id;
}

export function colValida(col) {
  if (typeof col !== "string" || !COLECOES.includes(col)) throw new Falha("Coleção inválida.");
  return col;
}

export function limiteValido(limite) {
  const n = Number(limite ?? 200);
  if (!Number.isInteger(n) || n < 1 || n > 500) throw new Falha("Limite de página inválido.");
  return n;
}

// Cursor do pull incremental. A dupla data/id não perde registros quando um
// lote inteiro tem a mesma data; a data solta fica por compatibilidade.
export function cursorValido(desde) {
  if (vazio(desde)) return null;
  const dataOk = (em) => typeof em === "string"
    && /^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(em) && Number.isFinite(Date.parse(em));
  if (ehObjeto(desde)) {
    if (!dataOk(desde.em)) throw new Falha("Cursor inválido.");
    return { em: desde.em, id: idValido(desde.id) };
  }
  if (!dataOk(desde)) throw new Falha("Cursor inválido.");
  return { em: desde, id: null };
}

// ---------------------------------------------------------------------------
// Crachá: as QUATRO conferências do padrão da casa.
//   1. assinatura HS256 com EQUIPE_JWT_SECRET;
//   2. validade (exp numérico no futuro);
//   3. sistema: p.sis === "vof" (crachá do POPs não abre o V.O.F.);
//   4. papel dentro da lista do V.O.F.
// Qualquer falha devolve null; quem chama responde 401.
// ---------------------------------------------------------------------------
function decodificar(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
}

export async function lerCracha(token, segredo, agoraMs = Date.now()) {
  try {
    if (typeof segredo !== "string" || !segredo || typeof token !== "string" || !token) return null;
    const partes = token.split(".");
    if (partes.length !== 3 || partes.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return null;
    const cab = JSON.parse(new TextDecoder().decode(decodificar(partes[0])));
    if (!ehObjeto(cab) || cab.alg !== "HS256") return null;
    const enc = new TextEncoder();
    const chave = await crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", chave, decodificar(partes[2]), enc.encode(`${partes[0]}.${partes[1]}`));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(decodificar(partes[1])));
    if (!ehObjeto(p)) return null;
    if (p.sis !== SISTEMA) return null;
    if (typeof p.sub !== "string" || !norm(p.sub)) return null;
    if (!PAPEIS.includes(p.papel)) return null;
    if (typeof p.exp !== "number" || !Number.isFinite(p.exp) || p.exp <= Math.floor(agoraMs / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

// x-token: só vale se o segredo existe, tem tamanho de segredo e é IGUAL ao
// recebido. Vazio nunca vale (nem dos dois lados). Comparação em tempo constante.
export function ehMaquina(recebido, segredo) {
  if (typeof segredo !== "string" || segredo.length < MIN_TOKEN_MAQUINA) return false;
  if (typeof recebido !== "string" || recebido.length !== segredo.length) return false;
  let dif = 0;
  for (let i = 0; i < segredo.length; i++) dif |= segredo.charCodeAt(i) ^ recebido.charCodeAt(i);
  return dif === 0;
}

// ---------------------------------------------------------------------------
// Quem pode o quê. Fecha por omissão: ação nova que ninguém listou aqui fica
// negada para o facilitador até alguém decidir o contrário.
// ---------------------------------------------------------------------------
export function facilitadorPode(acao, colecao = null) {
  switch (acao) {
    case "ping":
    case "rev":
    case "get":
    case "getCfg":
    case "urlArquivo":
    case "saude":
      return true;
    case "list":
      // Sem coleção é a exportação inteira (backup): só admin ou máquina.
      return colecao !== undefined && colecao !== null;
    case "upsert":
      return COLECOES_DO_FACILITADOR.includes(colecao);
    default:
      // delete, restore, setCfg e qualquer ação futura.
      return false;
  }
}

export function autorizar({ acao, colecao = null, papel = null, maquina = false }) {
  if (maquina || papel === "admin") return;
  if (papel !== "facilitador" || !facilitadorPode(acao, colecao)) negar();
}

// O crachá vale 30 DIAS e o papel dentro dele é o do dia em que foi emitido.
// Por isso o que só o admin pode fazer (apagar, restaurar, configurar,
// exportar tudo, gravar o conteúdo do APN) é confirmado no BANCO, que é a
// mesma regra da equipe-auth ("o papel vem do banco, não do crachá").
// Sem isto, quem foi rebaixado de admin a facilitador continuaria apagando
// até o crachá vencer, porque a acesso_revogado não compara papel.
export function precisaConfirmarAdmin({ acao, colecao = null, papel = null, maquina = false }) {
  return !maquina && papel === "admin" && !facilitadorPode(acao, colecao);
}

// Papel ATUAL no banco: a conta do próprio sistema (equipe_contas, onde o
// login direto lê) manda; sem ela, a linha do quadro único (acesso_papel,
// onde a entrada única lê). Desativada em qualquer uma das duas não é admin.
export function papelAtual({ conta = null, papelUnico = null } = {}) {
  const linha = conta || papelUnico;
  if (!linha || linha.ativo === false) return null;
  return typeof linha.papel === "string" ? linha.papel : null;
}

export function caminhoArquivo(nome) {
  if (typeof nome !== "string" || !Object.prototype.hasOwnProperty.call(ARQUIVOS, nome)) {
    throw new Falha("Arquivo desconhecido.");
  }
  return ARQUIVOS[nome];
}

// ---------------------------------------------------------------------------
// Validação do registro por coleção. Campo ausente passa (e o que estava lá
// continua, porque a tela manda o registro inteiro); campo presente com valor
// fora do combinado é recusado com a causa escrita.
// ---------------------------------------------------------------------------
function canonico(valor, lista, rotulo) {
  const achado = lista.find((x) => norm(x) === norm(valor));
  if (!achado) throw new Falha(`${rotulo} inválido: use ${lista.join(", ")}.`);
  return achado;
}

function inteiro(valor, min, max, mensagem) {
  const n = typeof valor === "string" && /^\d{1,7}$/.test(valor.trim()) ? Number(valor.trim()) : valor;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw new Falha(mensagem);
  return n;
}

// Date.parse aceita "2026-02-30" (vira 2 de março): a data é conferida pelas partes.
function data(valor, rotulo) {
  const m = typeof valor === "string" ? valor.match(/^(\d{4})-(\d\d)-(\d\d)/) : null;
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!m || d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    throw new Falha(`${rotulo}: use a data no formato AAAA-MM-DD.`);
  }
  return valor;
}

// N/A do caderno (p. 31): "inaplicável, justificado antes da pontuação;
// ajustar o denominador e sinalizar comparabilidade limitada". Entra só a
// forma exata "na", a que a tela grava e o VOFMetodo.pontuar lê. Variações
// ("NA ", "n/a") são recusadas para o banco não guardar duas grafias do
// mesmo N/A. A justificativa é conferida na tela, no campo evidência.
export const NOTA_NA = "na";

function nota(valor, pratica) {
  if (vazio(valor)) return null;
  if (valor === NOTA_NA) return NOTA_NA;
  return inteiro(valor, 0, 4, `Nota da prática ${pratica} fora da escala 0 a 4 (ou "na" quando a prática não se aplica).`);
}

// Campo de texto só aceita texto. Objeto ou lista no lugar de um nome passava
// pela porta e derrubava a tela de quem abrisse o registro depois.
function textos(obj, campos, rotulo) {
  for (const c of campos) {
    if (!vazio(obj[c]) && typeof obj[c] !== "string") throw new Falha(`${rotulo}: o campo ${c} tem de ser texto.`);
  }
}

const REGRAS = {
  empresas(r) {
    if (!vazio(r.nome) && typeof r.nome !== "string") throw new Falha("Nome da empresa inválido.");
    textos(r, ["segmento", "cidade", "contato", "obs"], "Empresa");
  },
  turmas(r) {
    if (!vazio(r.nivel)) r.nivel = inteiro(r.nivel, 1, 2, "Nível da turma: use 1 (Fundamentos) ou 2 (Avançado).");
    if (!vazio(r.participantes)) {
      // Participante não tem conta e o nome dele não é guardado: só a quantidade.
      r.participantes = inteiro(r.participantes, 0, 100_000,
        "Participantes é só a quantidade de pessoas (um número). Nomes não são guardados.");
    }
    if (!vazio(r.status)) r.status = canonico(r.status, STATUS_TURMA, "Situação da turma");
    if (!vazio(r.inicio)) data(r.inicio, "Início da turma");
    if (!vazio(r.empresaId)) idValido(r.empresaId);
    textos(r, ["nome", "facilitador", "obs"], "Turma");
  },
  diagnosticos(r) {
    if (!vazio(r.alvoTipo)) r.alvoTipo = canonico(r.alvoTipo, ALVOS, "Alvo do diagnóstico");
    if (!vazio(r.alvoId)) idValido(r.alvoId);
    if (!vazio(r.momento)) r.momento = canonico(r.momento, MOMENTOS, "Momento do diagnóstico");
    if (!vazio(r.data)) data(r.data, "Data do diagnóstico");
    textos(r, ["avaliador", "obs"], "Diagnóstico");
    if (r.notas !== undefined && r.notas !== null) {
      if (!ehObjeto(r.notas)) throw new Falha("Notas do diagnóstico inválidas.");
      for (const [pratica, valor] of Object.entries(r.notas)) {
        if (!IDS_PRATICA.test(pratica)) throw new Falha(`Prática desconhecida no diagnóstico: ${pratica.slice(0, 20)}.`);
        if (ehObjeto(valor)) {
          valor.nota = nota(valor.nota, pratica);
          if (!vazio(valor.evidencia) && typeof valor.evidencia !== "string") throw new Falha(`Evidência da prática ${pratica} inválida.`);
        } else {
          r.notas[pratica] = nota(valor, pratica);
        }
      }
    }
  },
  planos(r) {
    if (!vazio(r.turmaId)) idValido(r.turmaId);
    if (!vazio(r.dia0)) data(r.dia0, "Dia 0 do plano");
    if (r.marcos !== undefined && r.marcos !== null) {
      if (!Array.isArray(r.marcos) || r.marcos.length > 500) throw new Falha("Marcos do plano inválidos.");
      for (const m of r.marcos) {
        if (!ehObjeto(m)) throw new Falha("Marco do plano inválido.");
        if (!vazio(m.fase)) m.fase = canonico(m.fase, FASES_PLANO, "Fase do marco");
        if (m.feito !== undefined && typeof m.feito !== "boolean") throw new Falha("Marco do plano: feito deve ser sim ou não.");
        if (!vazio(m.id)) idValido(m.id);
        if (!vazio(m.data)) data(m.data, "Data do marco");
        textos(m, ["acao", "evidencia"], "Marco do plano");
      }
    }
    textos(r, ["restricao", "meta", "indicador", "responsavel"], "Plano");
    if (r.checklist !== undefined && r.checklist !== null) {
      if (!ehObjeto(r.checklist)) throw new Falha("Checklist do plano inválido.");
      for (const v of Object.values(r.checklist)) {
        if (!ehObjeto(v)) throw new Falha("Item do checklist inválido.");
        if (v.feito !== undefined && typeof v.feito !== "boolean") throw new Falha("Checklist: feito deve ser sim ou não.");
        if (!vazio(v.data)) data(v.data, "Data do item do checklist");
        textos(v, ["evidencia"], "Item do checklist");
      }
    }
  },
  salas(r) {
    if (!/^[A-Za-z0-9-]{3,24}$/.test(r.id)) throw new Falha("Código de sala inválido: use de 3 a 24 letras ou números.");
    if (!vazio(r.slide)) r.slide = inteiro(r.slide, 0, 10_000, "Número do slide inválido.");
    if (!vazio(r.modo)) r.modo = canonico(r.modo, MODOS_SALA, "Modo da sala");
  },
  conteudo(r) {
    if (!CONTEUDO_IDS.includes(r.id)) throw new Falha(`Documento de conteúdo desconhecido: use ${CONTEUDO_IDS.join(", ")}.`);
  },
};

// Devolve uma CÓPIA validada (o objeto recebido não é alterado) com o carimbo
// de autoria do crachá: quem gravou não é algo que o formulário escolhe.
// A automação (backup restaurando) preserva a autoria original.
export function validarRegistro(colecao, registro, { maquina = false, sub = null } = {}) {
  colValida(colecao);
  if (!ehObjeto(registro)) throw new Falha("Registro inválido.");
  let texto;
  try { texto = JSON.stringify(registro); } catch { throw new Falha("Registro inválido."); }
  if (texto.length > (LIMITE_BYTES[colecao] ?? LIMITE_PADRAO)) throw new Falha("Registro muito grande.");
  const r = JSON.parse(texto);
  idValido(r.id);
  REGRAS[colecao](r);
  if (!maquina) {
    if (typeof sub !== "string" || !norm(sub)) throw new Falha("Entre no sistema.", 401);
    r.atualizadoPor = sub;
  }
  return r;
}

export function validarConfig(config, anterior) {
  if (!ehObjeto(config)) throw new Falha("Configuração inválida.");
  if (JSON.stringify(config).length > LIMITE_CONFIG) throw new Falha("Configuração muito grande.");
  if (anterior !== undefined && anterior !== null && !ehObjeto(anterior)) throw new Falha("Configuração anterior inválida.");
  return { config, anterior: anterior ?? null };
}

export function revisaoEsperada(expected) {
  if (expected === undefined || expected === null) return null;
  if (!Number.isSafeInteger(expected) || expected < 0) throw new Falha("Versão inválida.");
  return expected;
}

// Erro de gravação do banco vira mensagem que a pessoa entende. 40001 é
// conflito (outra pessoa gravou antes, item arquivado, item sumiu).
export function falhaDeGravacao(error) {
  if (!error) return null;
  if (error.code === "40001") {
    const m = norm(error.message);
    if (m.includes("arquivado")) return new Falha("Este item foi arquivado. Atualize a lista.", 409);
    if (m.includes("nao encontrado")) return new Falha("Este item não existe mais. Atualize a lista.", 409);
    if (m.includes("sem conteudo")) return new Falha("Este item antigo está vazio; recupere pela cópia de segurança.", 409);
    return new Falha("Outra pessoa atualizou este item. Sua alteração foi preservada para revisão.", 409);
  }
  return new Falha("Não foi possível salvar. Tente novamente.", 500);
}

// Arquivo que ainda não foi enviado ao bucket responde 404, não "erro interno".
export function falhaDeArquivo(error) {
  const texto = norm(error?.message) + " " + String(error?.statusCode ?? error?.status ?? "");
  if (/not.?found|nao encontrad|\b404\b|\b400\b/.test(texto)) return new Falha("Este arquivo ainda não foi carregado.", 404);
  return new Falha("Não consegui gerar o link do arquivo agora. Tente novamente.", 502);
}

// Formato único das respostas de erro. 401 avisa a tela para pedir login
// (semSessao); 403 avisa que o papel não permite (semPermissao). Erro que não
// é Falha não expõe a mensagem interna.
export function respostaDeErro(e) {
  const status = e instanceof Falha ? e.status : 500;
  const erro = e instanceof Falha ? e.message : "Falha interna.";
  return {
    status,
    corpo: { erro, ...(status === 401 ? { semSessao: true } : {}), ...(status === 403 ? { semPermissao: true } : {}) },
  };
}
