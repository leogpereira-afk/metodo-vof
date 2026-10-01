import {Midia, identificarAnexo, deBase64, type AnexoRecebido} from "./midia.ts";
// Ponto de entrada do Don Boy como Supabase Edge Function (badboy-telegram).
//
// O Telegram entrega cada mensagem aqui por webhook (POST). A função responde
// 200 na hora e processa em segundo plano (EdgeRuntime.waitUntil): uma
// resposta do Claude pode levar mais que o prazo do webhook, e resposta
// atrasada faz o Telegram reenviar a mesma mensagem.
//
// GET  /badboy-telegram  → saúde mínima, sem configuração nem credenciais
// POST ?acao=configurar → configuração e diagnóstico autenticados
// GET  ?pergunta=...      → pergunta de teste, fora do Telegram (exige o token
//                          da ponte no header x-donboy-token)
// POST ?rotina=briefing   → briefing da manhã, disparado pelo pg_cron (mesmo token)
// POST /badboy-telegram  → updates do Telegram (com token secreto)

import { processarFila } from "./fila.ts";
import type { Update } from "grammy/types";
import Anthropic from "@anthropic-ai/sdk";
import type { Bot } from "grammy";
import { COMANDOS, criarBot, turno } from "./bot.ts";
import { Cerebro } from "./claude.ts";
import { type Ambiente, type Config, lerConfig } from "./config.ts";
import { Memoria } from "./memoria.ts";
import { SEGREDO_PONTE, Sistemas } from "./sistemas.ts";
import { dataPorExtenso } from "./telegram-util.ts";

declare const EdgeRuntime: { waitUntil(promessa: Promise<unknown>): void };

const NOME_FUNCAO = "badboy-telegram";
const NOME_NO_TELEGRAM = "Don Boy";
const SEGREDOS_DO_DONO = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_DONO_ID", "ANTHROPIC_API_KEY"];

// O Supabase injeta SUPABASE_URL e a chave secreta em toda Edge Function:
// o dono só cadastra os três segredos acima.
function ambiente(): Ambiente {
  const env: Ambiente = Deno.env.toObject();
  if (!env.SUPABASE_SECRET_KEY) {
    try {
      env.SUPABASE_SECRET_KEY = JSON.parse(env.SUPABASE_SECRET_KEYS ?? "{}").default;
    } catch {
      // formato inesperado: cai para a chave legada abaixo
    }
    env.SUPABASE_SECRET_KEY ||= env.SUPABASE_SERVICE_ROLE_KEY;
  }
  return env;
}

// Token que o Telegram manda em todo webhook. Derivado do token do bot, então
// não é mais um segredo para cadastrar, e muda junto se o token for trocado.
async function segredoWebhook(tokenBot: string): Promise<string> {
  const dados = new TextEncoder().encode(`badboy-webhook:${tokenBot}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", dados));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface Contexto {
  config: Config;
  bot: Bot;
  memoria: Memoria;
  sistemas: Sistemas;
  cerebro: Cerebro;
  segredo: string;
}

// Um bot por isolate: criado na primeira mensagem, reaproveitado nas seguintes.
let contexto: Promise<Contexto> | null = null;

function preparar(): Promise<Contexto> {
  contexto ??= (async () => {
    const config = lerConfig(ambiente());
    const memoria = new Memoria(config);
    const sistemas = new Sistemas(memoria, config.urlPonte);
    const midia = new Midia(config, fetch, (tipo,modelo,uso)=>memoria.registrarUsoMidia(tipo,modelo,uso));
    const cerebro = new Cerebro(config, memoria, sistemas, undefined, midia);
    const bot = criarBot(config, memoria, cerebro, sistemas);
    await bot.init();
    return { config, bot, memoria, sistemas, cerebro, segredo: await segredoWebhook(config.telegramToken) };
  })();
  contexto.catch(() => {
    contexto = null; // segredo cadastrado depois: tenta de novo na próxima
  });
  return contexto;
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

// Confere só o FORMATO de cada segredo (sim/não), nunca o valor: acha token
// colado pela metade, com espaço no meio ou trocado de lugar com outro.
function formatoDosSegredos(env: Ambiente): Record<string, boolean> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const dono = env.TELEGRAM_DONO_ID?.trim() ?? "";
  const anthropic = env.ANTHROPIC_API_KEY?.trim() ?? "";
  return {
    telegram_token_no_formato_certo: /^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token),
    telegram_token_encontrado_no_texto: /\d{5,}:[A-Za-z0-9_-]{30,}/.test(token),
    telegram_token_encontrado_juntando_partes: /\d{5,}:[A-Za-z0-9_-]{30,}/.test(token.replace(/\s+/g, "")),
    telegram_token_tem_dois_pontos: token.includes(":"),
    telegram_token_tem_espaco_ou_quebra: /\s/.test(token),
    telegram_token_parece_chave_anthropic: token.startsWith("sk-ant-"),
    telegram_token_parece_link: /t\.me|http|@/.test(token),
    dono_id_so_numeros: /^\d+$/.test(dono),
    anthropic_no_formato_certo: /^sk-ant-\S+$/.test(anthropic),
  };
}

async function configurarEDiagnosticar(): Promise<Record<string, unknown>> {
  const env = ambiente();
  const faltando = SEGREDOS_DO_DONO.filter((nome) => !env[nome]?.trim());
  if (faltando.length > 0) return { pronto: false, segredos_faltando: faltando };

  let ctx: Contexto;
  try {
    ctx = await preparar();
  } catch (e) {
    // Mensagens de lerConfig e do Telegram não carregam valores de chaves.
    return { pronto: false, erro: (e as Error).message, formato: formatoDosSegredos(env) };
  }

  const resultado: Record<string, unknown> = {
    telegram: { ok: true, bot: `@${ctx.bot.botInfo.username}`, nome: NOME_NO_TELEGRAM },
  };

  await ctx.bot.api.setWebhook(`${ambiente().SUPABASE_URL}/functions/v1/${NOME_FUNCAO}`, {
    secret_token: ctx.segredo,
    allowed_updates: ["message", "callback_query"],
  });
  await ctx.bot.api.setMyCommands(COMANDOS);
  // O Telegram limita trocas de nome: só troca quando está diferente.
  if ((await ctx.bot.api.getMyName()).name !== NOME_NO_TELEGRAM) {
    await ctx.bot.api.setMyName(NOME_NO_TELEGRAM);
  }
  const webhook = await ctx.bot.api.getWebhookInfo();
  resultado.webhook = {
    configurado: (webhook.url ?? "").endsWith(`/functions/v1/${NOME_FUNCAO}`),
    mensagens_na_fila: webhook.pending_update_count,
    ultimo_erro: webhook.last_error_message ?? null,
  };

  try {
    await new Anthropic({ apiKey: ctx.config.anthropicApiKey }).models.retrieve(ctx.config.modelo);
    resultado.anthropic = { ok: true, modelo: ctx.config.modelo };
  } catch (e) {
    resultado.anthropic = {
      ok: false,
      erro: e instanceof Anthropic.AuthenticationError ? "chave inválida ou apagada" : (e as Error).message,
    };
  }

  try {
    await ctx.memoria.resumoDoMes(ctx.config.fuso);
    resultado.supabase = { ok: true };
  } catch (e) {
    resultado.supabase = { ok: false, erro: (e as Error).message };
  }

  // Leitura dos sistemas: conta as tabelas visíveis pelo papel de leitura,
  // em cada um dos dois bancos, e confere a busca de novidades.
  const contarTabelas =
    "select count(*) as tabelas from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('donboy', 'public') and c.relkind in ('r', 'v', 'm', 'p') and (has_table_privilege(c.oid, 'select') or has_any_column_privilege(c.oid, 'select'))";
  for (const sistema of ["principal", "segundo"] as const) {
    try {
      const linhas = (await ctx.sistemas.consultar(sistema, contarTabelas)) as { tabelas: number }[];
      resultado[`leitura_${sistema}`] = { ok: true, tabelas_visiveis: linhas[0]?.tabelas ?? 0 };
    } catch (e) {
      resultado[`leitura_${sistema}`] = { ok: false, erro: (e as Error).message };
    }
  }
  const novidades = await ctx.sistemas.novidades(1);
  resultado.novidades = Object.fromEntries(novidades.map((n) => [n.sistema, n.ok ? "ok" : n.erro]));

  const tudoOk = [
    resultado.telegram,
    resultado.anthropic,
    resultado.supabase,
    resultado.leitura_principal,
    resultado.leitura_segundo,
  ].every((r) => (r as { ok: boolean }).ok) && novidades.every((n) => n.ok);
  return { pronto: tudoOk && (resultado.webhook as { configurado: boolean }).configurado, ...resultado };
}

async function hashHex(texto: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Quem chama as rotinas e a pergunta de teste mostra o token da ponte, o mesmo
// do Vault: só o próprio banco (pg_cron) e o servidor o conhecem.
async function autorizado(req: Request, ctx: Contexto): Promise<boolean> {
  const esperado = await ctx.memoria.segredo(SEGREDO_PONTE);
  const recebido = req.headers.get("x-donboy-token") ?? "";
  return Boolean(esperado) && (await hashHex(recebido)) === (await hashHex(esperado!));
}

// Texto que o briefing automático grava como pedido do dono: o Claude
// responde como a um "bom dia", e a conversa segue dali se ele responder.
export const PEDIDO_BRIEFING = "bom dia (briefing automático das 6h30: ainda não li nada hoje)";

// Briefing da manhã, uma vez por dia. Responde na hora e trabalha em segundo
// plano: o briefing consulta agenda, sistemas, e-mails e clima e leva ~1 min.
async function executarFila(ctx: Contexto): Promise<void> {
  await processarFila(ctx.memoria, async (trabalho) => {
    if (trabalho.payload.tipo === "briefing") {
      await ctx.memoria.salvarMensagem(ctx.config.donoId, "user", String(trabalho.payload.pedido));
      await turno(ctx.bot.api, ctx.config.donoId, ctx.config, ctx.memoria, ctx.cerebro);
    } else await ctx.bot.handleUpdate(trabalho.payload as unknown as Update);
  }, 1);
}
async function rotinaBriefing(req: Request): Promise<Response> {
  const ctx = await preparar();
  if (!(await autorizado(req, ctx))) return new Response("não autorizado", { status: 401 });
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: ctx.config.fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await ctx.memoria.enfileirar("briefing:" + dia, ctx.config.donoId, {
    tipo: "briefing",
    pedido:
      `Briefing agendado referente a ${dia}, previsto para 06h30 de Brasília. Considere a hora atual; não atribua falha de agendamento sem logs. Consulte agenda, pendências e dados atuais. Não crie lembretes nem envie mensagens a terceiros neste briefing.`,
  });
  EdgeRuntime.waitUntil(executarFila(ctx));
  return json({ ok: true, estado: "enfileirado", data: dia }, 202);
}

// Pergunta de teste: ferramentas de leitura apenas, numa
// conversa avulsa, sem Telegram e sem histórico, e devolve a resposta. Serve
// para conferir a qualidade depois de publicar. Só com o token da ponte (o
// mesmo do Vault): ninguém de fora gasta a API nem lê dados por aqui.
async function perguntaDeTeste(req: Request, pergunta: string): Promise<Response> {
  const ctx = await preparar();
  if (!(await autorizado(req, ctx))) return new Response("não autorizado", { status: 401 });
  const inicio = Date.now();
  const r = await ctx.cerebro.responder(
    [{ papel: "user", conteudo: pergunta.slice(0, 2000), em: new Date().toISOString() }],
    dataPorExtenso(new Date(), ctx.config.fuso),
    { somenteLeitura: true, auditarFerramentasCompletas: new URL(req.url).searchParams.get("ferramentas") === "completas" },
  );
  return json({
    texto: r.texto,
    consultas: r.consultas,
    anexos: r.anexos.map((a) => a.nome),
    modelos: [...new Set(r.usos.map((u) => u.modelo))],
    custo_usd: Number(r.usos.reduce((soma, u) => soma + u.custoUsd, 0).toFixed(4)),
    segundos: Math.round((Date.now() - inicio) / 1000),
  });
}

// Teste autenticado com arquivos pequenos; usa o mesmo validador e o mesmo Claude.
async function testarMidia(req:Request,ctx:Contexto):Promise<Response>{
  const corpo=await req.text();if(corpo.length>3_000_000)return json({erro:"Amostra acima de 3 MB."},413);
  let dados:{pergunta?:string;arquivos?:{tipo:string;nome:string;mime:string;base64:string}[]};
  try{dados=JSON.parse(corpo);}catch{return json({erro:"JSON inválido."},400);}
  if(!Array.isArray(dados.arquivos)||!dados.arquivos.length||dados.arquivos.length>2)return json({erro:"Envie 1 ou 2 amostras."},400);
  const midia=new Midia(ctx.config,fetch,(tipo,modelo,uso)=>ctx.memoria.registrarUsoMidia(tipo,modelo,uso));
  const blocos=[];
  for(const a of dados.arquivos){
    if(!['imagem','pdf','texto','audio'].includes(a.tipo)||typeof a.base64!=='string')return json({erro:"Tipo inválido."},400);
    blocos.push(...await midia.converter({...a,file_id:'amostra'} as AnexoRecebido,deBase64(a.base64)));
  }
  const r=await ctx.cerebro.responder([{papel:'user',conteudo:String(dados.pergunta||'Leia os arquivos e explique o conteúdo.').slice(0,2000)}],dataPorExtenso(new Date(),ctx.config.fuso),{somenteLeitura:true,blocosEntrada:blocos});
  return json({texto:r.texto,consultas:r.consultas,tipos:blocos.map(b=>b.type),modelos:[...new Set(r.usos.map(u=>u.modelo))]});
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const pergunta = req.method === "GET" ? url.searchParams.get("pergunta") : null;
    if (pergunta) return await perguntaDeTeste(req, pergunta);
    if (req.method === "POST" && url.searchParams.get("rotina") === "briefing") return await rotinaBriefing(req);
    if (req.method === "GET") return json({ servico: "Don Boy", versao: "melhorias-1", ok: true });
    if (req.method === "POST" && ["configurar", "processar", "capacidades", "testar-midia"].includes(url.searchParams.get("acao") ?? "")) {
      const ctx = await preparar();
      if (!(await autorizado(req, ctx))) return new Response("não autorizado", { status: 401 });
      if (url.searchParams.get("acao") === "testar-midia") return await testarMidia(req,ctx);
      if (url.searchParams.get("acao") === "capacidades") return json({
        claude: !!ctx.config.anthropicApiKey,
        leitura_pdf_imagens_texto: true,
        audio_e_geracao: new Midia(ctx.config).disponivel(),
        openai_configurada: !!ambiente().OPENAI_API_KEY?.trim(),
        gemini_configurada: !!(ambiente().GEMINI_API_KEY?.trim() || ambiente().GOOGLE_AI_API_KEY?.trim()),
        email: "previa_e_confirmacao_pela_ponte_existente"
      });
      if (url.searchParams.get("acao") === "configurar") return json(await configurarEDiagnosticar());
      EdgeRuntime.waitUntil(executarFila(ctx));
      return json({ ok: true }, 202);
    }
    if (req.method !== "POST") return new Response("método não permitido", { status: 405 });

    const ctx = await preparar();
    const { segredo } = ctx;
    // Só o Telegram conhece o token secreto do webhook.
    if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== segredo) {
      return new Response("não autorizado", { status: 401 });
    }

    const update = await req.json() as Update;
    const mensagem = "message" in update ? update.message : undefined;
    const callback = "callback_query" in update ? update.callback_query : undefined;
    const de = mensagem?.from ?? callback?.from;
    const chat = mensagem?.chat ?? callback?.message?.chat;
    if (de?.id !== ctx.config.donoId || chat?.type !== "private") return new Response("ok");
    if (!Number.isSafeInteger(update.update_id)) return new Response("update inválido", { status: 400 });
    let anexos: unknown[] = [], erroAnexo: string|undefined;
    try { const a=identificarAnexo(mensagem??{}); if(a) anexos=[a]; }
    catch(e){erroAnexo=(e as Error).message;}
    await ctx.memoria.enfileirar("telegram:" + update.update_id, chat.id, {...update,_anexos:anexos,_erro_anexo:erroAnexo});
    EdgeRuntime.waitUntil(executarFila(ctx));
    return new Response("ok");
  } catch (e) {
    console.error("Erro no Don Boy:", e);
    return json({ erro: (e as Error).message }, 500);
  }
});
