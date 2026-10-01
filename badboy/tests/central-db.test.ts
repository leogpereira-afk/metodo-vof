import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
test("hotel altera só a viagem escolhida, preserva outros dados e rejeita conflito", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create table leo_estado(id boolean primary key,mt bigint,dados jsonb,atualizado_em timestamptz);`,
    );
    await db.exec(await readFile("supabase/migrations-segundo/0004_donboy_central_confirmacao.sql", "utf8"));
    const viagem = { id: "v1", cidade: "Porto Seguro", hoteis: [] };
    await db.query("insert into leo_estado values(true,100,$1,now())", [
      JSON.stringify({ viagens: [viagem, { id: "v2", cidade: "BH" }], bancos: [{ id: "b1", nome: "preservado" }] }),
    ]);
    const hotel = { id: "h1", nome: "Hotel teste", entrada: "2026-10-30", saida: "2026-11-02", valor: 2310 };
    const args = ["op1", "hotel", "v1", viagem, hotel];
    await db.query("select badboy_central_aplicar($1,$2,$3,$4,$5)", args);
    await db.query("select badboy_central_aplicar($1,$2,$3,$4,$5)", args);
    const r = (await db.query<any>("select * from leo_estado")).rows[0];
    assert.equal(r.dados.viagens[0].hoteis.length, 1);
    assert.equal(r.dados.viagens[0].hoteis[0].valor, 2310);
    assert.equal(r.dados.viagens[1].cidade, "BH");
    assert.equal(r.dados.bancos[0].nome, "preservado");
    assert.ok(Number(r.mt) > 100);
    assert.equal(String(r.dados._mt),String(r.mt));
    await assert.rejects(
      db.query("select badboy_central_aplicar($1,$2,$3,$4,$5)", ["op2", "hotel", "v1", viagem, { ...hotel, id: "h2" }]),
      /conflito/i,
    );
    await assert.rejects(
      db.query("select badboy_central_aplicar($1,$2,$3,$4,$5)", ["op3", "bancos", "b1", null, { id: "b1" }]),
      /tipo/i,
    );
  } finally {
    await db.close();
  }
});
test("novos cadastros aparecem nos filtros da Central e datas consideram o registro existente", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create table leo_estado(id boolean primary key,mt bigint,dados jsonb,atualizado_em timestamptz);`,
    );
    await db.exec(await readFile("supabase/migrations-segundo/0004_donboy_central_confirmacao.sql", "utf8"));
    const viagem = {
      id: "v1",
      cidade: "Destino teste",
      ida: "2026-10-20",
      volta: "2026-10-25",
      hoteis: [{ id: "h0", nome: "Primeiro hotel" }],
      hotel: "Primeiro hotel",
    };
    await db.query("insert into leo_estado values(true,100,$1,now())", [
      JSON.stringify({ viagens: [viagem], demandas: [] }),
    ]);
    await assert.rejects(
      db.query("select badboy_central_aplicar($1,$2,$3,$4,$5)", ["op-invalida", "viagem", "v1", viagem, {
        ida: "2026-10-30",
      }]),
      /período/i,
    );
    await db.query("select badboy_central_aplicar($1,$2,$3,$4,$5)", ["op-hotel", "hotel", "v1", viagem, {
      id: "h1",
      nome: "Segundo hotel",
      entrada: "2026-10-22",
      saida: "2026-10-24",
    }]);
    await db.query("select badboy_central_aplicar($1,$2,$3,$4,$5)", ["op-demanda", "demanda", "d1", null, {
      titulo: "Teste",
    }]);
    const r = (await db.query<any>("select dados from leo_estado")).rows[0].dados;
    assert.equal(r.viagens[0].hotel, "Primeiro hotel · Segundo hotel");
    assert.equal(r.demandas[0].status, "Aberta");
    assert.equal(r.demandas[0].prioridade, "Média");
  } finally {
    await db.close();
  }
});
