import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import * as financeiro from "../src/financeiro.ts";
test("recebíveis separam vencido de vence hoje e não somam valor original", async () => {
  const fn = (financeiro as any).consultaRecebiveis;
  assert.equal(typeof fn, "function");
  const db = new PGlite();
  try {
    await db.exec("create table painel_cache(chave text,valor jsonb,atualizado_em timestamptz);");
    await db.query("insert into painel_cache values ($1,$2,now())", [
      "recebiveis",
      JSON.stringify([
        { cliente: "Cliente Teste", valor: 18100, valorTitulo: 20000, vencimento: "2026-09-30" },
        { cliente: "Cliente Teste", valor: 8600, vencimento: "2026-09-30" },
        { cliente: "Cliente Teste", valor: 50, vencimento: "2025-12-31" },
        { cliente: "Outro", valor: 900, vencimento: "2026-09-01" },
      ]),
    ]);
    const { rows } = await db.query<any>(fn("Cliente Teste", "2026-09-30"));
    assert.equal(Number(rows[0].total), 26750);
    assert.equal(Number(rows[0].vencido), 50);
    assert.equal(Number(rows[0].vence_hoje), 26700);
    assert.equal(Number(rows[0].a_vencer), 0);
    assert.equal((await db.query<any>(fn("x' OR true --", "2026-09-30"))).rows[0]?.titulos, 0);
    assert.throws(() => fn("", "2026-02-30"));
  } finally {
    await db.close();
  }
});
