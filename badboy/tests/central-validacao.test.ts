import assert from "node:assert/strict";
import { test } from "node:test";
import * as central from "../src/central.ts";
test("prévia recusa conta bancária, viagem ambígua, valor negativo e data impossível", () => {
  const fn = (central as any).validarRegistroCentral;
  assert.equal(typeof fn, "function");
  assert.throws(() => fn("hotel", "", { nome: "Hotel", entrada: "2026-10-30", saida: "2026-11-02" }));
  assert.throws(() => fn("bancos", "x", { pix: "x" }));
  assert.throws(() => fn("hotel", "v1", { nome: "Hotel", entrada: "2026-02-30", saida: "2026-03-03", valor: 1 }));
  assert.throws(() => fn("hotel", "v1", { nome: "Hotel", entrada: "2026-10-30", saida: "2026-11-02", valor: -1 }));
  assert.throws(() => fn("viagem", "v1", { cidade: "BH", bancos: [] }));
  assert.equal(
    fn("hotel", "v1", { nome: "Hotel", entrada: "2026-10-30", saida: "2026-11-02", valor: 2310 }).valor,
    2310,
  );
});
