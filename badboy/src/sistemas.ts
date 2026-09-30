// Acesso de leitura aos sistemas, nos dois projetos Supabase.
//
// "principal" é o projeto onde o Don Boy mora: consulta direta pela Memoria.
// "segundo" é o outro projeto: consulta pela Edge Function donboy-ponte de
// lá, que confere um token e roda a mesma consulta somente leitura. O token
// fica no Vault do principal (badboy_segredo), nunca no código.

import type { Email } from "./email.ts";
import type { Memoria } from "./memoria.ts";

export const SISTEMAS = ["principal", "segundo"] as const;
export type Sistema = (typeof SISTEMAS)[number];

export const SEGREDO_PONTE = "donboy_ponte_segundo";

export interface Novidades {
  sistema: Sistema;
  ok: boolean;
  tabelas?: unknown;
  erro?: string;
}

export interface Lembrete {
  titulo: string;
  data: string;
  hora: string;
  duracaoMin: number;
  nota: string;
}

export const TIPOS_ERP = ["os", "orcamento", "cliente", "fornecedor"] as const;
export type TipoErp = (typeof TIPOS_ERP)[number];

export interface Solicitacao {
  itens: { descricao: string; qtd: number; unid: string }[];
  setor: string;
  urgencia: "normal" | "urgente" | "critica";
  necessidadeEm: string;
  justificativa: string;
  obra: string;
}

type Buscar = typeof fetch;

export class Sistemas {
  private token: Promise<string> | null = null;

  constructor(
    private readonly memoria: Pick<Memoria, "consultarBanco" | "novidades" | "segredo">,
    private readonly urlPonte: string,
    private readonly buscar: Buscar = fetch,
  ) {}

  async consultar(sistema: Sistema, sql: string): Promise<unknown> {
    if (sistema === "principal") return await this.memoria.consultarBanco(sql);
    return await this.ponte({ acao: "consultar", sql });
  }

  // O que mudou nas últimas horas, nos dois sistemas. Um sistema fora do ar
  // não esconde o outro: cada um volta com ok e o erro.
  async novidades(horas: number): Promise<Novidades[]> {
    const tentar = async (sistema: Sistema, buscar: () => Promise<unknown>): Promise<Novidades> => {
      try {
        return { sistema, ok: true, tabelas: await buscar() };
      } catch (e) {
        return { sistema, ok: false, erro: (e as Error).message };
      }
    };
    return await Promise.all([
      tentar("principal", () => this.memoria.novidades(horas)),
      tentar("segundo", () => this.ponte({ acao: "novidades", horas })),
    ]);
  }

  // Agenda e Gmail do dono, pela conexão Google que a Central do Léo já tem
  // no segundo projeto (a ponte usa a chave de lá; nada vem para cá).
  async agenda(de: string, ate: string): Promise<unknown> {
    return await this.ponte({ acao: "agenda", de, ate });
  }

  async buscarEmails(consulta: string, quantos: number): Promise<unknown> {
    return await this.ponte({ acao: "gmail_buscar", consulta, quantos });
  }

  async lerEmail(id: string): Promise<unknown> {
    return await this.ponte({ acao: "gmail_ler", id });
  }

  // Lembrete do dono para ele mesmo, num calendário só do Don Boy.
  async criarLembrete(lembrete: Lembrete): Promise<unknown> {
    return await this.ponte({ acao: "agenda_lembrete", lembrete });
  }

  // ERP (Mubisys) ao vivo: uma O.S. ou um orçamento pelo número, um cliente
  // ou fornecedor pelo CPF/CNPJ. Lento (até ~1 min); relatório vem das visões.
  async consultarErp(tipo: TipoErp, chave: string): Promise<unknown> {
    return await this.ponte({ acao: "mubisys", tipo, chave });
  }

  // Solicitação de material ao módulo Compras. Só depois do botão do dono.
  async solicitarCompra(solicitacao: Solicitacao): Promise<{ codigo?: string; numero?: number }> {
    return (await this.ponte({ acao: "compras_solicitar", solicitacao })) as { codigo?: string; numero?: number };
  }

  // Envio de e-mail pela mesma conexão Google. Só é chamado depois do toque
  // do dono no botão "Enviar" (bot.ts); o Claude apenas prepara o e-mail.
  async enviarEmail(email: Email): Promise<unknown> {
    return await this.ponte({ acao: "gmail_enviar", email });
  }

  private async ponte(corpo: Record<string, unknown>): Promise<unknown> {
    const token = await this.tokenDaPonte();
    const resposta = await this.buscar(this.urlPonte, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-donboy-token": token },
      body: JSON.stringify(corpo),
    });
    const dados = (await resposta.json().catch(() => ({}))) as { dados?: unknown; erro?: string };
    if (resposta.status === 401) {
      this.token = null; // token trocado no Vault: relê na próxima
      throw new Error("segundo sistema recusou o acesso da ponte");
    }
    if (!resposta.ok) throw new Error(dados.erro || `segundo sistema respondeu ${resposta.status}`);
    return dados.dados;
  }

  private tokenDaPonte(): Promise<string> {
    this.token ??= this.memoria.segredo(SEGREDO_PONTE).then((valor) => {
      if (!valor) throw new Error("ponte para o segundo sistema ainda não configurada");
      return valor;
    });
    this.token.catch(() => {
      this.token = null;
    });
    return this.token;
  }
}
