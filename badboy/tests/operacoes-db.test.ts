import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
async function banco() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
create table badboy_pendentes(id bigint generated always as identity primary key,tipo text check(tipo in ('email','fatos','compra')),dados jsonb,criado_em timestamptz default now(),executado_em timestamptz,resultado text);
create table badboy_mensagens(id bigint generated always as identity primary key,chat_id bigint,papel text,conteudo text,criada_em timestamptz default now());`);
  await db.exec(await readFile("supabase/migrations/0008_donboy_operacoes.sql", "utf8"));
  return db;
}
test("fila deduplica updates e reserva uma execução por conversa", async () => {
  const db = await banco();
  try {
    await db.query(
      `insert into badboy_fila(chave,chat_id,payload) values ('tg:1',1,'{}'),('tg:2',1,'{}'),('tg:3',2,'{}')`,
    );
    await db.query(
      `insert into badboy_fila(chave,chat_id,payload) values ('tg:1',1,'{}') on conflict(chave) do nothing`,
    );
    assert.equal((await db.query<any>("select count(*)::int n from badboy_fila")).rows[0].n, 3);
    const a = (await db.query<any>("select * from badboy_reservar_trabalho()")).rows[0];
    const b = (await db.query<any>("select * from badboy_reservar_trabalho()")).rows[0];
    assert.notEqual(a.chat_id, b.chat_id);
    assert.equal((await db.query("select * from badboy_reservar_trabalho()")).rows.length, 0);
    await db.query(`update badboy_fila set estado='concluido' where id=$1`, [a.id]);
    assert.equal((await db.query("select * from badboy_reservar_trabalho()")).rows.length, 1);
  } finally {
    await db.close();
  }
});
test("ações não são marcadas como concluídas na reserva e não repetem envio", async () => {
  const db = await banco();
  try {
    await db.query(`insert into badboy_pendentes(tipo,dados) values ('email','{}')`);
    assert.equal((await db.query("select * from badboy_reservar_acao(1,'email')")).rows.length, 1);
    const r = (await db.query<any>("select estado,executado_em from badboy_pendentes")).rows[0];
    assert.equal(r.estado, "executando");
    assert.equal(r.executado_em, null);
    assert.equal((await db.query("select * from badboy_reservar_acao(1,'email')")).rows.length, 0);
  } finally {
    await db.close();
  }
});
test("fila expirada não repete o trabalho e ações antigas ou de outro tipo não executam", async () => {
  const db = await banco();
  try {
    await db.exec(
      `insert into badboy_fila(chave,chat_id,payload,estado,iniciado_em) values ('antigo',1,'{}','executando',now()-interval '16 minutes'); insert into badboy_fila(chave,chat_id,payload) values ('novo',1,'{}');`,
    );
    const reservado = (await db.query<any>("select * from badboy_reservar_trabalho()")).rows[0];
    assert.equal(reservado.chave, "novo");
    assert.equal(
      (await db.query<any>("select estado from badboy_fila where chave='antigo'")).rows[0].estado,
      "incerto",
    );
    await db.exec(
      `insert into badboy_pendentes(tipo,dados,criado_em) values ('email','{}',now()-interval '11 minutes'),('central','{}',now());`,
    );
    assert.equal((await db.query("select * from badboy_reservar_acao(1,'email')")).rows.length, 0);
    assert.equal((await db.query("select * from badboy_reservar_acao(2,'email')")).rows.length, 0);
  } finally {
    await db.close();
  }
});
test("anon e authenticated não podem consultar filas, tarefas, turnos ou reservar ações", async () => {
  const db = await banco();
  try {
    for (const papel of ["anon", "authenticated"]) {
      await db.exec("set role " + papel);
      for (const tabela of ["badboy_fila", "badboy_tarefas", "badboy_turnos"]) {
        await assert.rejects(db.query("select * from " + tabela), /permission denied/i);
      }
      await assert.rejects(db.query("select * from badboy_reservar_trabalho()"), /permission denied/i);
      await assert.rejects(db.query("select * from badboy_reservar_acao(1,'email')"), /permission denied/i);
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});
test("entrada durável salva mensagens uma vez e disponibiliza textos seguidos antes do processamento", async () => {
  const db = await banco();
  try {
    const a = { update_id: 10, message: { text: "Primeira parte", chat: { id: 1, type: "private" } } };
    const b = { update_id: 11, message: { text: "Segunda parte", chat: { id: 1, type: "private" } } };
    for (const u of [a, a, b]) await db.query("select badboy_enfileirar($1,$2,$3)", ["telegram:" + u.update_id, 1, u]);
    const msgs = (await db.query<any>("select * from badboy_mensagens order by id")).rows;
    assert.deepEqual(msgs.map((m) => m.conteudo), ["Primeira parte", "Segunda parte"]);
    const fila = (await db.query<any>("select payload from badboy_fila order by id")).rows;
    assert.equal(Number(fila[0].payload._mensagem_id), Number(msgs[0].id));
    assert.equal(Number(fila[1].payload._mensagem_id), Number(msgs[1].id));
    await db.query("select badboy_enfileirar($1,$2,$3)", ["telegram:12", 1, { message: { text: "/custo" } }]);
    assert.equal((await db.query("select * from badboy_mensagens")).rows.length, 2);
  } finally {
    await db.close();
  }
});
