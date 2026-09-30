// E-mail que o Don Boy prepara e que só sai quando o dono toca em "Enviar".
// Funções puras (sem rede), usadas no Telegram (validação e prévia) e na
// ponte do segundo projeto (validação de novo e montagem da mensagem).

export interface Email {
  para: string[];
  cc: string[];
  assunto: string;
  corpo: string;
  // id (Gmail) do e-mail que esta mensagem responde; vazio quando é novo.
  responderA: string;
}

export const MAX_DESTINATARIOS = 10;
export const MAX_CORPO = 20_000;

const ENDERECO = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export type Validacao = { ok: true; email: Email } | { ok: false; erro: string };

export function validarEmail(entrada: unknown): Validacao {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const lista = (v: unknown) =>
    (Array.isArray(v) ? v : []).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  const para = lista(e.para);
  const cc = lista(e.cc);
  // Quebra de linha no assunto viraria cabeçalho novo na mensagem.
  const assunto = String(e.assunto ?? "").replace(/[\r\n]+/g, " ").trim();
  const corpo = String(e.corpo ?? "").replace(/\r\n?/g, "\n").trim();
  const responderA = String(e.responderA ?? "").trim();

  if (para.length === 0) return { ok: false, erro: "Informe ao menos um destinatário." };
  if (para.length + cc.length > MAX_DESTINATARIOS) {
    return { ok: false, erro: `No máximo ${MAX_DESTINATARIOS} destinatários somando para e cc.` };
  }
  const invalido = [...para, ...cc].find((x) => !ENDERECO.test(x));
  if (invalido) return { ok: false, erro: `Endereço inválido: ${invalido}. Use só o e-mail, sem nome.` };
  if (!assunto && !responderA) return { ok: false, erro: "Informe o assunto." };
  if (assunto.length > 200) return { ok: false, erro: "Assunto longo demais (máx. 200 caracteres)." };
  if (!corpo) return { ok: false, erro: "Escreva o corpo do e-mail." };
  if (corpo.length > MAX_CORPO) return { ok: false, erro: `Corpo longo demais (máx. ${MAX_CORPO} caracteres).` };
  if (responderA && !/^[A-Za-z0-9_-]+$/.test(responderA)) return { ok: false, erro: "Id do e-mail respondido inválido." };
  return { ok: true, email: { para, cc, assunto, corpo, responderA } };
}

// O que o dono vê no Telegram antes de tocar em "Enviar": o e-mail inteiro.
export function previaEmail(email: Email): string {
  return [
    "📧 E-MAIL PARA ENVIAR",
    "",
    `Para: ${email.para.join(", ")}`,
    ...(email.cc.length ? [`Cc: ${email.cc.join(", ")}`] : []),
    `Assunto: ${email.assunto || "(o mesmo do e-mail respondido)"}`,
    ...(email.responderA ? ["Vai como resposta, na mesma conversa do e-mail original."] : []),
    "",
    email.corpo,
    "",
    "Nada sai sem o seu toque em Enviar.",
  ].join("\n");
}

function base64(bytes: Uint8Array): string {
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

const utf8 = (texto: string) => new TextEncoder().encode(texto);

// Cabeçalho com acento vai codificado (RFC 2047); ASCII puro vai como está.
function cabecalho(texto: string): string {
  return /^[\x20-\x7e]*$/.test(texto) ? texto : `=?UTF-8?B?${base64(utf8(texto))}?=`;
}

const semQuebra = (texto: string) => texto.replace(/[\r\n]+/g, " ").trim();

export interface Resposta {
  messageId: string;
  references: string;
}

// Mensagem RFC 2822 em texto puro, UTF-8. Numa resposta, In-Reply-To e
// References fazem o e-mail cair na mesma conversa para quem recebe.
export function montarMime(email: Email, assunto: string, resposta?: Resposta): string {
  const linhas = [
    `To: ${email.para.join(", ")}`,
    ...(email.cc.length ? [`Cc: ${email.cc.join(", ")}`] : []),
    `Subject: ${cabecalho(semQuebra(assunto))}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  const messageId = semQuebra(resposta?.messageId ?? "");
  if (messageId) {
    linhas.push(`In-Reply-To: ${messageId}`, `References: ${[semQuebra(resposta?.references ?? ""), messageId].filter(Boolean).join(" ")}`);
  }
  const corpo = base64(utf8(email.corpo.replace(/\n/g, "\r\n"))).replace(/.{1,76}/g, "$&\r\n");
  return `${linhas.join("\r\n")}\r\n\r\n${corpo}`;
}

// Formato "raw" da API do Gmail: base64url sem preenchimento.
export function paraBase64Url(texto: string): string {
  return base64(utf8(texto)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
