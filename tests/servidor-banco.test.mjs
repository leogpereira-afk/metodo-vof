// Testes da migração 0001_init.sql num Postgres de verdade (PGlite, em memória).
// Não encosta no Supabase. Precisa do pacote @electric-sql/pglite:
//   npm i -D @electric-sql/pglite           (instalado no projeto), ou
//   PGLITE_PATH=/caminho/para/pglite/dist/index.js node --test tests/
// Sem ele, os testes PULAM dizendo o motivo (não passam calados).
import test, { before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { COLECOES } from "../supabase/functions/vof-sync/regras.mjs";

let PGlite = null;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
} catch {
  if (process.env.PGLITE_PATH) ({ PGlite } = await import(pathToFileURL(process.env.PGLITE_PATH).href));
}
const pular = PGlite ? false : "PGlite ausente: instale @electric-sql/pglite ou defina PGLITE_PATH";
const MIGRACAO = fs.readFileSync(new URL("../supabase/migrations/0001_init.sql", import.meta.url), "utf8");

let db;
if (PGlite) {
  before(async () => {
    db = new PGlite();
    // O mínimo do Supabase que a migração toca, com os privilégios padrão que o
    // Supabase dá a anon e authenticated em tudo que nasce no schema public.
    // A service_role fica FORA do padrão de tabelas de propósito: a migração
    // tem de conceder, ela mesma, o que a vof-sync lê.
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      create schema storage;
      grant usage on schema storage to anon, authenticated;
      create table storage.buckets(id text primary key, name text, public boolean);
      create table storage.objects(bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant select, insert, update, delete on storage.objects to anon, authenticated;
      -- O pior caso no projeto compartilhado: outro sistema abriu o storage inteiro.
      create policy outro_sistema_abre_tudo on storage.objects for all to anon, authenticated using (true) with check (true);
      -- A tabela crua do RH, que o prefixo vof existe para não tocar.
      create table public.registros(colecao text, id text, registro jsonb, apagado boolean default false, primary key(colecao, id));
      insert into public.registros values ('colaboradores', 'c1', '{"nome":"Pessoa Ficticia"}', false);
    `);
    await db.exec(MIGRACAO);
    await db.exec(MIGRACAO); // idempotente: a segunda vez não pode falhar
  });
  after(async () => await db?.close());
  beforeEach(async () => await db.exec("begin"));
  afterEach(async () => await db.exec("rollback"));
}

const gravar = async (col, id, registro, acao = "upsert", expected = null, mutation = null) =>
  (await db.query("select vof_gravar($1,$2,$3,$4,$5,$6) as r", [col, id, registro, acao, expected, mutation])).rows[0].r;

test("arquivar preserva o conteúdo e restaurar devolve sem reconstrução", { skip: pular }, async () => {
  const novo = await gravar("turmas", "t1", { id: "t1", nome: "Turma Ficticia", participantes: 12 });
  assert.equal(novo.revision, 1);
  const arq = await gravar("turmas", "t1", null, "delete", novo.revision);
  assert.equal(arq.apagado, true);
  assert.equal(arq.registro.nome, "Turma Ficticia");
  const volta = await gravar("turmas", "t1", null, "restore", arq.revision);
  assert.equal(volta.apagado, false);
  assert.equal(volta.registro.participantes, 12);
});

test("edição desatualizada não sobrescreve a mais nova", { skip: pular }, async () => {
  const a = await gravar("diagnosticos", "d1", { id: "d1", obs: "A" });
  await gravar("diagnosticos", "d1", { id: "d1", obs: "B" }, "upsert", a.revision);
  await assert.rejects(gravar("diagnosticos", "d1", { id: "d1", obs: "C" }, "upsert", a.revision), { code: "40001" });
});

test("o mesmo envio repetido não grava de novo", { skip: pular }, async () => {
  const a = await gravar("salas", "AB12", { id: "AB12", slide: 3 }, "upsert", 0, "envio-1");
  const b = await gravar("salas", "AB12", { id: "AB12", slide: 3 }, "upsert", 0, "envio-1");
  assert.equal(a.revision, b.revision);
});

test("envio antigo feito offline não ressuscita item arquivado", { skip: pular }, async () => {
  await gravar("empresas", "e1", { id: "e1", nome: "Empresa Ficticia" });
  await gravar("empresas", "e1", null, "delete");
  await assert.rejects(gravar("empresas", "e1", { id: "e1", nome: "Empresa Ficticia" }), { code: "40001" });
});

test("perguntar a revisão antes não destrava código arquivado: upsert com a revisão certa também é recusado", { skip: pular }, async () => {
  // O plano da turma tem código fixo (plano-<turmaId>). Só o restore o traz de volta.
  await gravar("planos", "plano-t1", { id: "plano-t1", turmaId: "t1" });
  const arq = await gravar("planos", "plano-t1", null, "delete");
  // Erro aborta a transação do teste: a recusa roda no próprio savepoint.
  await db.exec("savepoint recusa");
  await assert.rejects(gravar("planos", "plano-t1", { id: "plano-t1", turmaId: "t1" }, "upsert", arq.revision),
    (e) => e.code === "40001" && /Item arquivado/.test(e.message));
  await db.exec("rollback to savepoint recusa");
  const volta = await gravar("planos", "plano-t1", null, "restore");
  assert.equal(volta.apagado, false);
  assert.equal((await gravar("planos", "plano-t1", { id: "plano-t1", turmaId: "t1", meta: "x" }, "upsert", volta.revision)).registro.meta, "x");
});

test("id do registro diferente do id da chamada é recusado", { skip: pular }, async () => {
  await assert.rejects(gravar("empresas", "e1", { id: "e2" }), /Conteúdo inválido/);
});

test("a vof_gravar aceita as seis coleções e nenhuma outra", { skip: pular }, async () => {
  for (const col of COLECOES) await gravar(col, "x1", { id: "x1" });
  for (const col of ["pessoas", "registros", "colaboradores", ""]) {
    // Erro aborta a transação do teste: cada recusa roda no próprio savepoint.
    await db.exec("savepoint recusa");
    await assert.rejects(gravar(col, "x1", { id: "x1" }), /Registro inválido/, col);
    await db.exec("rollback to savepoint recusa");
  }
});

test("contador rev avança por coleção sem perder a das outras", { skip: pular }, async () => {
  await gravar("turmas", "t1", { id: "t1" });
  await gravar("planos", "p1", { id: "p1" });
  await gravar("turmas", "t1", { id: "t1", nome: "x" });
  const { valor } = (await db.query("select valor from vof_meta where chave='rev'")).rows[0];
  assert.equal(valor.rev, 3);
  assert.equal(valor.porColecao.turmas, 3);
  assert.equal(valor.porColecao.planos, 2);
});

test("configuração por patch preserva o que não foi enviado; concorrente é recusada", { skip: pular }, async () => {
  await db.query("select vof_configurar($1)", [{ ciclo: 90, marca: "V.O.F." }]);
  const { r } = (await db.query("select vof_configurar($1,$2) as r", [{ ciclo: 60 }, { ciclo: 90 }])).rows[0];
  assert.equal(r.config.marca, "V.O.F.");
  assert.equal(r.config.ciclo, 60);
  await assert.rejects(db.query("select vof_configurar($1,$2)", [{ ciclo: 30 }, { ciclo: 90 }]), { code: "40001" });
});

test("anon e authenticated não têm acesso a tabela nem a função; service_role executa", { skip: pular }, async () => {
  for (const papel of ["anon", "authenticated"]) {
    for (const t of ["vof_registros", "vof_config_global", "vof_meta"]) {
      for (const priv of ["select", "insert", "update", "delete"]) {
        const { ok } = (await db.query(`select has_table_privilege($1, $2, $3) as ok`, [papel, `public.${t}`, priv])).rows[0];
        assert.equal(ok, false, `${papel} ${priv} ${t}`);
      }
    }
    for (const f of ["vof_gravar(text,text,jsonb,text,bigint,text)", "vof_configurar(jsonb,jsonb)"]) {
      const { ok } = (await db.query(`select has_function_privilege($1, $2, 'execute') as ok`, [papel, `public.${f}`])).rows[0];
      assert.equal(ok, false, `${papel} executa ${f}`);
    }
  }
  const { ok } = (await db.query(`select has_function_privilege('service_role', 'public.vof_gravar(text,text,jsonb,text,bigint,text)', 'execute') as ok`)).rows[0];
  assert.equal(ok, true);
  for (const t of ["vof_registros", "vof_config_global", "vof_meta"]) {
    const { ok: le } = (await db.query(`select has_table_privilege('service_role', $1, 'select') as ok`, [`public.${t}`])).rows[0];
    assert.equal(le, true, `service_role lê ${t} sem depender do privilégio padrão`);
  }
});

test("bucket vof-arquivos fica fechado a anon e authenticated mesmo com policy larga de outro sistema", { skip: pular }, async () => {
  await db.exec(`insert into storage.objects(bucket_id, name) values
    ('vof-arquivos', 'apostila/Metodo_VOF_Apostila_Completa.pdf'), ('outro-sistema', 'foto.jpg')`);
  for (const papel of ["anon", "authenticated"]) {
    await db.exec(`set role ${papel}`);
    const { rows } = await db.query("select bucket_id from storage.objects order by bucket_id");
    assert.deepEqual(rows.map((r) => r.bucket_id), ["outro-sistema"], `${papel} não vê a apostila; o bucket vizinho segue igual`);
    const troca = await db.query("update storage.objects set name = 'trocado' where bucket_id = 'vof-arquivos'");
    assert.equal(troca.affectedRows ?? 0, 0, `${papel} não troca a apostila`);
    await db.exec("savepoint escrita");
    await assert.rejects(db.exec("insert into storage.objects(bucket_id, name) values ('vof-arquivos', 'apostila/falsa.pdf')"), /row-level security/, papel);
    await db.exec("rollback to savepoint escrita");
    await db.exec("reset role");
  }
  const { rows } = await db.query("select name from storage.objects where bucket_id = 'vof-arquivos'");
  assert.deepEqual(rows, [{ name: "apostila/Metodo_VOF_Apostila_Completa.pdf" }]);
  const { rows: pol } = await db.query(`select permissive from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'vof_arquivos_so_pelo_servidor'`);
  assert.deepEqual(pol, [{ permissive: "RESTRICTIVE" }]);
});

test("RLS ligado nas três tabelas e nenhuma policy criada", { skip: pular }, async () => {
  const { rows } = await db.query(`select relname, relrowsecurity from pg_class where relname in ('vof_registros','vof_config_global','vof_meta') order by relname`);
  assert.deepEqual(rows.map((r) => [r.relname, r.relrowsecurity]), [["vof_config_global", true], ["vof_meta", true], ["vof_registros", true]]);
  const { rows: pol } = await db.query(`select count(*)::int as n from pg_policies where tablename like 'vof_%'`);
  assert.equal(pol[0].n, 0);
});

test("bucket é privado, e rodar a migração de novo fecha um bucket aberto", { skip: pular }, async () => {
  await db.exec("update storage.buckets set public = true where id = 'vof-arquivos'");
  await db.exec(MIGRACAO);
  const { rows } = await db.query("select public from storage.buckets where id = 'vof-arquivos'");
  assert.deepEqual(rows, [{ public: false }]);
});

test("a tabela crua do RH continua intocada", { skip: pular }, async () => {
  await gravar("turmas", "t1", { id: "t1" });
  const { rows } = await db.query("select colecao, id, registro from public.registros order by id");
  assert.deepEqual(rows, [{ colecao: "colaboradores", id: "c1", registro: { nome: "Pessoa Ficticia" } }]);
});
