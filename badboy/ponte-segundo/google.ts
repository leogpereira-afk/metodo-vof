// Agenda e Gmail do dono pela conexão com o Google que a Central do Léo
// (vida-leo) já tem neste projeto: a chave de renovação fica em
// leo_config ('google_refresh') e o crachá de ~1 h em 'google_token', no mesmo
// formato que a Central usa. As credenciais do app (GOOGLE_CLIENT_ID e
// GOOGLE_CLIENT_SECRET) são segredos deste projeto. Nada disso sai daqui: o Don
// Boy recebe só os eventos e os e-mails.
//
// Escopos da conexão: gmail.readonly, gmail.send, calendar.readonly,
// calendar.app.created e drive.readonly. Esta ponte lê agenda e Gmail, envia
// e-mail e cria lembretes. O envio só é chamado depois do toque do dono no
// botão "Enviar" do Telegram; aqui o e-mail é validado de novo antes de sair.
// Os lembretes vão para um calendário próprio ("Lembretes do Don Boy"): com
// calendar.app.created, a ponte só escreve no calendário que ela criou, nunca
// nos calendários de sempre do dono.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { montarMime, paraBase64Url, validarEmail } from "../src/email.ts";

const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const CALENDAR = "https://www.googleapis.com/calendar/v3";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const FOLGA_MS = 120_000;
const LIMITE_CORPO = 8_000;

const texto = (v: unknown): string => (v == null ? "" : String(v)).trim();

async function lerConfig(db: SupabaseClient, chave: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from("leo_config").select("valor").eq("chave", chave).maybeSingle();
  if (error) throw new Error("leo_config: " + error.message);
  const valor = data?.valor;
  return valor && typeof valor === "object" ? (valor as Record<string, unknown>) : null;
}

// Mesmo caminho da Central: usa o crachá guardado enquanto vale; vencido,
// renova com a chave de renovação e guarda o novo. Se o Google recusar, NÃO
// apaga a chave (quem cuida da conexão é a Central): só avisa.
export async function tokenGoogle(db: SupabaseClient): Promise<string> {
  const guardado = await lerConfig(db, "google_token");
  const exp = guardado ? Date.parse(texto(guardado.exp)) : NaN;
  if (guardado && texto(guardado.token) && Number.isFinite(exp) && exp > Date.now() + FOLGA_MS) {
    return texto(guardado.token);
  }
  const refresh = await lerConfig(db, "google_refresh");
  const chave = refresh ? texto(refresh.token) : "";
  if (!chave) throw new Error("o Google não está conectado: autorize na Central do Léo (tela Drive)");

  const id = texto(Deno.env.get("GOOGLE_CLIENT_ID"));
  const secret = texto(Deno.env.get("GOOGLE_CLIENT_SECRET"));
  if (!id || !secret) throw new Error("faltam as credenciais do app Google neste projeto");

  const resp = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "refresh_token", refresh_token: chave }),
    signal: AbortSignal.timeout(20_000),
  });
  const dados = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    if (resp.status === 400 || resp.status === 401) {
      throw new Error("o Google recusou a conexão: refaça a autorização na Central do Léo");
    }
    throw new Error("Google respondeu " + resp.status);
  }
  const token = texto(dados.access_token);
  if (!token) throw new Error("o Google não devolveu o crachá");
  const vence = new Date(Date.now() + (Number(dados.expires_in) || 3600) * 1000).toISOString();
  await db.from("leo_config").upsert(
    { chave: "google_token", valor: { token, exp: vence, escopo: texto(dados.scope) || texto(refresh?.escopo) }, atualizado_em: new Date().toISOString() },
    { onConflict: "chave" },
  );
  return token;
}

async function google(token: string, url: string, corpo?: unknown): Promise<Record<string, unknown>> {
  const resp = await fetch(url, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(corpo === undefined ? {} : { "Content-Type": "application/json" }) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(25_000),
  });
  const dados = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    const erro = (dados.error as { message?: string } | undefined)?.message;
    throw new Error(`Google ${resp.status}${erro ? `: ${erro}` : ""}`);
  }
  return dados;
}

export interface Evento {
  agenda: string;
  titulo: string;
  inicio: string;
  fim: string;
  dia_inteiro: boolean;
  local: string;
  descricao: string;
}

// Eventos entre duas datas (AAAA-MM-DD, inclusive), de todas as agendas
// marcadas como visíveis na conta, em ordem de início.
export async function agenda(db: SupabaseClient, de: string, ate: string): Promise<Evento[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) throw new Error("datas no formato AAAA-MM-DD");
  const token = await tokenGoogle(db);
  const lista = await google(token, `${CALENDAR}/users/me/calendarList?maxResults=50`);
  const agendas = ((lista.items as Record<string, unknown>[]) ?? [])
    .filter((c) => c.primary === true || c.selected === true)
    .slice(0, 15);
  const inicio = new Date(`${de}T00:00:00-03:00`).toISOString();
  const fim = new Date(new Date(`${ate}T00:00:00-03:00`).getTime() + 86_400_000).toISOString();
  const eventos: Evento[] = [];
  await Promise.all(
    agendas.map(async (c) => {
      const params = new URLSearchParams({
        timeMin: inicio, timeMax: fim, singleEvents: "true", orderBy: "startTime", maxResults: "100",
        timeZone: "America/Sao_Paulo",
      });
      const dados = await google(token, `${CALENDAR}/calendars/${encodeURIComponent(texto(c.id))}/events?${params}`);
      for (const e of (dados.items as Record<string, Record<string, string>>[]) ?? []) {
        if ((e.status as unknown) === "cancelled") continue;
        eventos.push({
          agenda: texto(c.summaryOverride ?? c.summary),
          titulo: texto(e.summary) || "(sem título)",
          inicio: texto(e.start?.dateTime ?? e.start?.date),
          fim: texto(e.end?.dateTime ?? e.end?.date),
          dia_inteiro: !e.start?.dateTime,
          local: texto(e.location),
          descricao: texto(e.description).slice(0, 300),
        });
      }
    }),
  );
  return eventos.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

const cabecalho = (msg: Record<string, unknown>, nome: string): string => {
  const headers = ((msg.payload as Record<string, unknown>)?.headers as { name: string; value: string }[]) ?? [];
  return texto(headers.find((h) => h.name.toLowerCase() === nome.toLowerCase())?.value);
};

// Busca com a sintaxe do Gmail (from:, subject:, newer_than:7d, is:unread,
// has:attachment…). Devolve só o cabeçalho e o trecho de cada e-mail.
export async function gmailBuscar(db: SupabaseClient, consulta: string, quantos: number) {
  const token = await tokenGoogle(db);
  const max = Math.min(Math.max(Math.trunc(quantos) || 10, 1), 20);
  const lista = await google(token, `${GMAIL}/messages?${new URLSearchParams({ q: consulta, maxResults: String(max) })}`);
  const ids = ((lista.messages as { id: string }[]) ?? []).map((m) => m.id);
  const params = "format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date";
  return await Promise.all(
    ids.map(async (id) => {
      const msg = await google(token, `${GMAIL}/messages/${id}?${params}`);
      const rotulos = (msg.labelIds as string[]) ?? [];
      return {
        id,
        de: cabecalho(msg, "From"),
        para: cabecalho(msg, "To"),
        assunto: cabecalho(msg, "Subject"),
        data: cabecalho(msg, "Date"),
        trecho: texto(msg.snippet),
        nao_lido: rotulos.includes("UNREAD"),
      };
    }),
  );
}

function decodificar(base64url: string): string {
  const bin = atob(base64url.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function semHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

// Um e-mail inteiro: cabeçalho, corpo em texto (o text/plain; na falta, o HTML
// sem as tags) e o nome dos anexos. Corpo cortado em LIMITE_CORPO caracteres.
export async function gmailLer(db: SupabaseClient, id: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("id de e-mail inválido");
  const token = await tokenGoogle(db);
  const msg = await google(token, `${GMAIL}/messages/${id}?format=full`);
  let plano = "";
  let html = "";
  const anexos: { nome: string; tipo: string; tamanho: number }[] = [];
  const percorrer = (parte: Record<string, unknown>) => {
    const tipo = texto(parte.mimeType);
    const corpo = (parte.body as { data?: string; size?: number; attachmentId?: string }) ?? {};
    if (texto(parte.filename)) {
      anexos.push({ nome: texto(parte.filename), tipo, tamanho: corpo.size ?? 0 });
    } else if (corpo.data && tipo === "text/plain" && !plano) {
      plano = decodificar(corpo.data);
    } else if (corpo.data && tipo === "text/html" && !html) {
      html = decodificar(corpo.data);
    }
    for (const filha of (parte.parts as Record<string, unknown>[]) ?? []) percorrer(filha);
  };
  percorrer((msg.payload as Record<string, unknown>) ?? {});
  const corpo = (plano || semHtml(html)).trim();
  return {
    id,
    de: cabecalho(msg, "From"),
    para: cabecalho(msg, "To"),
    cc: cabecalho(msg, "Cc"),
    assunto: cabecalho(msg, "Subject"),
    data: cabecalho(msg, "Date"),
    corpo: corpo.length > LIMITE_CORPO ? `${corpo.slice(0, LIMITE_CORPO)}\n[corpo cortado]` : corpo,
    anexos,
  };
}

// Envia pelo Gmail do dono. Numa resposta, busca o Message-ID do original para
// o e-mail cair na mesma conversa, e usa "Re: assunto" se o assunto veio vazio.
export async function gmailEnviar(db: SupabaseClient, entrada: unknown) {
  const validacao = validarEmail(entrada);
  if (!validacao.ok) throw new Error(validacao.erro);
  const email = validacao.email;
  const token = await tokenGoogle(db);

  let assunto = email.assunto;
  let threadId = "";
  let resposta: { messageId: string; references: string } | undefined;
  if (email.responderA) {
    const params = "format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject";
    const original = await google(token, `${GMAIL}/messages/${email.responderA}?${params}`);
    threadId = texto(original.threadId);
    resposta = { messageId: cabecalho(original, "Message-ID"), references: cabecalho(original, "References") };
    if (!assunto) {
      const doOriginal = cabecalho(original, "Subject");
      assunto = /^re:/i.test(doOriginal) ? doOriginal : `Re: ${doOriginal}`;
    }
  }

  const raw = paraBase64Url(montarMime(email, assunto, resposta));
  const resp = await fetch(`${GMAIL}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
    signal: AbortSignal.timeout(25_000),
  });
  const dados = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    if (resp.status === 403) {
      throw new Error(
        "falta autorizar o envio: na Central do Léo, tela Drive, toque em Desconectar o Drive e depois em Conectar o Google Drive, aceitando o envio de e-mail",
      );
    }
    const erro = (dados.error as { message?: string } | undefined)?.message;
    throw new Error(`Google ${resp.status}${erro ? `: ${erro}` : ""}`);
  }
  return { id: texto(dados.id), conversa: texto(dados.threadId), para: email.para, assunto };
}

export const CALENDARIO_LEMBRETES = "Lembretes do Don Boy";
const FUSO = "America/Sao_Paulo";

// O calendário dos lembretes: acha pelo nome entre os que a conta possui; na
// primeira vez, cria.
async function calendarioDeLembretes(token: string): Promise<string> {
  const lista = await google(token, `${CALENDAR}/users/me/calendarList?maxResults=250&minAccessRole=owner`);
  const achado = ((lista.items as Record<string, unknown>[]) ?? []).find((c) => texto(c.summary) === CALENDARIO_LEMBRETES);
  if (achado) return texto(achado.id);
  const novo = await google(token, `${CALENDAR}/calendars`, { summary: CALENDARIO_LEMBRETES, timeZone: FUSO });
  return texto(novo.id);
}

// Lembrete do dono para ele mesmo: evento no calendário dos lembretes, sem
// convidados, com aviso na hora e 30 minutos antes. Horário de Brasília.
export async function criarLembrete(db: SupabaseClient, entrada: unknown) {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const titulo = texto(e.titulo).replace(/[\r\n]+/g, " ").slice(0, 200);
  const data = texto(e.data);
  const hora = texto(e.hora);
  const duracao = Math.min(Math.max(Math.trunc(Number(e.duracaoMin)) || 15, 5), 480);
  const nota = texto(e.nota).slice(0, 1000);
  if (!titulo) throw new Error("informe o título do lembrete");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("data no formato AAAA-MM-DD");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error("hora no formato HH:MM");
  const inicio = Date.parse(`${data}T${hora}:00-03:00`);
  if (!Number.isFinite(inicio)) throw new Error("data ou hora inválida");

  const token = await tokenGoogle(db);
  const calendario = await calendarioDeLembretes(token);
  const evento = await google(token, `${CALENDAR}/calendars/${encodeURIComponent(calendario)}/events?sendUpdates=none`, {
    summary: titulo,
    description: nota,
    start: { dateTime: new Date(inicio).toISOString(), timeZone: FUSO },
    end: { dateTime: new Date(inicio + duracao * 60_000).toISOString(), timeZone: FUSO },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 0 }, { method: "popup", minutes: 30 }] },
  });
  return { id: texto(evento.id), titulo, data, hora, duracao_min: duracao, calendario: CALENDARIO_LEMBRETES, link: texto(evento.htmlLink) };
}
