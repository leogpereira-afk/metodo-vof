import assert from "node:assert/strict";
import { test } from "node:test";
import * as fila from "../src/fila.ts";
test("worker registra falha e continua próximo trabalho sem repetir o anterior", async () => {
  const fn = (fila as any).processarFila;
  assert.equal(typeof fn, "function");
  const itens = [{ id: 1, payload: {} }, { id: 2, payload: {} }], fim: any[] = [];
  await fn({
    reservarTrabalho: async () => itens.shift() ?? null,
    concluirTrabalho: async (...args: any[]) => {
      fim.push(args);
    },
  }, async (j: any) => {
    if (j.id === 1) throw new Error("falha controlada");
  });
  assert.deepEqual(fim, [[1, "falha controlada"], [2, undefined]]);
});
