import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "./config.ts";
import { custosDaResposta, type RegistroUso } from "./custo.ts";
import { gerarDocumento, type Anexo, type Formato } from "./documentos.ts";
import type { Memoria, Mensagem } from "./memoria.ts";
import { INSTRUCOES_FIXAS, blocoVariavel } from "./prompt.ts";

type Msg = Anthropic.Beta.BetaMessageParam;

// Fallback do servidor: se o modelo recusar por política, a própria API
// reexecuta o pedido no modelo recomendado para aquela categoria.
const BETAS: Anthropic.Beta.AnthropicBeta[] = ["server-side-fallback-2026-07-01"];
// Consultar o banco costuma levar algumas voltas (estrutura → consulta →
// ajuste), então o teto é mais alto que o de uma conversa simples.
const MAX_VOLTAS_FERRAMENTA = 10;
const LIMITE_RESULTADO = 15_000;

export const SQL_TABELAS = `select c.relname as tabela, greatest(c.reltuples, 0)::bigint as linhas_aprox, obj_description(c.oid) as descricao
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('donboy', 'public') and c.relkind in ('r', 'v', 'm', 'p')
  and (has_table_privilege(c.oid, 'select') or has_any_column_privilege(c.oid, 'select'))
order by 1`;

export function sqlColunas(tabela: string): string {
  return `select column_name as coluna, data_type as tipo
from information_schema.columns
where table_schema in ('donboy', 'public') and table_name = '${tabela}'
order by table_schema, ordinal_position`;
}

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
  {
    name: "ver_estrutura_banco",
    description:
      "Mostra a estrutura do banco dos sistemas das empresas (CRM, financeiro, obras, RH, laboratório, integrações Omie). Com tabela vazia, lista as tabelas com o número aproximado de linhas; com o nome de uma tabela, lista as colunas e tipos. Use antes de consultar uma tabela que você ainda não conhece.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        tabela: { type: "string", description: "Nome da tabela, ou vazio para listar todas." },
      },
      required: ["tabela"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_banco",
    description:
      "Executa UMA consulta SELECT (PostgreSQL) no banco dos sistemas das empresas, só leitura, e devolve até 200 linhas em JSON. Prefira agregações (count, sum, group by) e só as colunas necessárias. Datas estão em UTC: para o horário de Brasília use \"coluna at time zone 'America/Sao_Paulo'\".",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "Uma única consulta SELECT, sem ponto e vírgula no meio." },
      },
      required: ["sql"],
      additionalProperties: false,
    },
  },
  {
    name: "gerar_documento",
    description:
      "Gera um documento e o envia ao dono no Telegram, logo depois da sua resposta. Use quando ele pedir um documento: contrato, proposta, ata, carta, relatório, roteiro, checklist. Word (docx) quando ele for editar ou assinar depois; PDF quando for enviar pronto. Na dúvida, docx.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título do documento; também vira o nome do arquivo." },
        formato: { type: "string", enum: ["docx", "pdf"] },
        conteudo: {
          type: "string",
          description:
            "Texto completo, pronto para uso. Formatação simples: '# ' título, '## ' subtítulo, '### ' seção, '- ' item de lista, linha em branco entre parágrafos, **negrito** dentro do texto.",
        },
      },
      required: ["titulo", "formato", "conteudo"],
      additionalProperties: false,
    },
  },
];

export interface RespostaTurno {
  texto: string;
  usos: RegistroUso[];
  fatosSalvos: number;
  anexos: Anexo[];
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
    const anexos: Anexo[] = [];
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
          anexos,
        };
      }

      if (resposta.stop_reason !== "tool_use") {
        const texto = extrairTexto(resposta.content);
        const cortada = resposta.stop_reason === "max_tokens" ? "\n\n(resposta cortada no limite de tamanho)" : "";
        return { texto: (texto || "(sem resposta)") + cortada, usos, fatosSalvos, anexos };
      }

      // Volta de ferramenta: devolve o turno do assistente sem alterar nada
      // (inclui os blocos de raciocínio) e responde a TODAS as chamadas numa
      // única mensagem.
      messages.push({ role: "assistant", content: resposta.content });
      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const bloco of resposta.content) {
        if (bloco.type !== "tool_use") continue;
        resultados.push(await this.executarFerramenta(bloco, anexos));
        if (bloco.name === "salvar_fato" && !resultados.at(-1)?.is_error) fatosSalvos++;
      }
      messages.push({ role: "user", content: resultados });
    }

    return {
      texto: "Parei: muitas voltas de ferramenta seguidas. Tente de novo com um pedido mais direto.",
      usos,
      fatosSalvos,
      anexos,
    };
  }

  private async executarFerramenta(
    bloco: Anthropic.Beta.BetaToolUseBlock,
    anexos: Anexo[],
  ): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
    const erro = (mensagem: string): Anthropic.Beta.BetaToolResultBlockParam => ({
      type: "tool_result",
      tool_use_id: bloco.id,
      is_error: true,
      content: mensagem,
    });

    if (bloco.name === "ver_estrutura_banco" || bloco.name === "consultar_banco") {
      const entrada = bloco.input as { tabela?: unknown; sql?: unknown };
      let sql: string;
      if (bloco.name === "consultar_banco") {
        sql = typeof entrada.sql === "string" ? entrada.sql.trim() : "";
        if (!sql) return erro("Informe a consulta SQL.");
      } else {
        const tabela = typeof entrada.tabela === "string" ? entrada.tabela.trim() : "";
        if (tabela && !/^[A-Za-z0-9_]+$/.test(tabela)) return erro("Nome de tabela inválido.");
        sql = tabela ? sqlColunas(tabela) : SQL_TABELAS;
      }
      try {
        const texto = JSON.stringify(await this.memoria.consultarBanco(sql));
        const conteudo =
          texto.length > LIMITE_RESULTADO
            ? `${texto.slice(0, LIMITE_RESULTADO)}\n[resultado cortado em ${LIMITE_RESULTADO} caracteres: refine a consulta, selecione menos colunas ou agregue]`
            : texto;
        return { type: "tool_result", tool_use_id: bloco.id, content: conteudo };
      } catch (e) {
        return erro(`Erro na consulta: ${(e as Error).message}`);
      }
    }

    if (bloco.name === "gerar_documento") {
      const entrada = bloco.input as { titulo?: unknown; formato?: unknown; conteudo?: unknown };
      const titulo = typeof entrada.titulo === "string" ? entrada.titulo.trim() : "";
      const conteudo = typeof entrada.conteudo === "string" ? entrada.conteudo : "";
      const formato = entrada.formato === "pdf" || entrada.formato === "docx" ? (entrada.formato as Formato) : null;
      if (!titulo || !conteudo.trim() || !formato) return erro("Informe titulo, formato (docx ou pdf) e conteudo.");
      try {
        const anexo = await gerarDocumento(titulo, formato, conteudo);
        anexos.push(anexo);
        return {
          type: "tool_result",
          tool_use_id: bloco.id,
          content: `Documento ${anexo.nome} gerado; será enviado logo depois da sua resposta.`,
        };
      } catch (e) {
        return erro(`Falha ao gerar o documento: ${(e as Error).message}`);
      }
    }

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
