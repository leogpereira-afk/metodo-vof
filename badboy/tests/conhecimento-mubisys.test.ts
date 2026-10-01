import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("conhecimento privado busca evidências com fonte e data, preserva valores históricos e pagina documentos", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon;create role authenticated;create role service_role bypassrls;");
    const sql = await readFile("supabase/migrations/0010_donboy_conhecimento.sql", "utf8");
    await db.exec(sql);
    await db.exec(
      `insert into badboy_conhecimento_documentos(chave,titulo,origem,data_base,sha256,caracteres) values ('precos','Regras de preço','pacote privado','2026-09-30',repeat('a',64),80),('comissoes','Comissões','pacote privado','2026-09-30',repeat('b',64),80);
 insert into badboy_conhecimento_trechos(documento,ordem,titulo,conteudo) values ('precos',0,'Preço manual','Preço é calculado manualmente fora do ERP. Exemplo antigo não é tabela vigente.'),('comissoes',0,'Regra de comissão','Comissão pela venda do mês. Baixa interna não prova conciliação bancária.'),('comissoes',1,'Continuação','Não inventar percentual de comissão.');`,
    );
    const r = (await db.query<any>("select badboy_conhecimento_buscar('comissão venda',5) as r")).rows[0].r;
    assert.equal(r.tipo, "referencia_historica");
    assert.equal(r.resultados[0].documento, "comissoes");
    assert.equal(r.resultados[0].data_base, "2026-09-30");
    const leitura = (await db.query<any>("select badboy_conhecimento_ler('comissoes',0,1) as r")).rows[0].r;
    assert.equal(leitura.proximo_inicio, 1);
    assert.equal(leitura.trechos.length, 1);
    const ultima = (await db.query<any>("select badboy_conhecimento_ler('comissoes',1,1) as r")).rows[0].r;
    assert.equal(ultima.proximo_inicio, null);
    assert.equal(ultima.trechos[0].conteudo, "Não inventar percentual de comissão.");
    const nada = (await db.query<any>("select badboy_conhecimento_buscar('astronave',5) as r")).rows[0].r;
    assert.equal(nada.resultados.length, 0);
    for (const papel of ["anon", "authenticated"]) {
      await db.exec("set role " + papel);
      await assert.rejects(db.query("select * from badboy_conhecimento_trechos"), /permission denied/i);
      await assert.rejects(db.query("select badboy_conhecimento_buscar('comissão',5)"), /permission denied/i);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.ok((await db.query("select badboy_conhecimento_buscar('comissão',5)")).rows.length);
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});
