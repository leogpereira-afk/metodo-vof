// @ts-nocheck
// Método V.O.F.: porta de dados única do sistema (vof-sync).
//
// Quem entra: o crachá da casa (JWT HS256 com EQUIPE_JWT_SECRET), conferido
// AQUI com as quatro conferências (regras.mjs: lerCracha). verify_jwt=false de
// propósito: o gateway do Supabase não conhece esse crachá.
// O x-token (secret VOF_TOKEN) é só de máquina (backup), nunca do navegador.
//
// Este arquivo é JavaScript puro com extensão .ts (sem anotação de tipo, por
// isso o @ts-nocheck): assim o teste do Node 20 roda o handler inteiro, com um
// banco de mentira, sem transpilar. As regras (crachá, papel, validação) moram
// em regras.mjs; publicar exige subir os dois arquivos
// (supabase/publicar-functions.sh).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  SISTEMA, URL_VALIDADE_SEG, ARQUIVOS, MIN_TOKEN_MAQUINA, Falha,
  lerCracha, ehMaquina, autorizar, precisaConfirmarAdmin, papelAtual, idValido, colValida, limiteValido, cursorValido,
  validarRegistro, validarConfig, revisaoEsperada, caminhoArquivo,
  falhaDeGravacao, falhaDeArquivo, respostaDeErro,
} from "./regras.mjs";

const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
const TOKEN = Deno.env.get("VOF_TOKEN") ?? "";
const JWT_SECRET = Deno.env.get("EQUIPE_JWT_SECRET") ?? "";
const T_REG = "vof_registros", T_CFG = "vof_config_global", T_META = "vof_meta", BUCKET = "vof-arquivos";

// Configuração inválida grita no log em vez de sumir calada.
if (!JWT_SECRET) console.error("vof-sync: EQUIPE_JWT_SECRET ausente; nenhum crachá será aceito.");
if (TOKEN && TOKEN.length < MIN_TOKEN_MAQUINA) console.error(`vof-sync: VOF_TOKEN com menos de ${MIN_TOKEN_MAQUINA} caracteres é ignorado; a máquina não entra.`);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Erro de consulta não vira lista vazia: vira 500 com a causa no log.
function conferir(result, onde) {
  if (result.error) {
    console.error(`vof-sync: ${onde}:`, result.error?.message ?? result.error);
    throw new Falha("Não foi possível consultar ou salvar os dados. Tente novamente.", 500);
  }
  return result.data;
}

async function registro(col, id) {
  return conferir(await sb.from(T_REG).select("registro, apagado, revision").eq("colecao", col).eq("id", id).maybeSingle(), "ler registro");
}
async function config() {
  const r = conferir(await sb.from(T_CFG).select("config").eq("id", true).maybeSingle(), "ler configuração");
  return r?.config ?? {};
}

// Conta desativada, papel desativado ou desligamento no RH fecham a porta
// mesmo com o crachá ainda dentro da validade. Falha na consulta NÃO libera.
async function conferirAcesso(cracha) {
  const { data, error } = await sb.rpc("acesso_revogado", { p_sistema: SISTEMA, p_sub: cracha.sub, p_papel: cracha.papel });
  if (error || typeof data !== "boolean") {
    console.error("vof-sync: acesso_revogado:", error?.message ?? "resposta sem booleano");
    throw new Falha("Não consegui conferir seu acesso agora. Tente novamente.", 503);
  }
  if (data) throw new Falha("Seu acesso foi encerrado. Fale com a gestão.", 401);
}

// O crachá vale 30 dias; o papel de admin é conferido no banco AGORA, antes de
// cada ação que só o admin pode (ver precisaConfirmarAdmin em regras.mjs).
// Login direto: a conta em equipe_contas. Entrada única: o crachá traz o
// usuário do quadro único, e o login do sistema pode ser outro; por isso, sem
// conta com esse nome, vale a linha de acesso_papel da mesma pessoa.
// Falha na consulta não libera; papel diferente de admin recebe 403.
async function confirmarAdmin(cracha) {
  const falhou = (onde, error) => {
    console.error(`vof-sync: confirmar admin (${onde}):`, error?.message ?? error);
    throw new Falha("Não consegui conferir seu acesso agora. Tente novamente.", 503);
  };
  const conta = await sb.from("equipe_contas").select("papel, ativo").eq("sistema", SISTEMA).eq("usuario", cracha.sub).maybeSingle();
  if (conta.error) falhou("equipe_contas", conta.error);
  let papelUnico = null;
  if (!conta.data) {
    const pessoa = await sb.from("acesso_conta").select("id, ativo").eq("usuario", cracha.sub).maybeSingle();
    if (pessoa.error) falhou("acesso_conta", pessoa.error);
    if (pessoa.data && pessoa.data.ativo !== false) {
      const linha = await sb.from("acesso_papel").select("papel, ativo").eq("conta_id", pessoa.data.id).eq("sistema", SISTEMA).maybeSingle();
      if (linha.error) falhou("acesso_papel", linha.error);
      papelUnico = linha.data;
    }
  }
  if (papelAtual({ conta: conta.data, papelUnico }) !== "admin") {
    throw new Falha("Só o administrador faz isto, e o seu papel atual no V.O.F. não é esse. Entre de novo para atualizar o acesso.", 403);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp({ erro: "Use POST." }, 405);
  try {
    const xToken = req.headers.get("x-token");
    const maquina = ehMaquina(xToken, TOKEN);
    // x-token errado é recusado com nome próprio: a automação descobre na hora
    // que a credencial dela envelheceu, em vez de cair num 401 genérico.
    if (xToken && !maquina) throw new Falha("Credencial de máquina recusada.", 401);
    let cracha = null;
    if (!maquina) {
      const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(\S+)\s*$/i);
      cracha = m ? await lerCracha(m[1], JWT_SECRET) : null;
      if (!cracha) throw new Falha("Entre no sistema.", 401);
      await conferirAcesso(cracha);
    }

    let body;
    try { body = await req.json(); } catch { throw new Falha("JSON inválido."); }
    if (!body || Array.isArray(body) || typeof body !== "object") throw new Falha("Requisição inválida.");
    const action = String(body.action ?? "");
    // Papel ANTES de qualquer leitura ou escrita. O que só o admin pode é
    // confirmado no banco: o papel do crachá pode ter 30 dias.
    const quem = { acao: action, colecao: body.colecao ?? null, papel: cracha?.papel ?? null, maquina };
    autorizar(quem);
    if (precisaConfirmarAdmin(quem)) await confirmarAdmin(cracha);

    switch (action) {
      case "ping":
        return resp({ ok: true, agora: new Date().toISOString(), papel: maquina ? "maquina" : cracha.papel });

      case "rev": {
        const data = conferir(await sb.from(T_META).select("valor").eq("chave", "rev").maybeSingle(), "ler rev");
        return resp({ rev: data?.valor ?? { rev: 0, porColecao: {} } });
      }

      case "list": {
        // Exportação inteira (backup): autorizar() já deixou só admin ou máquina.
        if (body.colecao === undefined || body.colecao === null) {
          const de = Number(body.after ?? 0);
          if (!Number.isSafeInteger(de) || de < 0) throw new Falha("Página inválida.");
          const data = conferir(await sb.from(T_REG).select("colecao, id, registro, apagado").order("colecao").order("id").range(de, de + 499), "exportar");
          return resp({
            registros: data.filter((l) => !l.apagado).map((l) => ({ ...l.registro, _col: l.colecao })),
            nextAfter: data.length === 500 ? de + 500 : null,
          });
        }
        const col = colValida(body.colecao), limite = limiteValido(body.limite), cursor = cursorValido(body.desde);
        let q = sb.from(T_REG).select("id, registro, apagado, atualizado_em, revision").eq("colecao", col);
        if (cursor?.id) q = q.or(`atualizado_em.gt.${cursor.em},and(atualizado_em.eq.${cursor.em},id.gt.${cursor.id})`);
        else if (cursor) q = q.gt("atualizado_em", cursor.em);
        const data = conferir(await q.order("atualizado_em").order("id").limit(limite), "listar");
        const ultimo = data[data.length - 1];
        // Arquivados vêm junto (apagado: true) para a tela tirar da lista local.
        // O CONTEÚDO do arquivado só vai para o admin e a máquina: o get já o
        // esconde, e a lista não pode ser o caminho de volta para o facilitador.
        const verArquivado = maquina || cracha?.papel === "admin";
        const itens = verArquivado ? data : data.map((l) => (l.apagado ? { ...l, registro: { id: l.id } } : l));
        return resp({ itens, proximo: data.length === limite ? { em: ultimo.atualizado_em, id: ultimo.id } : null });
      }

      case "get": {
        const col = colValida(body.colecao);
        const data = conferir(await sb.from(T_REG).select("registro, apagado, revision").eq("colecao", col).eq("id", idValido(body.id)).maybeSingle(), "ler");
        return resp({ registro: data && !data.apagado ? data.registro : null, revision: data?.revision ?? 0 });
      }

      case "upsert":
      case "delete":
      case "restore": {
        const col = colValida(body.colecao);
        const reg = action === "upsert" ? validarRegistro(col, body.registro, { maquina, sub: cracha?.sub ?? null }) : null;
        const id = action === "upsert" ? reg.id : idValido(body.id);
        const expected = revisaoEsperada(body.expectedRevision);
        const mutation = body.mutationId === undefined || body.mutationId === null ? null : idValido(body.mutationId);
        const atual = await registro(col, id);
        const result = await sb.rpc("vof_gravar", {
          p_colecao: col, p_id: id, p_registro: reg, p_acao: action,
          p_expected: expected ?? atual?.revision ?? 0, p_mutation: mutation,
        });
        if (result.error) {
          if (result.error.code !== "40001") console.error("vof-sync: vof_gravar:", result.error.message);
          throw falhaDeGravacao(result.error);
        }
        return resp(result.data);
      }

      case "getCfg": {
        const cfg = await config();
        return resp({ config: cfg, cfg });
      }

      case "setCfg": {
        // Só os campos enviados mudam; omitir um campo não o apaga.
        const { config: patch, anterior } = validarConfig(body.config, body.anterior);
        const result = await sb.rpc("vof_configurar", { p_patch: patch, p_anterior: anterior });
        if (result.error?.code === "40001") throw new Falha("A configuração mudou. Atualize antes de salvar.", 409);
        return resp(conferir(result, "configurar"));
      }

      case "urlArquivo": {
        // O nome é uma chave da lista fechada; o caminho no bucket nunca vem da tela.
        const caminho = caminhoArquivo(body.nome);
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(caminho, URL_VALIDADE_SEG);
        if (error || !data?.signedUrl) {
          console.error("vof-sync: urlArquivo:", error?.message ?? "sem signedUrl");
          throw falhaDeArquivo(error);
        }
        return resp({ url: data.signedUrl, expira: new Date(Date.now() + URL_VALIDADE_SEG * 1000).toISOString() });
      }

      case "saude": {
        const total = await sb.from(T_REG).select("id", { count: "exact", head: true });
        conferir(total, "saúde: registros");
        const conteudo = await sb.from(T_REG).select("id", { count: "exact", head: true }).eq("colecao", "conteudo").eq("apagado", false);
        conferir(conteudo, "saúde: conteúdo");
        const [pasta, arquivo] = ARQUIVOS.apostila.split("/");
        const lista = conferir(await sb.storage.from(BUCKET).list(pasta, { search: arquivo }), "saúde: bucket");
        return resp({
          ok: true,
          registros: total.count,
          conteudo: conteudo.count,
          apostila: Array.isArray(lista) && lista.some((o) => o?.name === arquivo),
        });
      }

      default:
        throw new Falha("Ação desconhecida.");
    }
  } catch (e) {
    if (!(e instanceof Falha)) console.error("vof-sync: erro inesperado:", e);
    const { status, corpo } = respostaDeErro(e);
    return resp(corpo, status);
  }
});
