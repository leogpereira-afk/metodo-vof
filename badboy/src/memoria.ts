import type {AnexoRecebido} from "./midia.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "./config.ts";
import type { RegistroUso, ResumoMes } from "./custo.ts";

export type Papel = "user" | "assistant";

export interface Mensagem {
  anexos?: AnexoRecebido[];
  papel: Papel;
  conteudo: string;
  // Quando foi gravada (ISO). Vai para o Claude como carimbo nas mensagens do dono.
  em?: string;
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

  async salvarMensagem(chatId: number, papel: Papel, conteudo: string, anexos: AnexoRecebido[] = []): Promise<number> {
    const { data, error } = await this.db
      .from("badboy_mensagens")
      .insert({ chat_id: chatId, papel, conteudo, anexos })
      .select("id")
      .single();
    if (error) throw new Error(`Supabase (salvar mensagem): ${error.message}`);
    return data.id as number;
  }

  // Se o dono (ou uma rotina em nome dele) já mandou este texto desde a data.
  async jaPediu(chatId: number, conteudo: string, desde: Date): Promise<boolean> {
    const { count, error } = await this.db
      .from("badboy_mensagens")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", chatId)
      .eq("papel", "user")
      .eq("conteudo", conteudo)
      .gte("criada_em", desde.toISOString());
    if (error) throw new Error(`Supabase (rotina): ${error.message}`);
    return (count ?? 0) > 0;
  }

  // Id da mensagem mais recente do dono na conversa.
  async ultimaDoDono(chatId: number): Promise<number | null> {
    const { data, error } = await this.db
      .from("badboy_mensagens")
      .select("id")
      .eq("chat_id", chatId)
      .eq("papel", "user")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Supabase (última mensagem): ${error.message}`);
    return (data?.id as number | undefined) ?? null;
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
      .select("papel, conteudo, criada_em, anexos")
      .eq("chat_id", chatId)
      .order("id", { ascending: false })
      .limit(quantas);
    if (error) throw new Error(`Supabase (ler histórico): ${error.message}`);

    const mensagens: Mensagem[] = (data ?? [])
      .reverse()
      .map((m) => ({ papel: m.papel as Papel, conteudo: m.conteudo as string, em: m.criada_em as string, anexos: m.anexos as AnexoRecebido[] }));
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

  // Ação irreversível preparada pelo Claude, esperando o botão do dono.
  async criarPendente(tipo: "email" | "fatos" | "compra" | "central", dados: unknown): Promise<number> {
    const { data, error } = await this.db.from("badboy_pendentes").insert({ tipo, dados }).select("id").single();
    if (error) throw new Error(`Supabase (criar pendente): ${error.message}`);
    return data.id as number;
  }

  // Reserva a ação para executar: um UPDATE só, que só acha a linha se ela
  // ainda não foi executada. Dois toques no botão: o segundo volta null.
  async reservarPendente(id: number, tipo: string): Promise<{ tipo: string; dados: unknown } | null> {
    const { data, error } = await this.db.rpc("badboy_reservar_acao", { p_id: id, p_tipo: tipo }).maybeSingle();
    if (error) throw new Error(`Supabase (reservar): ${error.message}`);
    return data as { tipo: string; dados: unknown } | null;
  }

  async concluirPendente(
    id: number,
    resultado: string,
    estado: "concluido" | "falhou" | "incerto" = "concluido",
  ): Promise<void> {
    const { error } = await this.db.from("badboy_pendentes").update({
      estado,
      resultado: resultado.slice(0, 1000),
      executado_em: estado === "concluido" ? new Date().toISOString() : null,
    }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async buscarHistorico(chatId: number, termo: string) {
    if (termo.trim().length < 3 || termo.length > 100) throw new Error("Use um termo de 3 a 100 caracteres.");
    const { data, error } = await this.db.from("badboy_mensagens").select("id,papel,conteudo,criada_em").eq(
      "chat_id",
      chatId,
    ).ilike("conteudo", "%" + termo.replace(/[\\%_]/g, "\\$&") + "%").order("id", { ascending: false }).limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async listarTarefas(estado = "todas") {
    let q = this.db.from("badboy_tarefas").select("*").order("atualizado_em", { ascending: false }).limit(100);
    if (estado !== "todas") q = q.eq("estado", estado);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async registrarTarefa(entrada: Record<string, unknown>) {
    const { id, ...dados } = entrada;
    const q = Number(id) > 0
      ? this.db.from("badboy_tarefas").update({ ...dados, atualizado_em: new Date().toISOString() }).eq(
        "id",
        Number(id),
      )
      : this.db.from("badboy_tarefas").insert(dados);
    const { data, error } = await q.select("*").single();
    if (error) throw new Error(error.message);
    return data;
  }

  async enfileirar(chave: string, chatId: number, payload: unknown) {
    const { error } = await this.db.rpc("badboy_enfileirar", { p_chave: chave, p_chat_id: chatId, p_payload: payload });
    if (error) throw new Error(error.message);
  }
  async reservarTrabalho(): Promise<{ id: number; chat_id: number; payload: Record<string, unknown> } | null> {
    const { data, error } = await this.db.rpc("badboy_reservar_trabalho").maybeSingle();
    if (error) throw new Error(error.message);
    return data as never;
  }
  async concluirTrabalho(id: number, erro?: string) {
    const { error } = await this.db.from("badboy_fila").update({
      estado: erro ? "falhou" : "concluido",
      erro: erro?.slice(0, 500) ?? null,
      finalizado_em: new Date().toISOString(),
    }).eq("id", id);
    if (error) throw new Error(error.message);
  }
  async registrarTurno(id: string, dados: Record<string, unknown>) {
    const { error } = await this.db.from("badboy_turnos").upsert({ id, ...dados });
    if (error) throw new Error(error.message);
  }

  async consultarConhecimentoMubisys(consulta: string, documento = "", inicio = 0): Promise<unknown> {
    if (documento) {
      if (documento.length > 250 || !Number.isSafeInteger(inicio) || inicio < 0) {
        throw new Error("Documento ou página inválida.");
      }
      const { data, error } = await this.db.rpc("badboy_conhecimento_ler", {
        p_documento: documento,
        p_inicio: inicio,
        p_quantidade: 2,
      });
      if (error) throw new Error(error.message);
      return data;
    }
    if (!consulta.trim()) {
      const { data, error } = await this.db.from("badboy_conhecimento_documentos").select(
        "chave,titulo,origem,data_base,caracteres",
      ).order("chave");
      if (error) throw new Error(error.message);
      return { tipo: "indice_referencia_historica", documentos: data };
    }
    const { data, error } = await this.db.rpc("badboy_conhecimento_buscar", {
      p_consulta: consulta.slice(0, 300),
      p_limite: 3,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async registrarUsoMidia(tipo:string,modelo:string,uso:unknown):Promise<void> {
    const {error}=await this.db.from("badboy_midia_uso").insert({tipo,modelo,uso});
    if(error)throw Error("Não foi possível registrar uso de mídia.");
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
