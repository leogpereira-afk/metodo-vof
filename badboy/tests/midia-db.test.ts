import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("anexo entra com legenda e histórico uma vez, sem permissões públicas", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create table badboy_mensagens(id bigint generated always as identity primary key,chat_id bigint,papel text,conteudo text);create table badboy_fila(id bigint generated always as identity primary key,chave text unique,chat_id bigint,payload jsonb);`,
    );
    await db.exec(
      await readFile("supabase/migrations/0013_donboy_midia.sql", "utf8"),
    );
    const payload = {
      message: {
        caption: "Confira os totais",
        document: { file_id: "telegram_pdf" },
      },
      _anexos: [{
        tipo: "pdf",
        nome: "dados.pdf",
        mime: "application/pdf",
        file_id: "telegram_pdf",
      }],
    };
    await db.query("select badboy_enfileirar($1,$2,$3::jsonb)", [
      "telegram:123",
      27,
      JSON.stringify(payload),
    ]);
    await db.query("select badboy_enfileirar($1,$2,$3::jsonb)", [
      "telegram:123",
      27,
      JSON.stringify(payload),
    ]);
    const rows = (await db.query<any>("select * from badboy_mensagens")).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].conteudo, "Confira os totais");
    assert.equal(rows[0].anexos[0].file_id, "telegram_pdf");
    const fila = (await db.query<any>("select payload from badboy_fila")).rows;
    assert.equal(Number(fila[0].payload._mensagem_id), Number(rows[0].id));
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      await assert.rejects(
        db.query("select * from badboy_midia_uso"),
        /permission denied/i,
      );
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});
