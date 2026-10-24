import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHmac } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import * as regras from '../supabase/functions/vof-sync/regras.mjs';
import * as jornada from '../supabase/functions/vof-sync/jornada.mjs';

const SQL = fs.readFileSync(new URL('../supabase/migrations/20261024140102_jornada_pessoal.sql', import.meta.url), 'utf8');
const resposta = (extra = {}) => ({ opcao: 'evidencia', texto: 'Observei a situação fictícia e registrei o próximo passo.', concluida: true, data: '2026-10-24', ...extra });
const pedido = (extra = {}) => ({ action: 'jornadaSalvar', missao: 'arquitetura', registro: resposta(), expectedRevision: 0, mutationId: 'envio-teste-1', ...extra });
const invalidar = (f) => assert.throws(f, e => e instanceof regras.Falha && e.status === 400);
const contextoConteudo = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL('../jornada-conteudo.js', import.meta.url), 'utf8'), contextoConteudo);
const exercicios = contextoConteudo.window.VOFExercicios;

test('jornada: lista do servidor acompanha exatamente as 18 missões do conteúdo', () => {
  const fonte = fs.readFileSync(new URL('../metodo.js', import.meta.url), 'utf8');
  const trecho = fonte.slice(fonte.indexOf('const MODULOS ='), fonte.indexOf('const REFERENCIAS ='));
  assert.deepEqual([...trecho.matchAll(/\{id:'([^']+)'/g)].map(m => m[1]), jornada.MISSOES_JORNADA);
});
test('jornada: resposta válida, rascunho e prática são normalizados sem campos extras', () => {
  assert.deepEqual(jornada.validarJornada(pedido()).registro, resposta());
  const pratica = { prazo: '', situacao: 'planejada', resultado: '', revisaoEm: '' };
  assert.deepEqual(jornada.validarJornada(pedido({ registro: resposta({ concluida: false, opcao: '', texto: '', data: '', pratica, desafioVersao: 1 }) })).registro.pratica, pratica);
});
test('jornada: não aceita dono, XP, missão inventada, revisão omissa ou data impossível', () => {
  for (const x of [{ usuario: 'outra.conta' }, { xp: 999 }, { missao: '__proto__' }, { expectedRevision: undefined }, { expectedRevision: -1 }, { mutationId: null }]) invalidar(() => jornada.validarJornada(pedido(x)));
  for (const x of [{ texto: 'x'.repeat(2001) }, { texto: 'curto' }, { data: '2026-02-30' }, { data: '2026-10-24T10:00:00Z' }, { data: '' }, { opcao: '' }, { concluida: 'true' }, { usuario: 'outro' }, { desafioVersao: 0 }]) invalidar(() => jornada.validarJornada(pedido({ registro: resposta(x) })));
});
test('jornada: revisão prática exige evidência e data, sem prazo inventado', () => {
  const pratica = { prazo: '', situacao: 'revisada', resultado: 'Conferi o efeito e ajustei a próxima aplicação.', revisaoEm: '2026-10-24' };
  assert.deepEqual(jornada.validarJornada(pedido({ registro: resposta({ pratica }) })).registro.pratica, pratica);
  for (const x of [{ resultado: '' }, { revisaoEm: '' }, { prazo: '2026-02-30' }, { situacao: 'aprovada' }]) invalidar(() => jornada.validarJornada(pedido({ registro: resposta({ pratica: { ...pratica, ...x } }) })));
});
test('jornada: ambos os papéis usam somente sua jornada; máquina nunca entra', () => {
  for (const acao of ['jornadaGet', 'jornadaSalvar']) {
    for (const papel of ['admin', 'facilitador']) {
      regras.autorizar({ acao, papel });
      assert.equal(regras.precisaConfirmarAdmin({ acao, papel }), false);
      assert.throws(() => regras.autorizar({ acao, papel, maquina: true }), e => e.status === 403);
    }
  }
});
test('jornada: XP é derivado de conclusões verdadeiras, nunca do corpo recebido', () => {
  assert.deepEqual(jornada.resumirJornada('conta-teste', [
    { missao: 'arquitetura', registro: resposta(), revision: 1, atualizado_em: '2026-10-24' },
    { missao: 'ciclo', registro: resposta({ concluida: false }), revision: 1 },
    { missao: '__proto__', registro: resposta(), revision: 1 },
  ]).xp, 30);
});

const SEGREDO = 'segredo-ficticio-do-teste-jornada';
const MAQUINA = 'm'.repeat(40);
function porta({ rows = [], revogado = false, falhaAcesso = false, rpcError = null } = {}) {
  const calls = { rpc: [], filtros: [] };
  let handler;
  const sb = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (name === 'acesso_revogado') return { data: revogado, error: falhaAcesso ? { message: 'fora' } : null };
      return { data: { usuario: args.p_usuario, missao: args.p_missao, registro: args.p_registro, revision: 1, atualizado_em: '2026-10-24T10:00:00Z' }, error: rpcError };
    },
    from(table) {
      const filters = [];
      const q = { select() { return q; }, order() { return q; }, range() { return q; }, eq(k, v) { filters.push([k, v]); calls.filtros.push({ table, k, v }); return q; }, then(f) { return Promise.resolve({ data: table === 'vof_jornada_pessoal' ? rows.filter(r => filters.every(([k, v]) => r[k] === v)) : [], error: null }).then(f); } };
      return q;
    },
  };
  const source = fs.readFileSync(new URL('../supabase/functions/vof-sync/index.ts', import.meta.url), 'utf8')
    .replace(/^import \{ createClient \} from "https:[^"]+";$/m, 'const createClient = () => __sb;')
    .replace(/^import \{([^}]*)\} from "\.\/regras\.mjs";$/m, 'const {$1} = __regras;')
    .replace(/^import \{([^}]*)\} from "\.\/jornada\.mjs";$/m, 'const {$1} = __jornada;');
  assert.ok(!/^import /m.test(source));
  const env = { EQUIPE_JWT_SECRET: SEGREDO, VOF_TOKEN: MAQUINA };
  vm.runInNewContext(source, { __sb: sb, __regras: regras, __jornada: jornada, Deno: { env: { get: k => env[k] }, serve: f => { handler = f; } }, Request, Response, console: { error() {} } });
  return { calls, async chamar(body, { sub = 'aluna.a', papel = 'facilitador', maquina = false, semSessao = false } = {}) {
    const h = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({ sis: 'vof', sub, papel, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
    const token = `${h}.${p}.${createHmac('sha256', SEGREDO).update(`${h}.${p}`).digest('base64url')}`;
    const headers = { 'content-type': 'application/json', ...(maquina ? { 'x-token': MAQUINA } : semSessao ? {} : { authorization: `Bearer ${token}` }) };
    const r = await handler(new Request('http://local.test', { method: 'POST', headers, body: JSON.stringify(body) }));
    return { status: r.status, body: await r.json() };
  } };
}
test('porta jornada: login e revogação conferidos, máquina recusada antes de ler', async () => {
  for (const action of ['jornadaGet', 'jornadaSalvar']) {
    assert.equal((await porta().chamar({ action }, { semSessao: true })).status, 401);
    assert.equal((await porta({ revogado: true }).chamar({ action })).status, 401);
    assert.equal((await porta({ falhaAcesso: true }).chamar({ action })).status, 503);
    const p = porta();
    assert.equal((await p.chamar({ action }, { maquina: true })).status, 403);
    assert.equal(p.calls.filtros.length, 0);
    assert.equal(p.calls.rpc.length, 0);
  }
});
test('porta jornada: leitura filtra sub assinado; admin também não lê respostas alheias', async () => {
  const p = porta({ rows: [
    { usuario: 'aluna.a', missao: 'arquitetura', registro: resposta(), revision: 1 },
    { usuario: 'aluna.b', missao: 'ciclo', registro: resposta({ texto: 'Texto privado da conta fictícia B.' }), revision: 2 },
  ] });
  for (const papel of ['admin', 'facilitador']) {
    const r = await p.chamar({ action: 'jornadaGet' }, { papel });
    assert.equal(r.status, 200);
    assert.equal(r.body.usuario, 'aluna.a');
    assert.deepEqual(Object.keys(r.body.respostas), ['arquitetura']);
    assert.equal(r.body.xp, 30);
    assert.equal((await p.chamar({ action: 'jornadaGet', usuario: 'aluna.b' }, { papel })).status, 400);
  }
});
test('porta jornada: grava só pelo sub assinado e recusa troca de dono no envelope ou registro', async () => {
  const p = porta();
  const r = await p.chamar(pedido());
  assert.equal(r.status, 200);
  assert.equal(p.calls.rpc.find(x => x.name === 'vof_jornada_salvar').args.p_usuario, 'aluna.a');
  assert.equal((await p.chamar(pedido({ usuario: 'aluna.b' }))).status, 400);
  assert.equal((await p.chamar(pedido({ registro: resposta({ usuario: 'aluna.b' }) }))).status, 400);
  assert.equal(p.calls.rpc.filter(x => x.name === 'vof_jornada_salvar').length, 1);
});
test('porta jornada: conflito vira 409 sem mensagem SQL; exportação global não inclui jornada', async () => {
  const p = porta({ rpcError: { code: '40001', message: 'SQL privado' } });
  const r = await p.chamar(pedido());
  assert.equal(r.status, 409);
  assert.doesNotMatch(JSON.stringify(r), /SQL privado/);
  assert.equal((await porta().chamar({ action: 'list' }, { maquina: true })).body.registros.length, 0);
});
test('porta jornada: resposta versionada recusada pelo banco vira400 sem mensagem SQL', async () => {
  const p = porta({ rpcError: { code: '22023', message: 'Detalhe SQL privado da alternativa' } });
  const r = await p.chamar(pedido({ registro: resposta({ desafioVersao: 1, opcao: 'entrega' }) }));
  assert.equal(r.status, 400);
  assert.doesNotMatch(JSON.stringify(r), /Detalhe SQL privado/);
});

let db;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  await db.exec(SQL);
  await db.exec(SQL);
});
after(async () => await db?.close());
beforeEach(async () => await db.exec('begin'));
afterEach(async () => await db.exec('rollback'));
const salvar = async (usuario = 'aluna.a', missao = 'arquitetura', registro = resposta(), expected = 0, mutation = 'envio-1') =>
  (await db.query('select public.vof_jornada_salvar($1,$2,$3,$4,$5) as r', [usuario, missao, registro, expected, mutation])).rows[0].r;
async function rejeitar(f, validar) {
  await db.exec('savepoint recusa');
  await assert.rejects(f, validar);
  await db.exec('rollback to savepoint recusa');
}
test('banco jornada: duas contas e duas missões ficam independentes', async () => {
  await salvar();
  await salvar('aluna.b', 'arquitetura', resposta({ texto: 'Outra evidência fictícia independente.' }));
  await salvar('aluna.a', 'ciclo', resposta(), 0, 'envio-2');
  const { rows } = await db.query('select usuario, missao, revision from public.vof_jornada_pessoal order by usuario, missao');
  assert.deepEqual(rows, [ { usuario: 'aluna.a', missao: 'arquitetura', revision: 1 }, { usuario: 'aluna.a', missao: 'ciclo', revision: 1 }, { usuario: 'aluna.b', missao: 'arquitetura', revision: 1 } ]);
});
test('banco jornada: edição concorrente é recusada sem substituir a resposta salva', async () => {
  await salvar();
  await salvar('aluna.a', 'arquitetura', resposta({ texto: 'Resposta mais nova do outro aparelho.' }), 1, 'envio-2');
  await rejeitar(() => salvar('aluna.a', 'arquitetura', resposta(), 1, 'envio-3'), { code: '40001' });
  assert.equal((await db.query("select registro->>'texto' as texto from public.vof_jornada_pessoal")).rows[0].texto, 'Resposta mais nova do outro aparelho.');
});
test('banco jornada: retries antigos são idempotentes e o mesmo envio não vira outra missão', async () => {
  const primeiro = await salvar();
  await salvar('aluna.a', 'arquitetura', resposta({ texto: 'Segunda resposta fictícia mais recente.' }), 1, 'envio-2');
  assert.deepEqual(await salvar(), primeiro);
  assert.equal((await db.query('select revision from public.vof_jornada_pessoal')).rows[0].revision, 2);
  await rejeitar(() => salvar('aluna.a', 'ciclo', resposta(), 0, 'envio-1'), { code: '40001' });
  await rejeitar(() => salvar('aluna.a', 'arquitetura', resposta({ texto: 'Outro conteúdo tentando reutilizar o mesmo recibo.' }), 0, 'envio-1'), { code: '40001' });
});
test('banco jornada: conclusão e data persistem em edições; XP calculável continua único', async () => {
  await salvar();
  const editado = await salvar('aluna.a', 'arquitetura', resposta({ concluida: false, data: '2026-10-25' }), 1, 'envio-2');
  assert.equal(editado.registro.concluida, true);
  assert.equal(editado.registro.data, '2026-10-24');
  assert.equal(jornada.resumirJornada('aluna.a', (await db.query('select * from public.vof_jornada_pessoal')).rows).xp, 30);
  await rejeitar(() => salvar('aluna.a', 'arquitetura', resposta({ concluida: false, opcao: '', texto: '', data: '' }), 2, 'envio-3'), { code: '22023' });
});
test('banco jornada: missão, esquema, data impossível e conclusão vazia são recusados no SQL', async () => {
  for (const [missao, registro] of [ ['inventada', resposta()], ['ciclo', resposta({ texto: 'x' })], ['ciclo', resposta({ data: '2026-02-30' })], ['ciclo', resposta({ xp: 500 })], ['ciclo', resposta({ pratica: null })], ['ciclo', resposta({ pratica: { prazo: '', situacao: 'revisada', resultado: '', revisaoEm: '' } })] ]) {
    await rejeitar(() => salvar('aluna.a', missao, registro), e => ['22023','22007','22008'].includes(e.code));
  }
});
test('banco jornada: mapa versionado acompanha exatamente as18 alternativas do conteúdo', () => {
  assert.equal(exercicios.versao, 1, 'uma nova versão exige mapa e migração correspondentes');
  const esperado = Object.fromEntries(Object.entries(exercicios.porId).map(([id, e]) => {
    const corretas = e.opcoes.filter(o => o.correta);
    assert.equal(corretas.length, 1, id + ': somente uma alternativa coerente');
    return [id, corretas[0].id];
  }));
  const trecho = SQL.match(/alternativa_correta := case p_missao([\s\S]*?)end;/)?.[1] || '';
  const atual = Object.fromEntries([...trecho.matchAll(/when '([^']+)' then '([^']+)'/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(atual, esperado);
  assert.deepEqual(Object.keys(atual), jornada.MISSOES_JORNADA);
});
test('banco jornada: todas as18 missões aceitam tentativa mas bloqueiam primeira conclusão errada', async () => {
  for (const [missao, e] of Object.entries(exercicios.porId)) {
    const correta = e.opcoes.find(o => o.correta), erradas = e.opcoes.filter(o => !o.correta);
    const draft = await salvar('aluna.a', missao, resposta({ opcao: erradas[0].id, concluida: false, data: '', desafioVersao: 1 }), 0, missao + '-draft');
    assert.equal(draft.registro.concluida, false, missao + ': a tentativa fica guardada');
    for (const errada of erradas) {
      await rejeitar(() => salvar('aluna.a', missao, resposta({ opcao: errada.id, desafioVersao: 1 }), 1, missao + '-erro-' + errada.id), { code: '22023' });
    }
    const feita = await salvar('aluna.a', missao, resposta({ opcao: correta.id, desafioVersao: 1 }), 1, missao + '-certa');
    assert.equal(feita.registro.concluida, true); assert.equal(feita.revision, 2);
    const revisada = await salvar('aluna.a', missao, resposta({ opcao: erradas[0].id, data: '2026-10-25', desafioVersao: 1 }), 2, missao + '-revisao');
    assert.equal(revisada.registro.concluida, true, 'editar não revoga a conclusão anterior');
    assert.equal(revisada.registro.data, '2026-10-24');
  }
  const linhas = (await db.query('select * from public.vof_jornada_pessoal')).rows;
  assert.equal(jornada.resumirJornada('aluna.a', linhas).xp, 540, 'revisões não multiplicam os pontos');
});
test('banco jornada: versão desconhecida é recusada e conclusão legada permanece editável', async () => {
  for (const concluida of [false, true]) {
    await rejeitar(() => salvar('aluna.a', 'arquitetura', resposta({ desafioVersao: 2, concluida }), 0, 'versao-2-' + concluida), { code: '22023' });
  }
  const legado = await salvar('aluna.a', 'arquitetura', resposta({ opcao: 'entrega' }));
  assert.equal(legado.registro.concluida, true, 'importação explícita do legado continua compatível');
  const revisada = await salvar('aluna.a', 'arquitetura', resposta({ opcao: 'entrega', desafioVersao: 1 }), 1, 'legado-editado');
  assert.equal(revisada.registro.concluida, true);
  assert.equal(jornada.resumirJornada('aluna.a', (await db.query('select * from public.vof_jornada_pessoal')).rows).xp, 30);
});
test('banco jornada: RLS e privilégios fecham tabelas/RPC, service_role executa sem definer', async () => {
  for (const tabela of ['vof_jornada_pessoal', 'vof_jornada_envios']) {
    assert.equal((await db.query('select relrowsecurity as ok from pg_class where relname=$1', [tabela])).rows[0].ok, true);
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await db.query("select has_table_privilege($1,$2,'select,insert,update,delete') as ok", [role, tabela])).rows[0].ok, false);
      assert.equal((await db.query("select has_function_privilege($1,'public.vof_jornada_salvar(text,text,jsonb,bigint,text)','execute') as ok", [role])).rows[0].ok, false);
    }
  }
  assert.equal((await db.query("select prosecdef from pg_proc where proname='vof_jornada_salvar'")).rows[0].prosecdef, false);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await rejeitar(() => salvar(), e => e.code === '42501');
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  assert.equal((await salvar()).revision, 1);
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int as n from pg_policies where tablename like 'vof_jornada_%'")).rows[0].n, 0);
});
