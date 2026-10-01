// Lançamentos do Don Boy na Central do Léo (leo_estado), a pedido do dono.
//
// Quem grava de verdade são as funções do banco (migrations-segundo/0003):
// travam a linha, mudam um item, sobem as versões que a Central usa para
// sincronizar e guardam o antes e o depois para desfazer. Aqui fica a
// conferência do que pode ser mexido sem quebrar a Central: o validador dela
// recusa o estado inteiro se uma lista tiver algo que não seja objeto, e as
// listas com vínculos cruzados (empresas, lideranças, planejamento,
// organogramas) ficam fora.

// Listas que o Don Boy NÃO mexe: vínculos cruzados que o validador da Central
// confere, ou dados que não são de lançamento.
export const LISTAS_FORA = new Set([
  "empresasPJ", "liderancas", "planejamentoEmpresas", "organogramas", "obraM2Fora",
  "gmailDispensados", "gmailPendentes", "planilhas",
]);

// Listas dentro de um item que a Central exige como lista de objetos.
export const SUBLISTAS: Record<string, string[]> = {
  viagens: ["custos", "passagens", "hoteis", "tickets", "roteiro", "lugares"],
  metas: ["passos"],
  oportunidades: ["links"],
  acervoDocumental: ["registros"],
};

const LIMITE_JSON = 20_000;
const NOME = /^[A-Za-z][A-Za-z0-9]{1,40}$/;

// Mesmo formato de id que a Central cria: 'x' + data em base 36 + 5 letras.
export function novoIdCentral(agora = Date.now(), sorteio = Math.random()): string {
  return "x" + agora.toString(36) + sorteio.toString(36).slice(2, 7).padEnd(5, "0");
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export interface PedidoCentral {
  operacao: "adicionar" | "atualizar";
  lista: string;
  id?: string;
  sublista?: string;
  dados: Record<string, unknown>;
}

// Confere o pedido e devolve o corpo para donboy_central_gravar.
export function prepararLancamento(entrada: unknown, novoId: () => string = () => novoIdCentral()) {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const operacao = e.operacao;
  if (operacao !== "adicionar" && operacao !== "atualizar") throw new Error("operação deve ser adicionar ou atualizar");
  const lista = String(e.lista ?? "");
  if (!NOME.test(lista)) throw new Error("lista inválida");
  if (LISTAS_FORA.has(lista)) throw new Error(`a lista ${lista} não pode ser mexida pelo Don Boy: ajuste direto na Central`);
  const id = String(e.id ?? "").trim();
  const sublista = String(e.sublista ?? "").trim();
  if (operacao === "atualizar" && !id) throw new Error("para atualizar, informe o id do item");
  if (sublista) {
    if (!id) throw new Error("para adicionar numa sublista, informe o id do item");
    if (operacao !== "adicionar") throw new Error("sublista só vale para adicionar");
    if (!(SUBLISTAS[lista] ?? []).includes(sublista)) throw new Error(`sublista ${sublista} não existe em ${lista}`);
  } else if (operacao === "adicionar" && id) {
    throw new Error("para adicionar um item novo, deixe o id vazio (ou informe a sublista)");
  }
  const dados = e.dados;
  if (!ehObjeto(dados) || Object.keys(dados).length === 0) throw new Error("os dados precisam ser um objeto com campos");
  if (JSON.stringify(dados).length > LIMITE_JSON) throw new Error("dados grandes demais para um lançamento");
  const limpos = Object.fromEntries(Object.entries(dados).filter(([k]) => k !== "id" && k !== "_mt"));
  // Sublistas conhecidas mandadas dentro dos dados também precisam ser listas
  // de objetos, e cada item sem id ganha um, como os que a Central cria.
  for (const nome of SUBLISTAS[lista] ?? []) {
    const v = limpos[nome];
    if (v === undefined) continue;
    if (!Array.isArray(v) || v.some((x) => !ehObjeto(x))) throw new Error(`${nome} precisa ser uma lista de itens`);
    limpos[nome] = v.map((x) => (typeof x.id === "string" && x.id ? x : { ...x, id: novoId() }));
  }
  const corpo: Record<string, unknown> = { operacao, lista };
  if (id) corpo.id = id;
  if (sublista) corpo.sublista = sublista;
  if (operacao === "adicionar") {
    corpo.item = limpos;
    corpo.novo_id = novoId();
  } else {
    corpo.campos = limpos;
  }
  return corpo;
}
