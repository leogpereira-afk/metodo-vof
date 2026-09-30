// Solicitação de material ao módulo Compras, preparada pelo Don Boy e enviada
// só depois do toque do dono em "Solicitar". Funções puras (sem rede).

import type { Solicitacao } from "./sistemas.ts";

export const URGENCIAS = ["normal", "urgente", "critica"] as const;
export const MAX_ITENS_COMPRA = 40;

export type ValidacaoCompra = { ok: true; solicitacao: Solicitacao } | { ok: false; erro: string };

export function validarSolicitacao(entrada: unknown): ValidacaoCompra {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const texto = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const brutos = Array.isArray(e.itens) ? e.itens : [];
  if (brutos.length > MAX_ITENS_COMPRA) return { ok: false, erro: `No máximo ${MAX_ITENS_COMPRA} itens por solicitação.` };
  const itens = brutos.map((i) => {
    const item = (i ?? {}) as Record<string, unknown>;
    return { descricao: texto(item.descricao, 300), qtd: Number(String(item.qtd ?? "").replace(",", ".")), unid: texto(item.unid, 10) || "un" };
  });
  if (itens.length === 0) return { ok: false, erro: "Inclua ao menos um item." };
  const ruim = itens.find((i) => !i.descricao || !Number.isFinite(i.qtd) || i.qtd <= 0);
  if (ruim) return { ok: false, erro: "Cada item precisa de descrição e quantidade positiva." };
  const urgencia = URGENCIAS.includes(e.urgencia as (typeof URGENCIAS)[number]) ? (e.urgencia as Solicitacao["urgencia"]) : "normal";
  const necessidadeEm = texto(e.necessidadeEm, 10);
  if (necessidadeEm && !/^\d{4}-\d{2}-\d{2}$/.test(necessidadeEm)) return { ok: false, erro: "Data de necessidade em AAAA-MM-DD." };
  const justificativa = texto(e.justificativa, 800);
  if (!justificativa) return { ok: false, erro: "Diga para que é o material (O.S., cliente, obra ou reposição)." };
  return {
    ok: true,
    solicitacao: { itens, setor: texto(e.setor, 60), urgencia, necessidadeEm, justificativa, obra: texto(e.obra, 120) || "Produção" },
  };
}

const ROTULO_URGENCIA = { normal: "normal", urgente: "⚠️ urgente", critica: "🚨 crítica" };

// O que o dono vê antes de tocar em "Solicitar".
export function previaSolicitacao(s: Solicitacao): string {
  const data = s.necessidadeEm ? s.necessidadeEm.split("-").reverse().join("/") : "sem data";
  return [
    "🛒 SOLICITAÇÃO DE COMPRA",
    "",
    ...s.itens.map((i) => `• ${String(i.qtd).replace(".", ",")} ${i.unid} de ${i.descricao}`),
    "",
    `Para: ${s.justificativa}`,
    `Setor: ${s.setor || "não informado"} · Obra: ${s.obra}`,
    `Urgência: ${ROTULO_URGENCIA[s.urgencia]} · Precisa até: ${data}`,
    "",
    "Vai para o módulo Compras como uma solicitação nova, em seu nome; o comprador cota e emite a ordem. Nada é comprado sem ele.",
  ].join("\n");
}
