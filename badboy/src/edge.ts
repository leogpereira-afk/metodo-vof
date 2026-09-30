// Ponto de entrada do Don Boy como Supabase Edge Function (badboy-telegram).
//
// O Telegram entrega cada mensagem aqui por webhook (POST). A função responde
// 200 na hora e processa em segundo plano (EdgeRuntime.waitUntil): uma
// resposta do Claude pode levar mais que o prazo do webhook, e resposta
// atrasada faz o Telegram reenviar a mesma mensagem.
//
// GET  /badboy-telegram  → registra o webhook e o menu no Telegram (idempotente)
//                          e devolve um diagnóstico, sem expor nenhuma chave
// GET  ?pergunta=...      → pergunta de teste, fora do Telegram (exige o token
//                          da ponte no header x-donboy-token)
// POST /badboy-telegram  → updates do Telegram (com token secreto)

import Anthropic from "@anthropic-ai/sdk";
import type { Bot } from "grammy";
import { COMANDOS, criarBot } from "./bot.ts";
import { Cerebro } from "./claude.ts";
import { lerConfig, type Ambiente, type Config } from "./config.ts";
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
    const cerebro = new Cerebro(config, memoria, sistemas);
    const bot = criarBot(config, memoria, cerebro);
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

// Pergunta de teste: roda o cérebro inteiro (sistemas, agenda, internet) numa
// conversa avulsa, sem Telegram e sem histórico, e devolve a resposta. Serve
// para conferir a qualidade depois de publicar. Só com o token da ponte (o
// mesmo do Vault): ninguém de fora gasta a API nem lê dados por aqui.
async function perguntaDeTeste(req: Request, pergunta: string): Promise<Response> {
  const ctx = await preparar();
  const esperado = await ctx.memoria.segredo(SEGREDO_PONTE);
  const recebido = req.headers.get("x-donboy-token") ?? "";
  if (!esperado || (await hashHex(recebido)) !== (await hashHex(esperado))) {
    return new Response("não autorizado", { status: 401 });
  }
  const inicio = Date.now();
  const r = await ctx.cerebro.responder([{ papel: "user", conteudo: pergunta.slice(0, 2000) }], dataPorExtenso(new Date(), ctx.config.fuso));
  return json({
    texto: r.texto,
    consultas: r.consultas,
    anexos: r.anexos.map((a) => a.nome),
    modelos: [...new Set(r.usos.map((u) => u.modelo))],
    custo_usd: Number(r.usos.reduce((soma, u) => soma + u.custoUsd, 0).toFixed(4)),
    segundos: Math.round((Date.now() - inicio) / 1000),
  });
}

Deno.serve(async (req) => {
  try {
    const pergunta = req.method === "GET" ? new URL(req.url).searchParams.get("pergunta") : null;
    if (pergunta) return await perguntaDeTeste(req, pergunta);
    if (req.method === "GET") return json(await configurarEDiagnosticar());
    if (req.method !== "POST") return new Response("método não permitido", { status: 405 });

    const { bot, segredo } = await preparar();
    // Só o Telegram conhece o token secreto do webhook.
    if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== segredo) {
      return new Response("não autorizado", { status: 401 });
    }

    const update = await req.json();
    EdgeRuntime.waitUntil(
      bot.handleUpdate(update).catch((e) => console.error("Falha no update", update?.update_id, e)),
    );
    return new Response("ok");
  } catch (e) {
    console.error("Erro no Don Boy:", e);
    return json({ erro: (e as Error).message }, 500);
  }
});
