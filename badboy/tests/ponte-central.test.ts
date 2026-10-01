import assert from "node:assert/strict";
import { test } from "node:test";
import { novoIdCentral, prepararLancamento } from "../ponte-segundo/central.ts";

let n = 0;
const ids = () => `xteste${++n}`;

test("Central: id no mesmo formato da Central ('x' + data em base 36 + 5 letras)", () => {
  const id = novoIdCentral(1_790_000_000_000, 0.123456789);
  assert.match(id, /^x[0-9a-z]+$/);
  assert.equal(id.slice(1, -5), (1_790_000_000_000).toString(36));
  assert.equal(id.length, 1 + (1_790_000_000_000).toString(36).length + 5);
});

test("Central: adicionar item novo, adicionar em sublista e atualizar campos", () => {
  assert.deepEqual(prepararLancamento({ operacao: "adicionar", lista: "demandas", dados: { titulo: "Ligar", id: "forjado", _mt: 1 } }, ids), {
    operacao: "adicionar", lista: "demandas", item: { titulo: "Ligar" }, novo_id: "xteste1",
  });
  assert.deepEqual(
    prepararLancamento({ operacao: "adicionar", lista: "viagens", id: "v1", sublista: "hoteis", dados: { nome: "Pousada" } }, ids),
    { operacao: "adicionar", lista: "viagens", id: "v1", sublista: "hoteis", item: { nome: "Pousada" }, novo_id: "xteste2" },
  );
  assert.deepEqual(prepararLancamento({ operacao: "atualizar", lista: "viagens", id: "v1", dados: { cidade: "PORTO SEGURO" } }, ids), {
    operacao: "atualizar", lista: "viagens", id: "v1", campos: { cidade: "PORTO SEGURO" },
  });
});

test("Central: sublista mandada inteira ganha id nos itens novos e precisa ser lista de objetos", () => {
  const p = prepararLancamento(
    { operacao: "atualizar", lista: "viagens", id: "v1", dados: { hoteis: [{ id: "h1", nome: "A" }, { nome: "B" }] } },
    ids,
  );
  assert.deepEqual((p.campos as { hoteis: unknown[] }).hoteis, [{ id: "h1", nome: "A" }, { nome: "B", id: "xteste3" }]);
  assert.throws(() => prepararLancamento({ operacao: "atualizar", lista: "viagens", id: "v1", dados: { hoteis: ["texto"] } }, ids), /lista de itens/);
});

test("Central: recusa o que pode quebrar a Central ou não faz sentido", () => {
  const recusa = (pedido: unknown, motivo: RegExp) => assert.throws(() => prepararLancamento(pedido, ids), motivo);
  recusa({ operacao: "apagar", lista: "demandas", dados: { a: 1 } }, /adicionar ou atualizar/);
  recusa({ operacao: "adicionar", lista: "empresasPJ", dados: { nome: "X" } }, /não pode ser mexida/);
  recusa({ operacao: "adicionar", lista: "liderancas", dados: { nome: "X" } }, /não pode ser mexida/);
  recusa({ operacao: "adicionar", lista: "dados;drop", dados: { a: 1 } }, /lista inválida/);
  recusa({ operacao: "atualizar", lista: "viagens", dados: { a: 1 } }, /id do item/);
  recusa({ operacao: "adicionar", lista: "viagens", id: "v1", sublista: "segredos", dados: { a: 1 } }, /não existe em viagens/);
  recusa({ operacao: "adicionar", lista: "viagens", id: "v1", dados: { a: 1 } }, /deixe o id vazio/);
  recusa({ operacao: "adicionar", lista: "demandas", dados: [] }, /objeto/);
  recusa({ operacao: "adicionar", lista: "demandas", dados: { texto: "x".repeat(25_000) } }, /grandes demais/);
});
