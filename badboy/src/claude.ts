import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "./config.ts";
import { custosDaResposta, type RegistroUso } from "./custo.ts";
import type { Memoria, Mensagem } from "./memoria.ts";
import { INSTRUCOES_FIXAS, blocoVariavel } from "./prompt.ts";

type Msg = Anthropic.Beta.BetaMessageParam;

// Fallback do servidor: se o modelo recusar por política, a própria API
// reexecuta o pedido no modelo recomendado para aquela categoria.
const BETAS: Anthropic.Beta.AnthropicBeta[] = ["server-side-fallback-2026-07-01"];
const MAX_VOLTAS_FERRAMENTA = 5;

// Lista de ferramentas fixa e sempre na mesma ordem: ela faz parte do
// prefixo cacheado.
const FERRAMENTAS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "salvar_fato",
    description:
      "Salva na memória permanente um fato duradouro sobre o dono (preferência, pessoa, empresa, meta, rotina, data importante ou decisão). Use quando ele disser algo que vale lembrar em conversas futuras e que ainda não está em FATOS CONHECIDOS.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        fato: {
          type: "string",
          description: "O fato em uma frase curta, autocontida, em terceira pessoa.",
        },
      },
      required: ["fato"],
      additionalProperties: false,
    },
  },
];

export interface RespostaTurno {
  texto: string;
  usos: RegistroUso[];
  fatosSalvos: number;
}

export class Cerebro {
  private readonly client: Anthropic;

  constructor(
    private readonly config: Pick<Config, "anthropicApiKey" | "modelo" | "esforco">,
    private readonly memoria: Memoria,
  ) {
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
  }

  async responder(historico: Mensagem[], hoje: string): Promise<RespostaTurno> {
    const fatos = await this.memoria.listarFatos();

    // Ordem do prefixo: ferramentas → instruções fixas (ponto de cache
    // explícito) → fatos + data → conversa (cache automático no fim).
    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: "text", text: INSTRUCOES_FIXAS, cache_control: { type: "ephemeral" } },
      { type: "text", text: blocoVariavel(fatos, hoje) },
    ];

    const messages: Msg[] = historico.map((m) => ({ role: m.papel, content: m.conteudo }));
    const usos: RegistroUso[] = [];
    let fatosSalvos = 0;

    for (let volta = 0; volta <= MAX_VOLTAS_FERRAMENTA; volta++) {
      const resposta = await this.client.beta.messages.create({
        model: this.config.modelo,
        max_tokens: 16000,
        betas: BETAS,
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: this.config.esforco },
        cache_control: { type: "ephemeral" },
        system,
        tools: FERRAMENTAS,
        messages,
      });
      // Registra o gasto a cada chamada: se uma volta seguinte falhar, o que
      // já foi cobrado não some do /custo.
      const custos = custosDaResposta(resposta);
      usos.push(...custos);
      await this.memoria.registrarUso(custos).catch((e: Error) =>
        console.error("Falha ao registrar uso:", e.message),
      );

      if (resposta.stop_reason === "refusal") {
        return {
          texto: "Não consigo ajudar com esse pedido específico. Reformule ou siga por outro caminho.",
          usos,
          fatosSalvos,
        };
      }

      if (resposta.stop_reason !== "tool_use") {
        const texto = extrairTexto(resposta.content);
        const cortada = resposta.stop_reason === "max_tokens" ? "\n\n(resposta cortada no limite de tamanho)" : "";
        return { texto: (texto || "(sem resposta)") + cortada, usos, fatosSalvos };
      }

      // Volta de ferramenta: devolve o turno do assistente sem alterar nada
      // (inclui os blocos de raciocínio) e responde a TODAS as chamadas numa
      // única mensagem.
      messages.push({ role: "assistant", content: resposta.content });
      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const bloco of resposta.content) {
        if (bloco.type !== "tool_use") continue;
        resultados.push(await this.executarFerramenta(bloco));
        if (bloco.name === "salvar_fato" && !resultados.at(-1)?.is_error) fatosSalvos++;
      }
      messages.push({ role: "user", content: resultados });
    }

    return {
      texto: "Parei: muitas voltas de ferramenta seguidas. Tente de novo com um pedido mais direto.",
      usos,
      fatosSalvos,
    };
  }

  private async executarFerramenta(
    bloco: Anthropic.Beta.BetaToolUseBlock,
  ): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
    const erro = (mensagem: string): Anthropic.Beta.BetaToolResultBlockParam => ({
      type: "tool_result",
      tool_use_id: bloco.id,
      is_error: true,
      content: mensagem,
    });

    if (bloco.name !== "salvar_fato") return erro(`Ferramenta desconhecida: ${bloco.name}`);

    const entrada = bloco.input as { fato?: unknown };
    const fato = typeof entrada.fato === "string" ? entrada.fato.trim() : "";
    if (!fato || fato.length > 1000) return erro("O campo 'fato' precisa ter entre 1 e 1000 caracteres.");

    try {
      const id = await this.memoria.salvarFato(fato, "conversa");
      return { type: "tool_result", tool_use_id: bloco.id, content: `Fato salvo com o número ${id}.` };
    } catch (e) {
      return erro(`Falha ao salvar: ${(e as Error).message}`);
    }
  }
}

function extrairTexto(conteudo: Anthropic.Beta.BetaContentBlock[]): string {
  return conteudo
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
