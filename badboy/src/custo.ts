import type Anthropic from "@anthropic-ai/sdk";

// Preços por milhão de tokens (US$), API da Anthropic. Escrita em cache:
// 1,25× a entrada (TTL 5 min) ou 2× (TTL 1 h); leitura de cache à parte.
// Revisar quando trocar de modelo: https://claude.com/pricing
interface Preco {
  entrada: number;
  saida: number;
  leituraCache: number;
}

const PRECOS: Record<string, Preco> = {
  "claude-sonnet-5-5": { entrada: 2, saida: 10, leituraCache: 0.2 },
  "claude-sonnet-5": { entrada: 2, saida: 10, leituraCache: 0.2 },
  "claude-opus-5-5": { entrada: 4, saida: 20, leituraCache: 0.2 },
  "claude-opus-5": { entrada: 5, saida: 25, leituraCache: 0.5 },
  "claude-opus-4-8": { entrada: 5, saida: 25, leituraCache: 0.5 },
  "claude-haiku-4-5": { entrada: 1, saida: 5, leituraCache: 0.1 },
};

export interface RegistroUso {
  modelo: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  custoUsd: number;
}

interface UsoParcial {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation?: Anthropic.Beta.BetaCacheCreation | null;
}

function precoDe(modelo: string): Preco {
  // Modelo sem preço cadastrado: cobra como o mais caro da tabela, para o
  // /custo nunca subestimar o gasto.
  return PRECOS[modelo] ?? { entrada: 5, saida: 25, leituraCache: 0.5 };
}

export function calcularCusto(modelo: string, uso: UsoParcial): RegistroUso {
  const p = precoDe(modelo);
  const escrita = uso.cache_creation_input_tokens ?? 0;
  const escrita1h = uso.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const escrita5m = escrita - escrita1h;
  const leitura = uso.cache_read_input_tokens ?? 0;

  const custo =
    (uso.input_tokens * p.entrada +
      uso.output_tokens * p.saida +
      escrita5m * p.entrada * 1.25 +
      escrita1h * p.entrada * 2 +
      leitura * p.leituraCache) /
    1_000_000;

  return {
    modelo,
    inputTokens: uso.input_tokens,
    outputTokens: uso.output_tokens,
    cacheWriteTokens: escrita,
    cacheReadTokens: leitura,
    custoUsd: custo,
  };
}

// Pesquisa na internet: US$ 10 por mil buscas, além dos tokens. Ler uma
// página (web_fetch) custa só os tokens.
export const CUSTO_BUSCA_USD = 0.01;

// Uma resposta pode ter passado por mais de um modelo (fallback do servidor
// após recusa). Quando a API detalha as iterações, cada uma é cobrada pelo
// modelo que a rodou; senão, o total vai para o modelo que respondeu. As
// buscas na internet entram no último registro.
export function custosDaResposta(resposta: Anthropic.Beta.BetaMessage): RegistroUso[] {
  const iteracoes = (resposta.usage.iterations ?? []).filter(
    (it) => it.type === "message" || it.type === "fallback_message",
  );
  const registros =
    iteracoes.length === 0
      ? [calcularCusto(resposta.model, resposta.usage)]
      : iteracoes.map((it) => {
          const modelo = ("model" in it && it.model) || resposta.model;
          return calcularCusto(modelo, it as UsoParcial);
        });
  const buscas = resposta.usage.server_tool_use?.web_search_requests ?? 0;
  registros[registros.length - 1]!.custoUsd += buscas * CUSTO_BUSCA_USD;
  return registros;
}

const usd = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const inteiro = new Intl.NumberFormat("pt-BR");

export interface ResumoMes {
  chamadas: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  custoUsd: number;
}

export function formatarResumo(r: ResumoMes, mesAno: string): string {
  const entradaTotal = r.inputTokens + r.cacheWriteTokens + r.cacheReadTokens;
  const taxaCache = entradaTotal > 0 ? Math.round((r.cacheReadTokens / entradaTotal) * 100) : 0;
  return [
    `💰 ${usd.format(r.custoUsd)} gastos em ${mesAno}`,
    "",
    `• Chamadas à API: ${inteiro.format(r.chamadas)}`,
    `• Entrada: ${inteiro.format(r.inputTokens)} tokens`,
    `• Saída: ${inteiro.format(r.outputTokens)} tokens`,
    `• Cache (escrita/leitura): ${inteiro.format(r.cacheWriteTokens)} / ${inteiro.format(r.cacheReadTokens)}`,
    `• Entrada servida do cache: ${taxaCache}%`,
  ].join("\n");
}
