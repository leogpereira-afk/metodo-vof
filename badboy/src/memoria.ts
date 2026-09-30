import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "./config.ts";
import type { RegistroUso, ResumoMes } from "./custo.ts";

export type Papel = "user" | "assistant";

export interface Mensagem {
  papel: Papel;
  conteudo: string;
}

export interface Fato {
  id: number;
  conteudo: string;
  origem: "comando" | "conversa";
  criadoEm: string;
}

// Janela do histórico enviada ao Claude: entre JANELA_MIN e
// JANELA_MIN + JANELA_PASSO - 1 mensagens. O início só anda de PASSO em PASSO,
// então por ~20 mensagens o começo da conversa enviada é idêntico e o cache
// do prompt continua valendo (uma janela que desliza 1 a 1 quebraria o cache
// a cada turno).
export const JANELA_MIN = 20;
export const JANELA_PASSO = 20;

export function tamanhoJanela(total: number): number {
  if (total <= JANELA_MIN) return total;
  return JANELA_MIN + ((total - JANELA_MIN) % JANELA_PASSO);
}

export class Memoria {
  private readonly db: SupabaseClient;

  constructor(config: Pick<Config, "supabaseUrl" | "supabaseChave">) {
    this.db = createClient(config.supabaseUrl, config.supabaseChave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async salvarMensagem(chatId: number, papel: Papel, conteudo: string): Promise<void> {
    const { error } = await this.db.from("badboy_mensagens").insert({ chat_id: chatId, papel, conteudo });
    if (error) throw new Error(`Supabase (salvar mensagem): ${error.message}`);
  }

  async historico(chatId: number): Promise<Mensagem[]> {
    const { count, error: erroContagem } = await this.db
      .from("badboy_mensagens")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", chatId);
    if (erroContagem) throw new Error(`Supabase (contar histórico): ${erroContagem.message}`);

    const quantas = tamanhoJanela(count ?? 0);
    if (quantas === 0) return [];

    const { data, error } = await this.db
      .from("badboy_mensagens")
      .select("papel, conteudo")
      .eq("chat_id", chatId)
      .order("id", { ascending: false })
      .limit(quantas);
    if (error) throw new Error(`Supabase (ler histórico): ${error.message}`);

    const mensagens = (data ?? []).reverse() as Mensagem[];
    // A conversa enviada ao Claude precisa começar com o usuário.
    while (mensagens[0]?.papel === "assistant") mensagens.shift();
    return mensagens;
  }

  async apagarHistorico(chatId: number): Promise<number> {
    const { count, error } = await this.db
      .from("badboy_mensagens")
      .delete({ count: "exact" })
      .eq("chat_id", chatId);
    if (error) throw new Error(`Supabase (apagar histórico): ${error.message}`);
    return count ?? 0;
  }

  async salvarFato(conteudo: string, origem: Fato["origem"]): Promise<number> {
    const { data, error } = await this.db
      .from("badboy_fatos")
      .insert({ conteudo, origem })
      .select("id")
      .single();
    if (error) throw new Error(`Supabase (salvar fato): ${error.message}`);
    return data.id as number;
  }

  async listarFatos(): Promise<Fato[]> {
    const { data, error } = await this.db
      .from("badboy_fatos")
      .select("id, conteudo, origem, criado_em")
      .order("id", { ascending: true });
    if (error) throw new Error(`Supabase (listar fatos): ${error.message}`);
    return (data ?? []).map((f) => ({
      id: f.id as number,
      conteudo: f.conteudo as string,
      origem: f.origem as Fato["origem"],
      criadoEm: f.criado_em as string,
    }));
  }

  async buscarFato(id: number): Promise<Fato | null> {
    const { data, error } = await this.db
      .from("badboy_fatos")
      .select("id, conteudo, origem, criado_em")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Supabase (buscar fato): ${error.message}`);
    if (!data) return null;
    return {
      id: data.id as number,
      conteudo: data.conteudo as string,
      origem: data.origem as Fato["origem"],
      criadoEm: data.criado_em as string,
    };
  }

  async apagarFato(id: number): Promise<boolean> {
    const { count, error } = await this.db.from("badboy_fatos").delete({ count: "exact" }).eq("id", id);
    if (error) throw new Error(`Supabase (apagar fato): ${error.message}`);
    return (count ?? 0) > 0;
  }

  async registrarUso(registros: RegistroUso[]): Promise<void> {
    if (registros.length === 0) return;
    const { error } = await this.db.from("badboy_uso").insert(
      registros.map((r) => ({
        modelo: r.modelo,
        input_tokens: r.inputTokens,
        output_tokens: r.outputTokens,
        cache_write_tokens: r.cacheWriteTokens,
        cache_read_tokens: r.cacheReadTokens,
        custo_usd: Number(r.custoUsd.toFixed(6)),
      })),
    );
    if (error) throw new Error(`Supabase (registrar uso): ${error.message}`);
  }

  // Consulta aos sistemas das empresas, só leitura: roda como donboy_leitor
  // (sem senhas, tokens e configurações) e por GET, que o PostgREST executa
  // em transação READ ONLY. A função no banco recusa qualquer outro caminho.
  async consultarBanco(sql: string): Promise<unknown> {
    const { data, error } = await this.db.rpc("badboy_consultar", { p_sql: sql }, { get: true });
    if (error) throw new Error(error.message);
    return data;
  }

  // O que mudou nas últimas horas nos sistemas deste projeto (mesmas travas
  // de consultarBanco: papel de leitura e GET).
  async novidades(horas: number): Promise<unknown> {
    const { data, error } = await this.db.rpc("badboy_novidades", { p_horas: horas }, { get: true });
    if (error) throw new Error(error.message);
    return data;
  }

  // Segredo do Vault (só os com prefixo donboy_), como o token da ponte.
  async segredo(nome: string): Promise<string | null> {
    const { data, error } = await this.db.rpc("badboy_segredo", { p_nome: nome }, { get: true });
    if (error) throw new Error(`Supabase (segredo): ${error.message}`);
    return (data as string | null) ?? null;
  }

  async resumoDoMes(fuso: string): Promise<ResumoMes> {
    const { data, error } = await this.db.rpc("badboy_resumo_custo_mes", { p_fuso: fuso }).single();
    if (error) throw new Error(`Supabase (resumo do mês): ${error.message}`);
    const r = data as Record<string, number | string>;
    return {
      chamadas: Number(r.chamadas),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      cacheWriteTokens: Number(r.cache_write_tokens),
      cacheReadTokens: Number(r.cache_read_tokens),
      custoUsd: Number(r.custo_usd),
    };
  }
}
