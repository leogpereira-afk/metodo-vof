// Utilitários puros (sem rede), testados em tests/.

export const LIMITE_TELEGRAM = 4096;

// Divide um texto longo em partes que cabem numa mensagem do Telegram,
// preferindo quebrar em parágrafo, depois em linha, depois em espaço.
export function dividirMensagem(texto: string, limite = LIMITE_TELEGRAM): string[] {
  const partes: string[] = [];
  let resto = texto;
  while (resto.length > limite) {
    const janela = resto.slice(0, limite);
    let corte = janela.lastIndexOf("\n\n");
    if (corte < limite / 2) corte = janela.lastIndexOf("\n");
    if (corte < limite / 2) corte = janela.lastIndexOf(" ");
    if (corte < limite / 2) corte = limite;
    partes.push(resto.slice(0, corte).trimEnd());
    resto = resto.slice(corte).trimStart();
  }
  if (resto.length > 0) partes.push(resto);
  return partes;
}

// Botões de confirmação para ações irreversíveis. O callback_data leva a
// ação, o alvo e o horário em que o botão foi criado; botão velho expira.
export const VALIDADE_CONFIRMACAO_S = 10 * 60;

export type AcaoIrreversivel =
  | { tipo: "esquecer"; fatoId: number }
  | { tipo: "limpar" }
  | { tipo: "email"; pendenteId: number };

export function codificarConfirmacao(acao: AcaoIrreversivel, agoraS: number): string {
  const alvo = acao.tipo === "esquecer" ? String(acao.fatoId) : acao.tipo === "email" ? String(acao.pendenteId) : "-";
  return `ok:${acao.tipo}:${alvo}:${agoraS}`;
}

export type LeituraConfirmacao =
  | { valida: true; acao: AcaoIrreversivel }
  | { valida: false; motivo: "expirada" | "invalida" };

export function lerConfirmacao(dado: string, agoraS: number): LeituraConfirmacao {
  const m = /^ok:(esquecer|limpar|email):(\d+|-):(\d+)$/.exec(dado);
  if (!m) return { valida: false, motivo: "invalida" };
  const [, tipo, alvo, criadoEm] = m;
  const idade = agoraS - Number(criadoEm);
  if (idade < 0 || idade > VALIDADE_CONFIRMACAO_S) return { valida: false, motivo: "expirada" };
  if (tipo === "limpar") return alvo === "-" ? { valida: true, acao: { tipo } } : { valida: false, motivo: "invalida" };
  if (alvo === "-") return { valida: false, motivo: "invalida" };
  if (tipo === "email") return { valida: true, acao: { tipo, pendenteId: Number(alvo) } };
  return { valida: true, acao: { tipo: "esquecer", fatoId: Number(alvo) } };
}

export const CANCELAR = "cancelar";

export function dataPorExtenso(data: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(data);
}

export function mesPorExtenso(data: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, month: "long", year: "numeric" }).format(data);
}
