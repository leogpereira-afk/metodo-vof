import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { validarJornada } from '../supabase/functions/vof-sync/jornada.mjs';

const ler = nome => readFileSync(new URL('../' + nome, import.meta.url), 'utf8');
const copy = r => JSON.parse(JSON.stringify(r));
const reg = (texto = 'Uma evidência fictícia observada no teste.', extra = {}) => ({ opcao: 'evidencia', texto, concluida: true, data: '2026-10-24', ...extra });
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
function backend() {
  const b = { dados: new Map(), chamadas: [], mutations: new Map(), offline: false, deny: 0, beforeGet: null, beforeSave: null, loseAck: false, responseUser: null };
  const response = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => copy(data) });
  b.fetch = async (url, init) => {
    const body = JSON.parse(init.body), usuario = init.headers.Authorization.replace(/^Bearer /, '');
    b.chamadas.push({ usuario, ...copy(body) });
    if (b.offline) throw new TypeError('offline');
    if (b.deny) return response(b.deny, { erro: 'Falha programada.' });
    const outUser = b.responseUser || usuario;
    if (!b.dados.has(usuario)) b.dados.set(usuario, {});
    const respostas = b.dados.get(usuario);
    if (body.action === 'jornadaGet') {
      const snapshot = copy(respostas);
      if (b.beforeGet) await b.beforeGet(usuario);
      return response(200, { usuario: outUser, respostas: snapshot, xp: 9999 });
    }
    assert.equal(body.action, 'jornadaSalvar');
    assert.deepEqual(Object.keys(body).sort(), ['action', 'expectedRevision', 'missao', 'mutationId', 'registro']);
    try { validarJornada(body); } catch (e) { return response(e.status || 500, { erro: e.message }); } // Contrato HTTP real.
    if (b.beforeSave) await b.beforeSave(usuario, body);
    const k = usuario + ':' + body.mutationId;
    if (b.mutations.has(k)) {
      const recibo = b.mutations.get(k);
      return JSON.stringify(recibo.pedido) === JSON.stringify(body) ? response(200, recibo.resultado) : response(409, { erro: 'Envio já usado com outra resposta.' });
    }
    const anterior = respostas[body.missao];
    if ((anterior?.revision || 0) !== body.expectedRevision) return response(409, { erro: 'Conflito.' });
    const registro = copy(body.registro);
    if (anterior?.registro.concluida) { registro.concluida = true; registro.data = anterior.registro.data; }
    const item = { registro, revision: (anterior?.revision || 0) + 1, atualizado_em: '2026-10-24T12:00:00Z' };
    respostas[body.missao] = item;
    const result = { usuario: outUser, missao: body.missao, ...item }; b.mutations.set(k, { pedido: copy(body), resultado: result });
    if (b.loseAck) { b.loseAck = false; throw new TypeError('Resposta perdida depois de salvar.'); }
    return response(200, result);
  };
  return b;
}
function aparelho(b, usuario = 'aluno_teste', memoria = new Map()) {
  const listeners = {}, timers = new Map(); let timerSeq = 0, falhaQuota = false;
  const localStorage = { getItem: k => memoria.get(k) || null, setItem(k, v) { if (falhaQuota) throw new Error('Quota'); memoria.set(k, v); }, removeItem: k => memoria.delete(k), key: i => [...memoria.keys()][i], get length() { return memoria.size; } };
  const context = { console, localStorage, crypto: globalThis.crypto, AbortController, Date,
    setTimeout(fn) { const n = ++timerSeq; timers.set(n, fn); return n; }, clearTimeout: n => timers.delete(n),
    addEventListener(ev, fn) { (listeners[ev] ||= []).push(fn); },
    dispatchEvent(ev) { for (const fn of listeners[ev.type] || []) fn(ev); },
    CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o?.detail; } },
    fetch: b.fetch, API_BASE: 'https://exemplo.test', API_FN: { sync: 'vof-sync' },
    AUTH: { cracha: () => JSON.parse(memoria.get('vof_user') || 'null')?.usuario || '' } };
  context.window = context; vm.createContext(context);
  vm.runInContext(ler('store.js'), context);
  vm.runInContext('window.STORE = STORE', context);
  context.STORE.setUser(usuario ? { usuario } : null);
  vm.runInContext(ler('jornada-sync.js'), context);
  const api = context.VOFJornada;
  return { api, context, memoria, timers, usuario: u => context.STORE.setUser(u ? { usuario: u } : null), quota: v => { falhaQuota = v; },
    salvar(id, r) { const e = api.estado(); e.respostas[id] = r; return api.persistir(e, { id }); },
    ler: id => api.estado().respostas[id] };
}

test('jornada pessoal sincroniza entre dois aparelhos pela conta e calcula XP localmente', async () => {
  const b = backend(), a = aparelho(b), z = aparelho(b);
  assert.equal(a.salvar('arquitetura', reg()), true);
  assert.equal(a.api.status().estado, 'pendente');
  assert.equal(await a.api.sincronizar(), true);
  assert.equal(a.api.status().estado, 'ok');
  assert.equal(await z.api.conectar(), true);
  assert.equal(z.ler('arquitetura').texto, reg().texto);
  assert.equal(z.api.estado().xp, 30, 'ignora XP fornecido pelo servidor');
  assert.equal(z.api.status().pendentes, 0);
});

test('isolamento usa identidade exata e não normaliza maiúscula, acento ou conta', async () => {
  const b = backend(), a = aparelho(b, 'AlunoÁ');
  a.salvar('venda', reg()); await a.api.sincronizar();
  a.usuario('alunoa'); assert.equal(a.api.estado().xp, 0); await a.api.sincronizar();
  a.salvar('pessoas', reg('Outra conta tem outra resposta.')); await a.api.sincronizar();
  a.usuario('AlunoÁ'); assert.equal(a.api.estado().xp, 30); assert.equal(a.ler('pessoas'), undefined);
  assert.equal(a.ler('venda').texto, reg().texto);
  assert.ok(a.memoria.has('vof_jornada_pessoal_v1_Aluno%C3%81'));
  assert.ok(a.memoria.has('vof_jornada_pessoal_v1_alunoa'));
});

test('logout esconde respostas e não aceita gravação sem conta', async () => {
  const a = aparelho(backend()); a.salvar('venda', reg()); a.usuario(null);
  assert.equal(a.api.estado().xp, 0); assert.equal(a.ler('venda'), undefined);
  assert.equal(a.salvar('venda', reg()), false); assert.equal(await a.api.sincronizar(), false);
  a.usuario('aluno_teste'); assert.equal(a.api.estado().xp, 30, 'fila não enviada permanece para a mesma conta');
});

test('resposta de rede atrasada nunca entra na conta aberta depois', async () => {
  const b = backend(), a = aparelho(b), trava = defer();
  b.beforeGet = () => trava.promise;
  const p = a.api.conectar(); await Promise.resolve();
  a.usuario('outra_conta'); trava.resolve(); await p;
  assert.equal(a.api.estado().xp, 0); assert.notEqual(a.api.status().estado, 'ok');
  b.beforeGet = null; await a.api.conectar(); assert.equal(a.api.status().estado, 'ok');
});

test('confirmação de gravação em voo não contamina a conta seguinte', async () => {
  const b = backend(), a = aparelho(b), entrou = defer(), trava = defer();
  b.beforeSave = async () => { entrou.resolve(); await trava.promise; };
  a.salvar('venda', reg()); const p = a.api.sincronizar(); await entrou.promise;
  a.usuario('outra_conta'); a.salvar('pessoas', reg('Outro aluno registra sua própria prática.'));
  trava.resolve(); await p;
  assert.equal(a.ler('venda'), undefined); assert.equal(a.api.estado().xp, 30);
  assert.equal(a.api.status().pendentes, 1);
  b.beforeSave = null; await a.api.sincronizar();
  assert.equal(b.dados.get('outra_conta').venda, undefined);
  a.usuario('aluno_teste'); await a.api.sincronizar(); assert.equal(a.api.status().pendentes, 0);
});

test('logout e retorno à mesma conta também descartam chamada antiga', async () => {
  const b = backend(), a = aparelho(b), trava = defer(); b.beforeGet = () => trava.promise;
  const p = a.api.conectar(); await Promise.resolve(); a.usuario(null); a.usuario('aluno_teste');
  a.salvar('pessoas', reg()); trava.resolve(); await p;
  assert.equal(a.ler('pessoas').texto, reg().texto); assert.equal(a.api.status().pendentes, 1);
});

test('resposta com usuario divergente falha fechada e não é considerada sincronizada', async () => {
  const b = backend(), a = aparelho(b); b.responseUser = 'outra_conta';
  assert.equal(await a.api.sincronizar(), false); assert.equal(a.api.status().estado, 'erro');
  assert.equal(a.api.estado().xp, 0);
});

test('digitação fica durável imediatamente, com envio adiado e agrupado', async () => {
  const b = backend(), a = aparelho(b);
  a.salvar('venda', reg('Primeiro rascunho incompleto.', { concluida: false }));
  a.salvar('venda', reg('Segundo rascunho mais completo.', { concluida: false }));
  a.salvar('venda', reg('Resposta fictícia concluída.'));
  assert.equal(b.chamadas.length, 0); assert.equal(a.timers.size, 1);
  const novaAba = aparelho(b, 'aluno_teste', a.memoria);
  assert.equal(novaAba.ler('venda').texto, 'Resposta fictícia concluída.');
  await a.api.sincronizar(); assert.equal(b.chamadas.filter(x => x.action === 'jornadaSalvar').length, 1);
});

test('offline preserva fila e reabertura reenvia sem repetir pontos', async () => {
  const b = backend(), a = aparelho(b); b.offline = true;
  a.salvar('venda', reg()); assert.equal(await a.api.sincronizar(), false);
  assert.equal(a.api.status().estado, 'offline'); assert.equal(a.api.status().pendentes, 1);
  const recarregada = aparelho(b, 'aluno_teste', a.memoria);
  b.offline = false; await recarregada.api.sincronizar();
  assert.equal(recarregada.api.estado().xp, 30); assert.equal(recarregada.api.status().pendentes, 0);
  assert.equal(b.dados.get('aluno_teste').venda.revision, 1);
});

test('resposta perdida depois do commit reconcilia sem duplicar envio', async () => {
  const b = backend(), a = aparelho(b); a.salvar('venda', reg()); b.loseAck = true;
  await a.api.sincronizar(); assert.equal(a.api.status().estado, 'offline');
  await a.api.sincronizar(); assert.equal(a.api.status().estado, 'ok');
  assert.equal(b.dados.get('aluno_teste').venda.revision, 1); assert.equal(a.api.estado().xp, 30);
});

test('editar durante envio preserva a nova resposta com revisão atualizada', async () => {
  const b = backend(), a = aparelho(b), entrou = defer(), libera = defer();
  b.beforeSave = async () => { entrou.resolve(); await libera.promise; };
  a.salvar('venda', reg('Versão enviada antes de editar.')); const p = a.api.sincronizar(); await entrou.promise;
  a.salvar('venda', reg('Versão nova digitada durante o envio.')); libera.resolve(); await p;
  assert.equal(a.ler('venda').texto, 'Versão nova digitada durante o envio.');
  assert.equal(a.api.status().pendentes, 1);
  b.beforeSave = null; await a.api.sincronizar();
  assert.equal(a.api.status().estado, 'ok'); assert.equal(b.dados.get('aluno_teste').venda.registro.texto, 'Versão nova digitada durante o envio.');
});

test('duas missões editadas em aparelhos diferentes se combinam sem conflito', async () => {
  const b = backend(), a = aparelho(b), z = aparelho(b); await Promise.all([a.api.conectar(), z.api.conectar()]);
  a.salvar('venda', reg()); z.salvar('pessoas', reg()); await a.api.sincronizar(); await z.api.sincronizar(); await a.api.sincronizar();
  assert.equal(a.api.estado().xp, 60); assert.equal(z.api.estado().xp, 60); assert.equal(a.api.status().conflitos.length, 0);
});

test('mesma missão alterada nos dois aparelhos exige escolha; demais missões continuam', async () => {
  const b = backend(), a = aparelho(b), z = aparelho(b);
  a.salvar('venda', reg('Base original da missão.')); await a.api.sincronizar(); await z.api.sincronizar();
  a.salvar('venda', reg('Resposta nova no primeiro aparelho.')); await a.api.sincronizar();
  z.salvar('venda', reg('Resposta diferente no segundo aparelho.')); z.salvar('pessoas', reg()); await z.api.sincronizar();
  assert.equal(z.api.status().estado, 'conflito'); assert.equal(z.api.status().conflitos[0], 'venda');
  assert.equal(z.api.conflitosDetalhes()[0].servidor.texto, 'Resposta nova no primeiro aparelho.');
  assert.equal(z.ler('venda').texto, 'Resposta diferente no segundo aparelho.');
  assert.equal(b.dados.get('aluno_teste').pessoas.revision, 1);
  assert.equal(b.dados.get('aluno_teste').venda.registro.texto, 'Resposta nova no primeiro aparelho.');
  const recarregada = aparelho(b, 'aluno_teste', z.memoria);
  assert.equal(recarregada.api.status().estado, 'conflito');
  await recarregada.api.resolverConflito('venda', 'local');
  assert.equal(b.dados.get('aluno_teste').venda.registro.texto, 'Resposta diferente no segundo aparelho.');
  assert.equal(recarregada.api.status().estado, 'ok'); assert.equal(recarregada.api.estado().xp, 60);
});

test('resolver usando servidor descarta apenas a alternativa escolhida, sem reenvio', async () => {
  const b = backend(), a = aparelho(b), z = aparelho(b);
  a.salvar('venda', reg('Resposta do primeiro aparelho.')); z.salvar('venda', reg('Resposta do segundo aparelho.'));
  await a.api.sincronizar(); await z.api.sincronizar();
  const antes = b.chamadas.filter(x => x.action === 'jornadaSalvar').length;
  await z.api.resolverConflito('venda', 'servidor');
  assert.equal(z.ler('venda').texto, 'Resposta do primeiro aparelho.');
  assert.equal(b.chamadas.filter(x => x.action === 'jornadaSalvar').length, antes);
});

test('concorrência depois do GET recebe409 e guarda as duas versões', async () => {
  const b = backend(), a = aparelho(b), z = aparelho(b), trava = defer(), entrou = defer();
  a.salvar('venda', reg('Uma resposta concorrente do primeiro aparelho.'));
  z.salvar('venda', reg('Outra resposta concorrente do segundo aparelho.'));
  let primeiro = true;
  b.beforeSave = async () => { if (primeiro) { primeiro = false; entrou.resolve(); await trava.promise; } };
  const p = a.api.sincronizar(); await entrou.promise; await z.api.sincronizar(); trava.resolve(); await p;
  assert.equal(a.api.status().estado, 'conflito'); assert.equal(a.api.conflitosDetalhes()[0].revision, 1);
});

test('um novo conflito durante resolução não sobrescreve o servidor', async () => {
  const b = backend(), a = aparelho(b), z = aparelho(b);
  a.salvar('venda', reg('Versão primeira.')); z.salvar('venda', reg('Versão alternativa.'));
  await a.api.sincronizar(); await z.api.sincronizar();
  a.salvar('venda', reg('Versão mais recente depois do conflito.')); await a.api.sincronizar();
  assert.equal(await z.api.resolverConflito('venda', 'local'), false);
  assert.equal(z.api.status().estado, 'conflito'); assert.equal(z.api.conflitosDetalhes()[0].revision, 2);
  assert.equal(b.dados.get('aluno_teste').venda.registro.texto, 'Versão mais recente depois do conflito.');
});

test('legado sem dono não aparece nem sobe automaticamente; importação explícita atribui uma vez', async () => {
  const memoria = new Map([['vof_jornada_v1', JSON.stringify({ xp: 30, respostas: { venda: reg('Texto antigo de origem não identificada.') } })]]);
  const b = backend(), a = aparelho(b, 'aluno_teste', memoria);
  assert.equal(a.api.estado().xp, 0); assert.equal(a.ler('venda'), undefined); assert.equal(a.api.status().legadoDisponivel, true);
  await a.api.conectar(); assert.equal(b.chamadas.filter(c => c.action === 'jornadaSalvar').length, 0);
  assert.equal(a.api.importarLegado(), true); assert.equal(a.api.estado().xp, 30); await a.api.sincronizar();
  assert.equal(a.api.status().legadoDisponivel, false); assert.ok(memoria.has('vof_jornada_v1'));
  a.usuario('outra_conta'); assert.equal(a.api.importarLegado(), false); assert.equal(a.api.estado().xp, 0);
});

test('legado da Central também exige importação e conflitos não substituem respostas atuais', async () => {
  const memoria = new Map([['cl_vof_jornada_v1', JSON.stringify({ respostas: { venda: reg('Versão antiga da Central.') } })]]);
  const b = backend(), a = aparelho(b, 'aluno_teste', memoria);
  a.salvar('venda', reg('Versão atual ainda na fila.')); a.api.importarLegado();
  assert.equal(a.api.status().estado, 'conflito');
  const recarregada = aparelho(b, 'aluno_teste', memoria);
  await recarregada.api.resolverConflito('venda', 'servidor');
  assert.equal(b.dados.get('aluno_teste').venda.registro.texto, 'Versão atual ainda na fila.');
  assert.ok(memoria.has('cl_vof_jornada_v1'));
});

test('quota no aparelho não dá falso sucesso nem muda progresso em memória', async () => {
  const a = aparelho(backend()); a.quota(true);
  assert.equal(a.salvar('venda', reg()), false); assert.equal(a.api.estado().xp, 0); assert.equal(a.api.status().estado, 'erro');
});

test('quota depois do servidor salvar mantém a fila para reconciliação posterior', async () => {
  const b = backend(), a = aparelho(b);
  b.beforeSave = () => { a.quota(true); };
  a.salvar('venda', reg()); assert.equal(await a.api.sincronizar(), false);
  assert.equal(a.api.status().estado, 'erro'); assert.equal(a.api.status().pendentes, 1);
  assert.equal(b.dados.get('aluno_teste').venda.revision, 1);
  a.quota(false); b.beforeSave = null; assert.equal(await a.api.sincronizar(), true);
  assert.equal(a.api.status().pendentes, 0); assert.equal(b.dados.get('aluno_teste').venda.revision, 1);
});

test('resposta antiga não rebaixa uma revisão já recebida por outra aba', async () => {
  const b = backend(), a = aparelho(b), z = aparelho(b, 'aluno_teste', a.memoria), entrou = defer(), trava = defer();
  a.salvar('venda', reg('Versão inicial compartilhada.')); await a.api.sincronizar();
  await z.api.sincronizar();
  let primeira = true;
  b.beforeGet = async () => { if (primeira) { primeira = false; entrou.resolve(); await trava.promise; } };
  const p = a.api.sincronizar(); await entrou.promise;
  z.salvar('venda', reg('Versão mais nova recebida por outra aba.')); await z.api.sincronizar();
  a.context.dispatchEvent({ type: 'storage', key: 'vof_jornada_pessoal_v1_aluno_teste' });
  trava.resolve(); await p;
  assert.equal(a.ler('venda').texto, 'Versão mais nova recebida por outra aba.');
});

test('falhas401/403/500 preservam fila sem declarar sucesso', async () => {
  for (const code of [401, 403, 500]) {
    const b = backend(), a = aparelho(b); a.salvar('venda', reg()); b.deny = code;
    assert.equal(await a.api.sincronizar(), false); assert.equal(a.api.status().estado, 'erro'); assert.equal(a.api.status().pendentes, 1);
  }
});

test('conclusão e data não retrocedem ao editar nem limpeza apaga o histórico', async () => {
  const b = backend(), a = aparelho(b); a.salvar('venda', reg()); await a.api.sincronizar();
  a.salvar('venda', reg('Editar preservando a primeira conclusão.', { concluida: false, data: '2027-01-01' }));
  assert.equal(a.ler('venda').concluida, true); assert.equal(a.ler('venda').data, '2026-10-24');
  assert.equal(a.api.limpar(), false); a.api.persistir({ xp: 0, respostas: {} });
  assert.equal(a.api.estado().xp, 30); await a.api.sincronizar(); assert.equal(b.dados.get('aluno_teste').venda.registro.concluida, true);
});

test('campos práticos viajam e reaparecem no segundo aparelho', async () => {
  const b = backend(), a = aparelho(b), z = aparelho(b);
  a.salvar('venda', reg('Resposta com aplicação prática.', { desafioVersao: 1, pratica: { prazo: '2026-10-30', situacao: 'planejada', resultado: 'Resultado fictício registrado.', revisaoEm: '2026-11-01' } }));
  await a.api.sincronizar(); await z.api.sincronizar();
  assert.equal(z.ler('venda').pratica.prazo, '2026-10-30'); assert.equal(z.ler('venda').pratica.resultado, 'Resultado fictício registrado.');
  assert.equal(z.ler('venda').desafioVersao, 1);
});

test('IDs desconhecidos, tipos malformados e XP arbitrário não contam', async () => {
  const a = aparelho(backend());
  a.api.persistir({ xp: 99999, respostas: { toString: reg(), desconhecida: reg(), arquitetura: { opcao: {}, texto: [], concluida: 1 } } });
  assert.equal(a.api.estado().xp, 0); assert.equal(Object.keys(a.api.estado().respostas).length, 1);
  assert.equal(a.ler('arquitetura').texto, '');
});

test('duas abas com storage atrasado preservam filas de missões diferentes', async () => {
  const b = backend(), memoria = new Map(), a = aparelho(b, 'aluno_teste', memoria), z = aparelho(b, 'aluno_teste', memoria);
  a.api.estado(); z.api.estado();
  a.salvar('venda', reg('Resposta da primeira aba ainda não enviada.'));
  z.salvar('pessoas', reg('Resposta da segunda aba ainda não enviada.'));
  for (const aba of [a, z]) aba.context.dispatchEvent({ type: 'storage', key: 'vof_jornada_pessoal_v1_aluno_teste' });
  assert.deepEqual(Object.keys(a.api.estado().respostas).sort(), ['pessoas', 'venda']);
  assert.deepEqual(Object.keys(z.api.estado().respostas).sort(), ['pessoas', 'venda']);
  await z.api.sincronizar();
  assert.equal(b.dados.get('aluno_teste').venda.registro.texto, 'Resposta da primeira aba ainda não enviada.');
  assert.equal(b.dados.get('aluno_teste').pessoas.registro.texto, 'Resposta da segunda aba ainda não enviada.');
});

test('duas abas que editam a mesma missão preservam alternativas antes do primeiro envio', async () => {
  const b = backend(), memoria = new Map(), a = aparelho(b, 'aluno_teste', memoria), z = aparelho(b, 'aluno_teste', memoria);
  a.api.estado(); z.api.estado();
  a.salvar('venda', reg('Resposta nova na aba A.'));
  z.salvar('venda', reg('Resposta diferente na aba B.'));
  assert.equal(z.api.status().estado, 'conflito');
  const conflito = z.api.conflitosDetalhes()[0];
  assert.equal(conflito.local.texto, 'Resposta diferente na aba B.');
  assert.equal(conflito.servidor.texto, 'Resposta nova na aba A.');
  assert.equal(conflito.servidorPendente, true);
  await z.api.resolverConflito('venda', 'servidor');
  assert.equal(b.dados.get('aluno_teste').venda.registro.texto, 'Resposta nova na aba A.');
});

test('ACK antigo de POST não rebaixa revisão mais nova já salva por outra aba', async () => {
  const b = backend(), commit = defer(), libera = defer(), original = b.fetch;
  let primeiro = true;
  b.fetch = async (...args) => {
    const r = await original(...args);
    if (JSON.parse(args[1].body).action === 'jornadaSalvar' && primeiro) { primeiro = false; commit.resolve(); await libera.promise; }
    return r;
  };
  const memoria = new Map(), a = aparelho(b, 'aluno_teste', memoria), z = aparelho(b, 'aluno_teste', memoria);
  a.salvar('venda', reg('Primeira revisão confirmada com ACK atrasado.'));
  const envio = a.api.sincronizar(); await commit.promise;
  await z.api.sincronizar();
  z.salvar('venda', reg('Segunda revisão já confirmada na outra aba.')); await z.api.sincronizar();
  a.context.dispatchEvent({ type: 'storage', key: 'vof_jornada_pessoal_v1_aluno_teste' });
  libera.resolve(); await envio;
  assert.equal(a.ler('venda').texto, 'Segunda revisão já confirmada na outra aba.');
  assert.equal(JSON.parse(memoria.get('vof_jornada_pessoal_v1_aluno_teste')).entradas.venda.revision, 2);
  assert.equal(a.api.status().pendentes, 0);
});

test('rascunho inválido após conclusão não bloqueia outras missões e retoma após correção', async () => {
  const b = backend(), a = aparelho(b);
  a.salvar('arquitetura', reg()); await a.api.sincronizar();
  a.salvar('arquitetura', reg('', { concluida: false })); // está editando uma resposta já concluída
  a.salvar('pessoas', reg('Outra missão válida deve continuar sincronizando.'));
  assert.equal(await a.api.sincronizar(), false);
  assert.equal(a.api.status().estado, 'erro');
  assert.equal(a.api.status().pendentes, 1);
  assert.equal(b.dados.get('aluno_teste').pessoas.revision, 1);
  const chamadas = b.chamadas.filter(c => c.action === 'jornadaSalvar').length;
  await a.api.sincronizar();
  assert.equal(b.chamadas.filter(c => c.action === 'jornadaSalvar').length, chamadas, 'não repete indefinidamente o mesmo envio inválido');
  a.salvar('arquitetura', reg('Resposta corrigida com evidência suficiente.'));
  assert.equal(await a.api.sincronizar(), true);
  assert.equal(a.api.status().estado, 'ok');
  assert.equal(b.dados.get('aluno_teste').arquitetura.revision, 2);
});

test('interleaving real entre read/write não perde missão nem depende do snapshot agregado', async () => {
  const b = backend(), memoria = new Map(), a = aparelho(b, 'aluno_teste', memoria), z = aparelho(b, 'aluno_teste', memoria);
  a.api.estado(); z.api.estado();
  const escrever = a.context.localStorage.setItem; let uma = true;
  a.context.localStorage.setItem = (k, v) => {
    if (uma && k.includes('::rascunho::')) { uma = false; z.salvar('pessoas', reg('Segunda aba gravou entre leitura e escrita da primeira.')); }
    escrever(k, v);
  };
  a.salvar('venda', reg('Primeira aba termina sua gravação depois.'));
  const reaberta = aparelho(b, 'aluno_teste', memoria);
  assert.deepEqual(Object.keys(reaberta.api.estado().respostas).sort(), ['pessoas', 'venda']);
  await reaberta.api.sincronizar();
  assert.deepEqual(Object.keys(b.dados.get('aluno_teste')).sort(), ['pessoas', 'venda']);
});

test('interleaving da mesma missão guarda irmãos e exige escolha sem perder resposta', async () => {
  const b = backend(), memoria = new Map(), a = aparelho(b, 'aluno_teste', memoria), z = aparelho(b, 'aluno_teste', memoria);
  a.api.estado(); z.api.estado();
  const escrever = a.context.localStorage.setItem; let uma = true;
  a.context.localStorage.setItem = (k, v) => {
    if (uma && k.includes('::rascunho::')) { uma = false; z.salvar('venda', reg('Resposta concorrente da segunda aba.')); }
    escrever(k, v);
  };
  a.salvar('venda', reg('Resposta concorrente da primeira aba.'));
  const reaberta = aparelho(b, 'aluno_teste', memoria);
  const c = reaberta.api.conflitosDetalhes()[0];
  assert.deepEqual([c.local.texto, c.servidor.texto].sort(), ['Resposta concorrente da primeira aba.', 'Resposta concorrente da segunda aba.'].sort());
  assert.equal(await reaberta.api.sincronizar(), false);
  assert.equal(Object.keys(b.dados.get('aluno_teste')).length, 0);
  await reaberta.api.resolverConflito('venda', 'local');
  assert.equal(b.dados.get('aluno_teste').venda.registro.texto, c.local.texto);
});

test('terceira alternativa concorrente continua disponível depois de resolver as duas primeiras', async () => {
  const b = backend(), memoria = new Map(), abas = [0, 1, 2].map(() => aparelho(b, 'aluno_teste', memoria));
  for (const aba of abas) aba.api.estado();
  for (let i = 0; i < abas.length; i++) abas[i].salvar('venda', reg('Resposta fictícia da aba número ' + i + '.'));
  const reaberta = aparelho(b, 'aluno_teste', memoria), inicial = reaberta.api.conflitosDetalhes()[0];
  const escolhida = inicial.local.texto, preservadas = [inicial.local.texto, inicial.servidor.texto];
  await reaberta.api.resolverConflito('venda', 'local');
  const seguinte = reaberta.api.conflitosDetalhes()[0];
  assert.ok(seguinte, 'a terceira alternativa ainda requer escolha');
  assert.ok([seguinte.local.texto, seguinte.servidor.texto].includes(escolhida));
  assert.ok([seguinte.local.texto, seguinte.servidor.texto].some(t => !preservadas.includes(t)));
});

test('reconciliação de uma alternativa igual ao servidor não descarta outra alternativa local', async () => {
  const b = backend(), memoria = new Map(), a = aparelho(b, 'aluno_teste', memoria), z = aparelho(b, 'aluno_teste', memoria);
  a.api.estado(); z.api.estado();
  a.salvar('venda', reg('Resposta já conhecida pelo servidor.'));
  z.salvar('venda', reg('Outra resposta local que precisa de escolha.'));
  b.dados.set('aluno_teste', { venda: { registro: reg('Resposta já conhecida pelo servidor.'), revision: 1, atualizado_em: '2026-10-24T12:00:00Z' } });
  a.context.dispatchEvent({ type: 'storage', key: 'vof_jornada_pessoal_v1_aluno_teste' });
  await a.api.sincronizar();
  const c = a.api.conflitosDetalhes()[0];
  assert.ok(c);
  assert.equal(c.local.texto, 'Outra resposta local que precisa de escolha.');
  assert.equal(c.servidor.texto, 'Resposta já conhecida pelo servidor.');
});

test('reconhecer um ramo não confirma o pai nem libera outro ramo concorrente para sobrescrever', async () => {
  const b = backend(), memoria = new Map(), a = aparelho(b, 'aluno_teste', memoria);
  a.salvar('venda', reg('Rascunho base ainda não enviado.'));
  const z = aparelho(b, 'aluno_teste', memoria); z.api.estado();
  a.salvar('venda', reg('Ramo A conhecido depois pelo servidor.'));
  z.salvar('venda', reg('Ramo B precisa continuar em conflito.'));
  b.dados.set('aluno_teste', { venda: { registro: reg('Ramo A conhecido depois pelo servidor.'), revision: 1, atualizado_em: '2026-10-24T12:00:00Z' } });
  a.context.dispatchEvent({ type: 'storage', key: 'vof_jornada_pessoal_v1_aluno_teste' });
  await a.api.sincronizar();
  const c = a.api.conflitosDetalhes()[0];
  assert.ok(c);
  assert.equal(c.local.texto, 'Ramo B precisa continuar em conflito.');
  assert.equal(b.dados.get('aluno_teste').venda.registro.texto, 'Ramo A conhecido depois pelo servidor.');
  assert.equal(b.chamadas.filter(x => x.action === 'jornadaSalvar').length, 0);
});

test('trocar somente o crachá entre GET e POST nunca envia a fila para a nova conta', async () => {
  const b = backend(), a = aparelho(b), entrou = defer(), libera = defer();
  a.salvar('venda', reg('Resposta privada da primeira conta fictícia.'));
  b.beforeGet = async () => { entrou.resolve(); await libera.promise; };
  const p = a.api.sincronizar(); await entrou.promise;
  a.context.AUTH.cracha = () => 'outra_conta'; // usuário armazenado ainda é o anterior
  libera.resolve(); assert.equal(await p, false);
  assert.equal(b.chamadas.filter(x => x.action === 'jornadaSalvar').length, 0);
  assert.equal(a.api.status().pendentes, 1);
  assert.equal(a.api.status().estado, 'pendente');
  b.beforeGet = null; assert.equal(await a.api.sincronizar(), false);
  assert.equal(Object.keys(b.dados.get('outra_conta') || {}).length, 0);
});

test('transporte recusa token diferente do capturado sem emitir POST nem incluir token no corpo', async () => {
  const b = backend(), a = aparelho(b);
  await assert.rejects(a.context.STORE.jornadaSalvar({ missao: 'venda', registro: reg(), expectedRevision: 0, mutationId: 'teste-token' }, 'token-antigo'), e => e.tipo === 'sessao');
  assert.equal(b.chamadas.length, 0);
});

test('troca de conta pelo token esconde jornada antiga antes da atualização do usuário armazenado', async () => {
  const b = backend(), a = aparelho(b);
  a.salvar('venda', reg('Resposta privada preservada na primeira conta.'));
  a.context.AUTH.CHAVE = 'vof_cracha';
  a.context.AUTH.dono = () => ({ usuario: 'outra_conta' });
  a.context.AUTH.cracha = () => 'outra_conta';
  a.context.dispatchEvent({ type: 'storage', key: 'vof_cracha' });
  assert.equal(a.api.estado().xp, 0);
  assert.equal(Object.keys(a.api.estado().respostas).length, 0);
  assert.equal(a.api.persistir({ respostas: { pessoas: reg() } }), false);
  assert.equal(await a.api.sincronizar(), false);
  assert.equal(b.chamadas.length, 0);
  a.context.AUTH.dono = () => ({ usuario: 'aluno_teste' });
  a.context.AUTH.cracha = () => 'aluno_teste';
  a.context.dispatchEvent({ type: 'storage', key: 'vof_cracha' });
  assert.equal(a.ler('venda').texto, 'Resposta privada preservada na primeira conta.');
  assert.equal(a.api.status().pendentes, 1);
});
