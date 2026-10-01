import { dataValida } from "./financeiro.ts";
const CAMPOS: Record<string, string[]> = {
  hotel: ["nome", "entrada", "saida", "reserva", "valor", "endereco", "telefone", "cafe", "horaEnt", "horaSai", "obs"],
  viagem: ["cidade", "ida", "volta", "tipo", "status", "obs", "internacional", "transporte", "evento"],
  demanda: ["titulo", "prazo", "prioridade", "status", "obs"],
};
export interface RegistroCentral {
  tipo: string;
  id: string;
  esperado: unknown;
  dados: Record<string, unknown>;
  chave: string;
}
export function validarRegistroCentral(tipo: string, id: string, dados: unknown): Record<string, unknown> {
  if (!CAMPOS[tipo]) throw new Error("Tipo não permitido.");
  if (tipo === "hotel" && !id) throw new Error("Consulte primeiro o ID exato da viagem.");
  if (id.length > 150 || !dados || typeof dados !== "object" || Array.isArray(dados)) {
    throw new Error("Registro inválido.");
  }
  const r = { ...dados } as Record<string, unknown>;
  if (!Object.keys(r).length) throw new Error("Nenhum campo informado.");
  for (const [k, v] of Object.entries(r)) {
    if (!CAMPOS[tipo]!.includes(k)) throw new Error("Campo não permitido: " + k);
    if (["entrada", "saida", "ida", "volta", "prazo"].includes(k) && !dataValida(String(v))) {
      throw new Error("Data inválida: " + k);
    }
    if (k === "valor") {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new Error("Valor inválido.");
    } else if (k === "internacional") { if (typeof v !== "boolean") throw new Error("Campo inválido: " + k); }
    else if (typeof v !== "string" || v.length > 4000) throw new Error("Texto inválido: " + k);
  }
  if (tipo === "hotel" && (!r.nome || !r.entrada || !r.saida || String(r.saida) <= String(r.entrada))) {
    throw new Error("Informe hotel e período válido.");
  }
  if (!id && tipo === "viagem" && !r.cidade) throw new Error("Informe a cidade.");
  if (!id && tipo === "demanda" && !r.titulo) throw new Error("Informe o título.");
  if (r.ida && r.volta && String(r.volta) < String(r.ida)) throw new Error("Volta anterior à ida.");
  if (tipo === "demanda") {
    if (r.status && !["Aberta", "Fazendo", "Parada", "Concluída"].includes(String(r.status))) {
      throw new Error("Status inválido para demanda.");
    }
    if (r.prioridade && !["Alta", "Média", "Baixa"].includes(String(r.prioridade))) {
      throw new Error("Prioridade inválida.");
    }
    if (!id) {
      r.status ??= "Aberta";
      r.prioridade ??= "Média";
    }
  }
  if (tipo === "viagem" && !id) r.status ??= "Em Planejamento";
  return r;
}
export function previaRegistroCentral(r: RegistroCentral): string {
  const alvo = r.esperado as Record<string, unknown> | null;
  return [
    "REGISTRAR NA CENTRAL DO LÉO",
    `Tipo: ${r.tipo}`,
    `Cadastro: ${alvo?.cidade ?? alvo?.titulo ?? r.id}`,
    "",
    ...Object.entries(r.dados).filter(([k]) => k !== "id").map(([k, v]) => `${k}: ${v}`),
    "",
    "Só os campos acima serão registrados. Se o cadastro mudar, será necessária uma nova conferência.",
  ].join("\n");
}
