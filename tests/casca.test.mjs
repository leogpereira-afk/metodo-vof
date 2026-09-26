// Testes da CASCA do Método V.O.F.: login, crachá, porta única (apiFn),
// áreas, diagnóstico, plano, apostila, apresentação, sala e publicação.
// Rodar: node --test tests/
//
// Nomes, turmas e empresas daqui são inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, mkdirSync, cpSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { montar, crachaFalso, servidorFalso, assentar, ler, existe, RAIZ } from './helpers/casca.mjs';
import { conferir } from '../scripts/conferir-publicacao.mjs';

const TRAVESSAO = String.fromCharCode(8212), MEIA_RISCA = String.fromCharCode(8211);
const ARQUIVOS_DA_CASCA = ['index.html', 'config.js', 'auth.js', 'store.js', 'app.js', 'styles.css', 'sw.js', 'manifest.webmanifest', 'favicon.svg', 'package.json',
  '.github/workflows/deploy.yml', '.github/workflows/verificar.yml', 'scripts/conferir-publicacao.mjs', 'tests/casca.test.mjs', 'tests/inicio.test.mjs', 'tests/helpers/casca.mjs'];

const DADOS = () => ({
  turmas: [
    { id: 't-norte', nome: 'Turma Piloto Norte', nivel: 1, status: 'em andamento', inicio: '2026-09-01', participantes: 12, empresaId: 'e-exemplo', facilitador: 'Facilitadora de Teste', obs: '' },
    { id: 't-sul', nome: 'Turma Aberta Sul', nivel: 2, status: 'planejada', inicio: '2026-11-03', participantes: 8, empresaId: '', facilitador: '', obs: '' },
  ],
  empresas: [{ id: 'e-exemplo', nome: 'Empresa Exemplo Ltda', segmento: 'Serviços', cidade: 'Cidade Fictícia', contato: 'Contato Fictício', obs: '' }],
  planos: [{ id: 'plano-t-norte', turmaId: 't-norte', restricao: 'Prazo de entrega', meta: 'Entregar 90% no prazo', indicador: 'Entregas no prazo', responsavel: 'Responsável Fictício', dia0: '2026-09-01',
    marcos: [{ id: 'm1', fase: 'Até dia 30', acao: 'Mapear a fila do gargalo', evidencia: '', feito: false, data: '' }], checklist: {} }],
  diagnosticos: [],
});
const CONTEUDO = {
  dinamicas: { itens: [
    { nome: 'Roda de promessas', objetivo: 'Ligar a venda à entrega', como_conduzir: 'Passo um.\nPasso dois.', tempo: '20 min', pilar: 'Venda', fonte: 'Material de teste p. 1' },
    { nome: 'Fila visível', objetivo: 'Mostrar a capacidade', pilar: 'Operação', fonte: 'Material de teste p. 2' },
  ] },
  insights: { pontos_chave: [{ tese: 'Caixa não é lucro', explicacao: 'Explicação de teste', pilar: 'Finanças' }], pulos_do_gato: [{ titulo: 'Pergunta antes do preço', como_aplicar: 'Aplicação de teste', pilar: 'Venda' }], casos: [{ titulo: 'Caso fictício', licao: 'Lição de teste' }], temas: [{ titulo: 'Tema fictício', resumo: 'Resumo de teste' }] },
  checklist: { itens: [{ id: 'c1', texto: 'Restrição escolhida com a equipe' }, { id: 'c2', texto: 'Indicador com linha de base' }] },
};
async function abrir(opcoes = {}) {
  const servidor = opcoes.servidor || servidorFalso({ dados: DADOS(), conteudo: opcoes.conteudo, papel: opcoes.papel || 'facilitador', falhas: opcoes.falhas });
  const p = montar({ cracha: opcoes.semCracha ? null : (opcoes.cracha || crachaFalso({ papel: opcoes.papel || 'facilitador' })), servidor, metodo: opcoes.metodo || 'falso', hash: opcoes.hash || '#/', usuarioSalvo: opcoes.usuarioSalvo });
  await assentar();
  return p;
}
const semComentarios = codigo => codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ───────────── segredo, crachá e login ───────────── */
test('config.js não guarda token nem segredo: só o endereço e o nome da porta', () => {
  const fonte = ler('config.js');
  const codigo = semComentarios(fonte);
  assert.doesNotMatch(codigo, /token|secret|segredo|senha|apikey|api_key|anon|service|bearer|eyJ/i);
  assert.doesNotMatch(fonte, /eyJ[A-Za-z0-9_-]{10,}/);
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fonte, ctx);
  assert.deepEqual(Object.keys(ctx.window).sort(), ['API_BASE', 'API_FN']);
  assert.equal(ctx.window.API_FN.sync, 'vof-sync');
  assert.match(ctx.window.API_BASE, /^https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1$/);
});

test('auth.js: sistema "vof", chave "vof_cracha" e AUTH como const (não window.AUTH)', async () => {
  const fonte = ler('auth.js');
  assert.match(fonte, /const SISTEMA = 'vof'/);
  assert.match(fonte, /const K_TOKEN = 'vof_cracha'/);
  assert.match(fonte, /^const AUTH = /m);
  assert.doesNotMatch(fonte, /window\.AUTH/);
  const p = await abrir();
  assert.equal(p.run('AUTH.CHAVE'), 'vof_cracha');
  assert.equal(p.run('AUTH.dono().usuario'), 'zz_facilitadora');
  assert.equal(p.run("typeof window.AUTH"), 'undefined');
  p.memoria.set('vof_cracha', crachaFalso({ sis: 'pops' }));
  assert.equal(p.run('AUTH.dono()'), null, 'crachá de outro sistema não tem dono aqui');
  p.memoria.set('vof_cracha', crachaFalso({ exp: Math.floor(Date.now() / 1000) - 10 }));
  assert.equal(p.run('AUTH.dono()'), null, 'crachá vencido não tem dono');
  p.memoria.set('vof_cracha', 'lixo');
  assert.equal(p.run('AUTH.dono()'), null);
});

test('sem crachá, a tela de login aparece e nada é pedido ao vof-sync', async () => {
  const p = await abrir({ semCracha: true });
  assert.ok(p.document.querySelector('#lg-u'));
  assert.ok(p.document.querySelector('#lg-s'));
  assert.equal(p.document.querySelector('.cab'), null);
  assert.equal(p.servidor.doSync().length, 0);
});

test('entrada única: crachá plantado SEM usuário salvo abre o app com nome e papel', async () => {
  const p = await abrir();
  assert.equal(p.document.querySelector('#lg-u'), null);
  assert.equal(p.document.querySelector('[data-quem-nome]').textContent, 'Facilitadora de Teste');
  assert.equal(p.document.querySelector('[data-quem-papel]').textContent, 'Facilitador');
  assert.ok(p.document.querySelector('[data-sair]'));
  assert.equal(JSON.parse(p.memoria.get('vof_user')).usuario, 'zz_facilitadora');
});

test('crachá de outra pessoa que não a salva: vale o dono do crachá', async () => {
  const p = await abrir({ usuarioSalvo: { usuario: 'zz_outra', nome: 'Outra Pessoa Fictícia', papel: 'admin' } });
  assert.equal(p.document.querySelector('[data-quem-nome]').textContent, 'Facilitadora de Teste');
  assert.equal(p.document.querySelector('[data-quem-papel]').textContent, 'Facilitador');
});

test('crachá de outro sistema na chave do V.O.F. cai no login, com recado, e é descartado', async () => {
  const p = await abrir({ cracha: crachaFalso({ sis: 'pops' }) });
  assert.ok(p.document.querySelector('#lg-u'));
  assert.match(p.texto(), /Entre de novo/);
  assert.equal(p.memoria.has('vof_cracha'), false);
});

test('Sair apaga o crachá, a cópia dos dados desta conta e volta ao login', async () => {
  const p = await abrir();
  assert.ok([...p.memoria.keys()].some(k => k.startsWith('vof_cache_v1_')), 'havia cópia local');
  p.document.querySelector('[data-sair]').click();
  await assentar();
  assert.ok(p.document.querySelector('#lg-u'));
  assert.equal(p.memoria.has('vof_cracha'), false);
  assert.equal(p.memoria.has('vof_user'), false);
  assert.equal([...p.memoria.keys()].filter(k => k.startsWith('vof_cache_v1_')).length, 0, 'computador emprestado não guarda dado de cliente');
});

test('Sair com rascunho não salvo pergunta antes de apagar', async () => {
  const p = await abrir();
  await p.irPara('#/diagnostico/novo');
  const r = p.document.querySelector('input[name="nota-v1"][value="2"]');
  r.checked = true; p.evento(r, 'change');
  p.document.querySelector('[data-sair]').click();
  await assentar();
  assert.match(p.document.querySelector('#overlays').textContent, /1 rascunho\(s\)/);
  assert.ok(p.memoria.has('vof_cracha'), 'ainda não saiu');
  p.document.querySelector('#overlays [data-sim]').click();
  await assentar();
  assert.ok(p.document.querySelector('#lg-u'));
  assert.equal([...p.memoria.keys()].filter(k => k.startsWith('vof_rascunho_v1_')).length, 0);
});

test('queda de sessão (401) NÃO apaga rascunho: a mesma pessoa entra e continua', async () => {
  const p = await abrir({ falhas: { ping: { status: 401, corpo: { erro: 'Entre no sistema.' } } } });
  await p.irPara('#/diagnostico/novo');
  const r = p.document.querySelector('input[name="nota-v1"][value="2"]');
  r.checked = true; p.evento(r, 'change');
  p.run("STORE.apiFn('ping').catch(() => {})");
  await assentar();
  assert.ok(p.document.querySelector('#lg-u'), 'caiu no login');
  assert.match(p.texto(), /Entre de novo/);
  assert.equal([...p.memoria.keys()].filter(k => k.startsWith('vof_rascunho_v1_')).length, 1, 'o rascunho ficou');
});

/* ───────────── a porta única: 401, 403 e rede ───────────── */
test('apiFn manda o crachá no Authorization, em toda chamada ao vof-sync', async () => {
  const p = await abrir();
  const chamadas = p.servidor.doSync();
  assert.ok(chamadas.length > 0);
  for (const c of chamadas) assert.match(c.auth, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  assert.match(ler('store.js'), /'Authorization': 'Bearer ' \+ cracha/);
});

test('401 do vof-sync leva ao login com o recado "Entre de novo"', async () => {
  const p = await abrir({ falhas: { rev: { status: 401, corpo: { erro: 'Entre no sistema.' } } } });
  assert.ok(p.document.querySelector('#lg-u'), 'voltou ao login');
  assert.match(p.texto(), /Entre de novo/);
  assert.equal(p.memoria.has('vof_cracha'), false);
});

test('401 com motivo do servidor mostra o motivo junto', async () => {
  const p = await abrir({ falhas: { rev: { status: 401, corpo: { erro: 'Seu acesso foi encerrado. Fale com a gestão.' } } } });
  assert.match(p.texto(), /Entre de novo\. Motivo: Seu acesso foi encerrado/);
});

test('erro de rede NÃO é 401: a sessão continua e a faixa diz a causa', async () => {
  const p = await abrir({ falhas: { rev: 'rede', list: 'rede' } });
  assert.equal(p.document.querySelector('#lg-u'), null, 'não foi jogado para o login');
  assert.ok(p.memoria.has('vof_cracha'));
  assert.match(p.document.querySelector('#faixa-sync').textContent, /Sem conexão/);
});

test('403 diz "Seu acesso não permite" e o formulário continua com o que foi digitado', async () => {
  const p = await abrir({ falhas: { upsert: { status: 403, corpo: { erro: 'Seu acesso não permite esta alteração.' } } } });
  await p.irPara('#/turmas');
  p.document.querySelector('[data-nova-turma]').click();
  const form = p.document.querySelector('#overlays [data-form]');
  form.querySelector('[name=nome]').value = 'Turma Fictícia Leste';
  p.evento(form, 'submit');
  await assentar();
  const modal = p.document.querySelector('#overlays dialog');
  assert.ok(modal, 'o modal continua aberto');
  assert.match(modal.textContent, /Seu acesso não permite/);
  assert.equal(modal.querySelector('[name=nome]').value, 'Turma Fictícia Leste');
});

test('conflito (409) não sobrescreve calado: explica e preserva o que foi escrito', async () => {
  const p = await abrir({ falhas: { upsert: { status: 409, corpo: { erro: 'Outra pessoa atualizou este item.' } } } });
  await p.irPara('#/turmas');
  p.document.querySelector('[data-editar-turma="t-norte"]').click();
  const form = p.document.querySelector('#overlays [data-form]');
  form.querySelector('[name=obs]').value = 'Anotação que não pode sumir';
  p.evento(form, 'submit');
  await assentar();
  const modal = p.document.querySelector('#overlays dialog');
  assert.match(modal.textContent, /outra pessoa alterou/i);
  assert.equal(modal.querySelector('[name=obs]').value, 'Anotação que não pode sumir');
});

/* ───────────── as áreas ───────────── */
test('com crachá e servidor falso, todas as áreas desenham sem "undefined" nem "NaN"', async () => {
  const p = await abrir({ conteudo: CONTEUDO });
  const esperado = {
    '#/': /Turmas em andamento[\s\S]*Turma Piloto Norte[\s\S]*Próximos marcos[\s\S]*Mapear a fila do gargalo/,
    '#/metodo': /Método desenhado/,
    '#/dinamicas': /Roda de promessas/,
    '#/turmas': /Turma Piloto Norte[\s\S]*Empresa Exemplo Ltda/,
    '#/diagnostico': /Turma ou empresa/,
    '#/diagnostico/novo': /Resultado/,
    '#/plano': /Turma Piloto Norte[\s\S]*Restrição: Prazo de entrega/,
    '#/plano/t-norte': /Marcos[\s\S]*Até dia 90/,
    '#/apostila': /Baixar a apostila/,
    '#/apresentacao': /Projetar/,
    '#/palco': /Abertura de teste/,
    '#/controle/ABC234': /Sala ABC234/,
  };
  for (const [hash, re] of Object.entries(esperado)) {
    await p.irPara(hash);
    const t = p.texto();
    assert.match(t, re, 'área ' + hash);
    assert.doesNotMatch(t, /undefined|NaN|\[object /, 'área ' + hash);
  }
  assert.equal(p.document.querySelectorAll('.pratica').length, 0, 'saiu do editor');
  assert.equal(p.run('window.__renders'), 1, 'o método foi desenhado uma vez só');
});

test('Método: o mesmo nó volta a cada visita e recebe abrirComplemento e abrirApostila', async () => {
  const p = await abrir();
  await p.irPara('#/metodo');
  await p.irPara('#/turmas');
  await p.irPara('#/metodo');
  assert.equal(p.run('window.__renders'), 1);
  assert.equal(p.run('typeof window.__opcoesRender.abrirComplemento'), 'function');
  assert.equal(p.run('typeof window.__opcoesRender.abrirApostila'), 'function');
  p.run("window.__opcoesRender.abrirComplemento('arquitetura')");
  await assentar();
  assert.equal(p.run('location.hash'), '#/dinamicas/arquitetura');
  assert.match(p.texto(), /Complemento do módulo: Arquitetura do método|ainda não foi carregado/);
});

test('sem metodo.js, as áreas dizem o que faltou e turmas continuam funcionando', async () => {
  const p = await abrir({ metodo: 'nenhum' });
  await p.irPara('#/metodo');
  assert.match(p.texto(), /não carregou/);
  await p.irPara('#/diagnostico/novo');
  assert.match(p.texto(), /não carregaram/);
  await p.irPara('#/turmas');
  assert.match(p.texto(), /Turma Piloto Norte/);
});

test('Dinâmicas e APN: sem conteúdo no banco, diz que ainda não foi carregado', async () => {
  const p = await abrir();
  await p.irPara('#/dinamicas');
  assert.match(p.texto(), /ainda não foi carregado/);
});

test('Dinâmicas e APN: filtro por pilar e busca escondem sem redesenhar', async () => {
  const p = await abrir({ conteudo: CONTEUDO });
  await p.irPara('#/dinamicas');
  const itens = () => [...p.document.querySelectorAll('[data-secao-corpo="dinamicas"] .apn-item')];
  assert.equal(itens().length, 2);
  const primeiro = itens()[0];
  p.document.querySelector('[data-pilar="operacao"]').click();
  assert.deepEqual(itens().map(i => i.hidden), [true, false]);
  assert.equal(itens()[0], primeiro, 'o mesmo elemento: filtro não redesenha');
  p.document.querySelector('[data-pilar=""]').click();
  const busca = p.document.querySelector('[data-apn-busca]');
  busca.value = 'promessas';
  p.evento(busca, 'input');
  assert.deepEqual(itens().map(i => i.hidden), [false, true]);
  assert.equal(p.document.querySelector('[data-apn-busca]').value, 'promessas');
  p.document.querySelector('[data-secao="pulos"]').click();
  assert.equal(p.document.querySelector('[data-secao-corpo="pulos"]').hidden, false);
  assert.match(p.document.querySelector('[data-secao-corpo="pulos"]').textContent, /Pergunta antes do preço/);
});

/* ───────────── turmas e empresas ───────────── */
test('facilitador cria turma e não vê "Apagar"; o registro segue a forma do contrato', async () => {
  const p = await abrir();
  await p.irPara('#/turmas');
  assert.equal(p.document.querySelector('[data-apagar-turma]'), null);
  assert.equal(p.document.querySelector('[data-apagar-empresa]'), null);
  p.document.querySelector('[data-nova-turma]').click();
  const form = p.document.querySelector('#overlays [data-form]');
  form.querySelector('[name=nome]').value = 'Turma Fictícia Oeste';
  form.querySelector('[name=participantes]').value = '15';
  p.evento(form, 'submit');
  await assentar();
  const up = p.servidor.doSync('upsert').pop();
  assert.equal(up.colecao, 'turmas');
  assert.equal(up.expectedRevision, 0);
  assert.equal(up.registro.nome, 'Turma Fictícia Oeste');
  assert.equal(up.registro.participantes, 15);
  assert.equal(up.registro.nivel, 1);
  assert.ok(['planejada', 'em andamento', 'concluída'].includes(up.registro.status));
  assert.deepEqual(Object.keys(up.registro).sort(), ['empresaId', 'facilitador', 'id', 'inicio', 'nivel', 'nome', 'obs', 'participantes', 'status']);
  assert.equal(p.document.querySelector('#overlays dialog'), null, 'o modal fechou');
  assert.match(p.texto(), /Turma Fictícia Oeste/);
});

test('participantes aceita só número: nome de pessoa não entra', async () => {
  const p = await abrir();
  await p.irPara('#/turmas');
  p.document.querySelector('[data-nova-turma]').click();
  const form = p.document.querySelector('#overlays [data-form]');
  form.querySelector('[name=nome]').value = 'Turma Fictícia';
  form.querySelector('[name=participantes]').value = 'Fulano e Beltrano';
  p.evento(form, 'submit');
  await assentar();
  assert.match(p.document.querySelector('#overlays').textContent, /número inteiro/);
  assert.equal(p.servidor.doSync('upsert').length, 0);
});

test('admin vê "Apagar" e só apaga digitando o código do registro', async () => {
  const p = await abrir({ papel: 'admin', cracha: crachaFalso({ papel: 'admin', sub: 'zz_admin', nome: 'Admin Fictício' }) });
  await p.irPara('#/turmas');
  p.document.querySelector('[data-apagar-turma="t-sul"]').click();
  const form = p.document.querySelector('#overlays [data-form]');
  form.querySelector('[name=codigo]').value = 'Turma Aberta Sul';
  p.evento(form, 'submit');
  await assentar();
  assert.equal(p.servidor.doSync('delete').length, 0, 'nome não apaga');
  form.querySelector('[name=codigo]').value = 'tsul';
  p.evento(form, 'submit');
  await assentar();
  const del = p.servidor.doSync('delete');
  assert.equal(del.length, 1);
  assert.equal(del[0].id, 't-sul');
  assert.doesNotMatch(p.texto(), /Turma Aberta Sul/);
});

test('modal de turma não perde o que foi digitado quando a tela redesenha', async () => {
  const p = await abrir();
  await p.irPara('#/turmas');
  p.document.querySelector('[data-nova-turma]').click();
  p.document.querySelector('#overlays [name=nome]').value = 'Digitando agora';
  p.run('renderApp()');
  await p.run('STORE.atualizar()');
  await assentar();
  assert.equal(p.document.querySelector('#overlays [name=nome]').value, 'Digitando agora');
});

/* ───────────── diagnóstico ───────────── */
async function preencherDiagnostico(p, nota) {
  const form = p.document.querySelector('[data-diag-form]');
  const radios = [...form.querySelectorAll('input[type=radio][value="' + nota + '"]')];
  for (const r of radios) { r.checked = true; p.evento(r, 'change'); }
  return radios.length;
}
function escolherAlvo(p, valor) {
  const sel = p.document.querySelector('[data-campo=alvo]');
  sel.querySelectorAll('option').forEach(o => { if (o.getAttribute('value') === valor) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
  p.evento(sel, 'change');
}

test('diagnóstico com todas as notas 4 mostra 100', async () => {
  const p = await abrir();
  await p.irPara('#/diagnostico/novo');
  assert.equal(p.document.querySelectorAll('.pratica').length, 25);
  assert.equal(await preencherDiagnostico(p, 4), 25);
  assert.equal(p.document.querySelector('[data-geral]').textContent, '100');
  assert.match(p.document.querySelector('#diag-resultado').textContent, /As 25 práticas estão pontuadas/);
});

test('diagnóstico incompleto não vira zero: fica "em aberto"', async () => {
  const p = await abrir();
  await p.irPara('#/diagnostico/novo');
  const r = p.document.querySelector('input[name="nota-v1"][value="3"]');
  r.checked = true; p.evento(r, 'change');
  assert.equal(p.document.querySelector('[data-geral]').textContent, 'em aberto');
  assert.match(p.document.querySelector('#diag-resultado').textContent, /24 de 25 práticas sem nota/);
});

test('salvar diagnóstico grava as notas na forma {v1:{nota,evidencia}} e volta à lista', async () => {
  const p = await abrir();
  await p.irPara('#/diagnostico/novo');
  escolherAlvo(p, 'turma:t-norte');
  await preencherDiagnostico(p, 2);
  const ev = p.document.querySelector('[data-evidencia="v1"]');
  ev.value = 'Lista de negociações conferida';
  p.evento(ev, 'input');
  p.evento(p.document.querySelector('[data-diag-form]'), 'submit');
  await assentar();
  const up = p.servidor.doSync('upsert').pop();
  assert.equal(up.colecao, 'diagnosticos');
  assert.equal(up.registro.alvoTipo, 'turma');
  assert.equal(up.registro.alvoId, 't-norte');
  assert.equal(up.registro.momento, 'linha_de_base');
  assert.match(up.registro.data, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(up.registro.notas.v1, { nota: 2, evidencia: 'Lista de negociações conferida' });
  assert.equal(Object.keys(up.registro.notas).length, 25);
  assert.equal(p.run('location.hash'), '#/diagnostico');
  assert.equal([...p.memoria.keys()].filter(k => k.startsWith('vof_rascunho_')).length, 0, 'rascunho limpo depois de salvar');
});

test('salvar sem escolher turma ou empresa não grava e diz por quê', async () => {
  const p = await abrir();
  await p.irPara('#/diagnostico/novo');
  p.evento(p.document.querySelector('[data-diag-form]'), 'submit');
  await assentar();
  assert.equal(p.servidor.doSync('upsert').length, 0);
  assert.match(p.texto(), /Escolha a turma ou a empresa/);
});

test('digitação do diagnóstico sobrevive a redesenho e à atualização vinda do servidor', async () => {
  const p = await abrir();
  await p.irPara('#/diagnostico/novo');
  const ev = p.document.querySelector('[data-evidencia="o2"]');
  ev.value = 'Instrução escrita e usada';
  p.evento(ev, 'input');
  p.focar(ev);
  await p.run('STORE.atualizar()');
  await assentar();
  assert.equal(p.document.querySelector('[data-evidencia="o2"]'), ev, 'atualização do servidor não redesenhou o editor');
  p.run('renderApp()');
  assert.notEqual(p.document.querySelector('[data-evidencia="o2"]'), ev, 'redesenho forçado');
  assert.equal(p.document.querySelector('[data-evidencia="o2"]').value, 'Instrução escrita e usada');
});

test('comparação: linha de base × último momento, por dimensão', async () => {
  const notas = n => Object.fromEntries(['v', 'o', 'f', 'p', 'g'].flatMap(l => [1, 2, 3, 4, 5].map(i => [l + i, { nota: n, evidencia: '' }])));
  const dados = DADOS();
  dados.diagnosticos = [
    { id: 'd-base', alvoTipo: 'turma', alvoId: 't-norte', momento: 'linha_de_base', data: '2026-09-02', avaliador: 'Avaliador Fictício', notas: notas(1), obs: '' },
    { id: 'd-90', alvoTipo: 'turma', alvoId: 't-norte', momento: 'dia_90', data: '2026-12-01', avaliador: 'Avaliador Fictício', notas: notas(3), obs: '' },
  ];
  const p = await abrir({ servidor: servidorFalso({ dados }) });
  p.run("ESTADO.diag.alvo = 'turma:t-norte'");
  await p.irPara('#/diagnostico');
  const tabela = p.document.querySelector('table.comparacao');
  assert.ok(tabela);
  const linhas = [...tabela.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(c => c.textContent.trim()));
  assert.deepEqual(linhas[0], ['Venda', '25', '75', '+50']);
  assert.deepEqual(linhas.at(-1), ['Geral', '25', '75', '+50']);
});

/* ───────────── N/A no diagnóstico (caderno p. 31) ───────────── */
// "N/A: inaplicável, justificado antes da pontuação; ajustar o denominador e
// sinalizar comparabilidade limitada. Não excluir uma dimensão inteira."
const marcarNota = (p, id, valor) => { const r = p.document.querySelector('input[name="nota-' + id + '"][value="' + valor + '"]'); r.checked = true; p.evento(r, 'change'); };
const escreverEvidencia = (p, id, texto) => { const ev = p.document.querySelector('[data-evidencia="' + id + '"]'); ev.value = texto; p.evento(ev, 'input'); };
const textoResultado = p => p.document.querySelector('#diag-resultado').textContent;

test('diagnóstico: N/A ao lado de 0 a 4 em cada prática, com o mesmo alvo de toque das notas', async () => {
  const p = await abrir();
  await p.irPara('#/diagnostico/novo');
  const praticas = [...p.document.querySelectorAll('.pratica')];
  assert.equal(praticas.length, 25);
  for (const pr of praticas) {
    const id = pr.getAttribute('data-pratica');
    const opcoes = [...pr.querySelectorAll('.regua input[type=radio]')];
    assert.deepEqual(opcoes.map(o => o.getAttribute('value')), ['0', '1', '2', '3', '4', 'na'], id);
    assert.ok(opcoes.every(o => o.getAttribute('name') === 'nota-' + id), id + ': o mesmo grupo, N/A e nota se excluem');
    assert.ok(opcoes.every(o => o.closest('label').classList.contains('nivel')), id + ': N/A usa a mesma classe de alvo das notas');
  }
  // A classe .nivel garante o alvo de controle (40 px ou mais); o N/A só muda a borda.
  const css = ler('styles.css');
  const nivel = /\n\.nivel \{([^}]*)\}/.exec(css)[1];
  assert.ok(Number(/min-height:\s*(\d+)px/.exec(nivel)[1]) >= 40, '.nivel tem alvo de 40 px ou mais');
  const regrasNA = [...css.matchAll(/([^{}]*nivel-na[^{}]*)\{([^}]*)\}/g)];
  for (const m of regrasNA) assert.doesNotMatch(m[2], /height|padding|font|display|width/, m[1].trim());
});

test('diagnóstico: N/A justificado grava "na", volta marcado de outro aparelho e o resultado ajusta o denominador', async () => {
  const p = await abrir({ metodo: 'real' });
  await p.irPara('#/diagnostico/novo');
  escolherAlvo(p, 'turma:t-norte');
  await preencherDiagnostico(p, 4);
  // Venda com V1 N/A e V2 a V5 = 3, 2, 3, 3. Caderno p. 34: 100 × soma ÷ (4 × aplicáveis) = 100 × 11 ÷ 16.
  marcarNota(p, 'v1', 'na'); marcarNota(p, 'v2', 3); marcarNota(p, 'v3', 2); marcarNota(p, 'v4', 3); marcarNota(p, 'v5', 3);
  const justificativa = 'A empresa só vende à vista: não há crédito de cliente a qualificar';
  escreverEvidencia(p, 'v1', justificativa);
  assert.equal(p.run('resultadoDe(ESTADO.diag.rascunho).venda'), 68.75, 'nem 55 (N/A como zero) nem em aberto (N/A como ND)');
  const barra = [...p.document.querySelectorAll('#diag-resultado .barra-dim')].find(b => b.querySelector('span').textContent === 'Venda');
  assert.equal(barra.querySelector('b').textContent, '68,8');
  assert.match(textoResultado(p), /As 24 práticas aplicáveis estão pontuadas/);
  assert.match(textoResultado(p), /N\/A em V1: .*comparabilidade fica limitada/);
  assert.doesNotMatch(textoResultado(p), /sem justificativa/);
  p.evento(p.document.querySelector('[data-diag-form]'), 'submit');
  await assentar();
  const up = p.servidor.doSync('upsert').pop();
  assert.ok(up, 'gravou');
  assert.deepEqual(up.registro.notas.v1, { nota: 'na', evidencia: justificativa });
  assert.deepEqual(up.registro.notas.v3, { nota: 2, evidencia: '' });

  // Outro aparelho, mesma conta: relê do servidor.
  const outro = montar({ cracha: crachaFalso(), servidor: p.servidor, metodo: 'real', hash: '#/diagnostico/' + up.registro.id });
  await assentar();
  const na = outro.document.querySelector('input[name="nota-v1"][value="na"]');
  assert.ok(na && na.hasAttribute('checked'), 'N/A volta marcado');
  assert.equal(outro.document.querySelector('input[name="nota-v1"][value="0"]').hasAttribute('checked'), false);
  assert.equal(outro.document.querySelector('[data-evidencia="v1"]').value, justificativa);
  assert.equal(outro.document.querySelector('[data-limpar="v1"]').hidden, false, 'dá para tirar o N/A');
  assert.equal(outro.run('resultadoDe(ESTADO.diag.rascunho).venda'), 68.75);
});

test('diagnóstico: N/A sem justificativa e dimensão inteira em N/A não gravam, e a tela diz por quê', async () => {
  const p = await abrir({ metodo: 'real' });
  await p.irPara('#/diagnostico/novo');
  escolherAlvo(p, 'turma:t-norte');
  await preencherDiagnostico(p, 3);
  marcarNota(p, 'o2', 'na');
  assert.match(textoResultado(p), /N\/A sem justificativa: O2/);
  p.evento(p.document.querySelector('[data-diag-form]'), 'submit');
  await assentar();
  assert.equal(p.servidor.doSync('upsert').length, 0);
  assert.match(p.texto(), /N\/A precisa de justificativa antes da pontuação \(caderno p\. 31\): escreva no campo Evidência de O2/);
  escreverEvidencia(p, 'o2', 'Empresa sem estoque de material');
  assert.doesNotMatch(textoResultado(p), /sem justificativa/, 'o aviso some quando a justificativa chega');

  for (const id of ['v1', 'v2', 'v3', 'v4', 'v5']) { marcarNota(p, id, 'na'); escreverEvidencia(p, id, 'Justificativa fictícia ' + id); }
  assert.match(textoResultado(p), /Venda: todas as práticas em N\/A\. O caderno não permite excluir uma dimensão inteira/);
  assert.equal(p.run('resultadoDe(ESTADO.diag.rascunho).geral'), null, 'dimensão sem critério aplicável não fecha o geral');
  p.evento(p.document.querySelector('[data-diag-form]'), 'submit');
  await assentar();
  assert.equal(p.servidor.doSync('upsert').length, 0);
  assert.match(p.texto(), /não permite excluir uma dimensão inteira \(p\. 31\): Venda/);
});

test('comparação com N/A: denominador ajustado e "comparabilidade limitada" na dimensão e no geral', async () => {
  const notas = n => Object.fromEntries(['v', 'o', 'f', 'p', 'g'].flatMap(l => [1, 2, 3, 4, 5].map(i => [l + i, { nota: n, evidencia: '' }])));
  const base = notas(1);
  base.v1 = { nota: 'na', evidencia: 'Só vende à vista' };
  const dados = DADOS();
  dados.diagnosticos = [
    { id: 'd-base', alvoTipo: 'turma', alvoId: 't-norte', momento: 'linha_de_base', data: '2026-09-02', avaliador: 'Avaliador Fictício', notas: base, obs: '' },
    { id: 'd-90', alvoTipo: 'turma', alvoId: 't-norte', momento: 'dia_90', data: '2026-12-01', avaliador: 'Avaliador Fictício', notas: notas(3), obs: '' },
  ];
  const p = await abrir({ servidor: servidorFalso({ dados }), metodo: 'real' });
  p.run("ESTADO.diag.alvo = 'turma:t-norte'");
  await p.irPara('#/diagnostico');
  const tabela = p.document.querySelector('table.comparacao');
  assert.ok(tabela);
  const linhas = [...tabela.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(c => c.textContent.trim()));
  // Venda da linha de base: V2 a V5 = 1, V1 N/A: 100 × 4 ÷ 16 = 25 (não 20, que seria N/A como zero).
  assert.deepEqual(linhas[0], ['Venda comparabilidade limitada', '25', '75', '+50']);
  assert.deepEqual(linhas[1], ['Operação', '25', '75', '+50'], 'dimensão sem N/A não recebe o aviso');
  assert.deepEqual(linhas.at(-1), ['Geral comparabilidade limitada', '25', '75', '+50']);
  const nota = p.document.querySelector('[data-comparabilidade]');
  assert.ok(nota);
  assert.match(nota.textContent, /Linha de base: N\/A em V1\./);
  assert.match(nota.textContent, /Caderno p\. 31/);
});

/* ───────────── plano de 90 dias ───────────── */
test('plano: marcos por fase com prazo pelo Dia 0, checklist do conteúdo e gravação', async () => {
  const p = await abrir({ conteudo: CONTEUDO });
  await p.irPara('#/plano/t-norte');
  await assentar();
  const texto = p.texto();
  assert.match(texto, /Até dia 30prazo 01\/10\/2026/);
  assert.match(texto, /Até dia 90prazo 30\/11\/2026/);
  assert.match(texto, /Restrição escolhida com a equipe/);
  const meta = p.document.querySelector('[data-p=meta]');
  meta.value = 'Entregar 95% no prazo';
  p.evento(meta, 'input');
  const feito = p.document.querySelector('[data-marco="m1"] [data-m=feito]');
  feito.checked = true; p.evento(feito, 'change');
  const check = p.document.querySelector('[data-check="c1"] [data-c=feito]');
  check.checked = true; p.evento(check, 'change');
  p.document.querySelector('[data-novo-marco="Até dia 60"]').click();
  assert.equal(p.document.querySelector('[data-p=meta]').value, 'Entregar 95% no prazo', 'adicionar ação não apaga o que foi digitado');
  p.evento(p.document.querySelector('[data-plano-form]'), 'submit');
  await assentar();
  const up = p.servidor.doSync('upsert').pop();
  assert.equal(up.colecao, 'planos');
  assert.equal(up.registro.id, 'plano-t-norte');
  assert.equal(up.expectedRevision, 1);
  assert.equal(up.registro.meta, 'Entregar 95% no prazo');
  assert.equal(up.registro.marcos.find(m => m.id === 'm1').feito, true);
  assert.match(up.registro.marcos.find(m => m.id === 'm1').data, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(up.registro.marcos.filter(m => m.fase === 'Até dia 60').length, 1);
  assert.equal(up.registro.checklist.c1.feito, true);
});

test('plano novo pergunta ao servidor antes de gravar: não sobrescreve um plano vivo com o mesmo código', async () => {
  const p = await abrir();
  await p.irPara('#/plano/t-sul');
  p.evento(p.document.querySelector('[data-plano-form]'), 'submit');
  await assentar();
  const sync = p.servidor.doSync();
  const iGet = sync.findIndex(c => c.action === 'get' && c.colecao === 'planos' && c.id === 'plano-t-sul');
  const iUp = sync.findIndex(c => c.action === 'upsert' && c.colecao === 'planos');
  assert.ok(iGet >= 0 && iUp > iGet);
  assert.equal(sync[iUp].registro.turmaId, 't-sul');
  assert.deepEqual(sync[iUp].registro.marcos.map(m => m.fase), ['Dia 0', 'Até dia 30', 'Até dia 60', 'Até dia 90']);
});

const PLANO_ARQUIVADO = { id: 'plano-t-sul', turmaId: 't-sul', restricao: 'Restrição arquivada fictícia', meta: '', indicador: '', responsavel: '', dia0: '2026-11-03', marcos: [], checklist: {} };

test('plano arquivado: a tela diz que foi arquivado, sem formulário, e o facilitador não vê Restaurar', async () => {
  const servidor = servidorFalso({ dados: DADOS(), arquivados: { planos: [PLANO_ARQUIVADO] } });
  const p = await abrir({ servidor });
  await p.irPara('#/plano/t-sul');
  assert.match(p.texto(), /Este plano foi arquivado\. Só o admin pode restaurar\./);
  assert.equal(p.document.querySelector('[data-restaurar-plano]'), null, 'facilitador não vê o botão');
  assert.equal(p.document.querySelector('[data-plano-form]'), null, 'nada de plano em branco que o servidor recusaria');
  assert.doesNotMatch(p.texto(), /Restrição arquivada fictícia/, 'o conteúdo arquivado não chega ao facilitador');
  await p.irPara('#/plano');
  const linha = [...p.document.querySelectorAll('.linha')].find(l => /Turma Aberta Sul/.test(l.textContent));
  assert.match(linha.textContent, /Plano arquivado/);
  assert.doesNotMatch(linha.textContent, /Sem plano ainda/);
  assert.equal(p.servidor.doSync('restore').length, 0);
});

test('plano arquivado: o admin vê Restaurar, que chama restore e devolve o plano à tela', async () => {
  const servidor = servidorFalso({ papel: 'admin', dados: DADOS(), arquivados: { planos: [PLANO_ARQUIVADO] } });
  const p = await abrir({ servidor, papel: 'admin' });
  await p.irPara('#/plano/t-sul');
  assert.match(p.texto(), /Este plano foi arquivado\. Só o admin pode restaurar\./);
  const bt = p.document.querySelector('[data-restaurar-plano]');
  assert.ok(bt, 'admin vê o botão');
  assert.equal(bt.textContent, 'Restaurar');
  bt.click();
  await assentar();
  const rest = p.servidor.doSync('restore');
  assert.equal(rest.length, 1);
  assert.equal(rest[0].colecao, 'planos');
  assert.equal(rest[0].id, 'plano-t-sul');
  assert.match(rest[0].auth, /^Bearer /);
  assert.doesNotMatch(p.texto(), /foi arquivado/);
  assert.equal(p.document.querySelector('[data-p="restricao"]').value, 'Restrição arquivada fictícia');
  assert.equal(p.run("STORE.arquivado('planos', 'plano-t-sul')"), false);
});

test('gravar em código arquivado não manda a gravação condenada; o 409 do servidor também marca o arquivado', async () => {
  const servidor = servidorFalso({ dados: DADOS(), arquivados: { planos: [PLANO_ARQUIVADO] } });
  const p = await abrir({ servidor });
  // Pelo get: registro vazio com revisão 2 é o arquivado.
  await p.run("STORE.gravar('planos', { id: 'plano-t-sul', turmaId: 't-sul' }, { idFixo: true }).then(() => { window.__r = 'gravou'; }, e => { window.__r = { arquivado: e.arquivado, tipo: e.tipo, status: e.status, msg: e.message }; })");
  await assentar();
  const r1 = p.run('__r');
  assert.equal(r1.arquivado, true);
  assert.equal(r1.status, 409);
  assert.match(r1.msg, /Só o admin pode restaurar/);
  assert.equal(p.servidor.doSync('upsert').length, 0, 'o upsert que a vof_gravar recusaria nem sai');
  // Com a revisão certa na mão, o servidor recusa do mesmo jeito (409 arquivado).
  await p.run("STORE.gravar('planos', { id: 'plano-t-sul', turmaId: 't-sul', _rev: 2 }).then(() => { window.__r2 = 'gravou'; }, e => { window.__r2 = { arquivado: e.arquivado, status: e.status }; })");
  await assentar();
  assert.equal(p.servidor.doSync('upsert').length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(p.run('__r2'))), { arquivado: true, status: 409 });
  assert.equal(p.run("STORE.arquivado('planos', 'plano-t-sul')"), true);
});

test('plano arquivado com a tela aberta: salvar leva ao aviso de arquivado e o rascunho fica no aparelho', async () => {
  const servidor = servidorFalso({ dados: DADOS() });
  const p = await abrir({ servidor });
  await p.irPara('#/plano/t-sul');
  const restricao = p.document.querySelector('[data-p="restricao"]');
  restricao.value = 'Restrição escrita antes do arquivamento';
  p.evento(restricao, 'input');
  // Outra pessoa cria e o admin arquiva o plano enquanto esta tela está aberta.
  servidor.banco.set('planos:plano-t-sul', { colecao: 'planos', id: 'plano-t-sul', registro: { id: 'plano-t-sul', turmaId: 't-sul' }, revision: 2, apagado: true, atualizado_em: '2026-09-25T13:00:00.000Z' });
  p.evento(p.document.querySelector('[data-plano-form]'), 'submit');
  await assentar();
  assert.equal(p.servidor.doSync('upsert').length, 0);
  assert.match(p.texto(), /Este plano foi arquivado\. Só o admin pode restaurar\./);
  assert.match(p.texto(), /O rascunho deste plano continua guardado neste aparelho/);
  assert.equal(p.document.querySelector('[data-restaurar-plano]'), null);
  const rasc = JSON.parse([...p.memoria.entries()].find(([k]) => k.startsWith('vof_rascunho_v1_') && k.endsWith('plano_t-sul'))[1]);
  assert.equal(rasc.restricao, 'Restrição escrita antes do arquivamento');
});

/* ───────────── apostila ───────────── */
test('apostila: pede a URL assinada e oferece o link; erro diz a causa', async () => {
  const p = await abrir();
  await p.irPara('#/apostila');
  p.document.querySelector('[data-apostila]').click();
  await assentar();
  const pedido = p.servidor.doSync('urlArquivo').pop();
  assert.equal(pedido.nome, 'apostila');
  assert.equal(p.document.querySelector('#apostila-status a').getAttribute('href'), 'https://exemplo.test/cofre/apostila.pdf?assinatura=teste');
  assert.equal(p.aberturas.length, 1);

  const q = await abrir({ falhas: { urlArquivo: { status: 404, corpo: { erro: 'A apostila ainda não foi enviada ao cofre.' } } } });
  await q.irPara('#/apostila');
  q.document.querySelector('[data-apostila]').click();
  await assentar();
  assert.match(q.texto(), /Não consegui gerar o link da apostila: A apostila ainda não foi enviada ao cofre\./);
});

/* ───────────── apresentação, passador e sala ───────────── */
test('palco: → Espaço PageDown avançam, ← PageUp voltam, Home e End vão às pontas', async () => {
  const p = await abrir();
  await p.irPara('#/palco');
  const titulo = () => p.document.querySelector('.slide-titulo').textContent;
  const tecla = (key, extra) => p.evento(p.document.body, 'keydown', Object.assign({ key }, extra || {}));
  assert.equal(titulo(), 'Abertura de teste');
  tecla('ArrowRight'); assert.equal(titulo(), 'Segundo slide de teste');
  tecla(' '); assert.equal(titulo(), 'Terceiro slide de teste');
  tecla('PageUp'); assert.equal(titulo(), 'Segundo slide de teste');
  tecla('PageDown'); tecla('PageDown'); tecla('PageDown'); assert.equal(titulo(), 'Quarto slide de teste', 'não passa do último');
  tecla('Home'); assert.equal(titulo(), 'Abertura de teste');
  tecla('ArrowLeft'); assert.equal(titulo(), 'Abertura de teste', 'não volta antes do primeiro');
  tecla('End'); assert.equal(titulo(), 'Quarto slide de teste');
  tecla('ArrowLeft', { ctrlKey: true }); assert.equal(titulo(), 'Quarto slide de teste', 'atalho com Ctrl é do navegador');
  tecla('b'); assert.equal(p.document.querySelector('#palco-escuro').hidden, false);
  tecla('b'); assert.equal(p.document.querySelector('#palco-escuro').hidden, true);
  assert.match(p.document.querySelector('#palco-cont').textContent, /4 \/ 4/);
  assert.equal(p.document.querySelector('.cab'), null, 'palco sem cabeçalho');
});

test('palco no modo Aplicar mostra as perguntas em letra grande', async () => {
  const p = await abrir();
  await p.irPara('#/palco');
  p.document.querySelector('[data-p-modo="aplicar"]').click();
  assert.match(p.document.querySelector('.slide').textContent, /Perguntas para o grupo[\s\S]*Pergunta A\?/);
});

test('sala: criar grava o código, o palco acompanha o servidor e o celular grava próximo', async () => {
  const p = await abrir();
  await p.irPara('#/palco');
  p.document.querySelector('[data-p="sala"]').click();
  await assentar();
  const criada = p.servidor.doSync('upsert').find(c => c.colecao === 'salas');
  assert.ok(criada, 'sala gravada');
  assert.match(criada.registro.id, /^[A-Z2-9]{6}$/);
  assert.equal(criada.registro.slide, 0);
  assert.equal(criada.registro.modo, 'apresentar');
  assert.equal(criada.registro.atualizadoPor, 'zz_facilitadora');
  const codigo = criada.registro.id;
  assert.equal(p.run('location.hash'), '#/palco/' + codigo);
  assert.match(p.document.querySelector('#overlays').textContent, new RegExp(codigo));

  // Outra tela (o celular) muda o slide no servidor: o palco segue na próxima consulta.
  const linha = p.servidor.banco.get('salas:' + codigo);
  linha.registro = Object.assign({}, linha.registro, { slide: 2 }); linha.revision++;
  p.run('pararPoll(); iniciarPoll(' + JSON.stringify(codigo) + ', aoLerSalaNoPalco)');
  await assentar();
  assert.equal(p.document.querySelector('.slide-titulo').textContent, 'Terceiro slide de teste');
  p.run('pararPoll()');

  // O celular, logado, abre o controle e toca Próximo.
  const cel = await abrir({ servidor: p.servidor, hash: '#/controle/' + codigo });
  assert.match(cel.document.querySelector('#controle-atual').textContent, /Slide 3 de 4/);
  cel.document.querySelector('[data-c="prox"]').click();
  await assentar();
  cel.run('pararPoll()');
  const ultimo = p.servidor.doSync('upsert').filter(c => c.colecao === 'salas').pop();
  assert.equal(ultimo.registro.slide, 3);
  assert.equal(p.servidor.banco.get('salas:' + codigo).registro.slide, 3);
});

test('controle de sala inexistente trava os botões em vez de criar sala fantasma', async () => {
  const p = await abrir({ hash: '#/controle/ZZZ999' });
  p.run('pararPoll()');
  assert.match(p.texto(), /Esta sala não existe/);
  assert.equal(p.document.querySelector('[data-c="prox"]').disabled, true);
  p.document.querySelector('[data-c="prox"]').click();
  await assentar();
  assert.equal(p.servidor.doSync('upsert').length, 0);
});

/* ───────────── arquivos, caminhos e publicação ───────────── */
test('nenhum travessão ou meia-risca nos arquivos da casca', () => {
  for (const nome of ARQUIVOS_DA_CASCA) {
    const t = ler(nome);
    const i = Math.max(t.indexOf(TRAVESSAO), t.indexOf(MEIA_RISCA));
    assert.equal(i, -1, nome + ': ' + t.slice(Math.max(0, i - 40), i + 40));
  }
});

test('index.html carrega config, auth, store, metodo e app nessa ordem, com caminhos relativos', () => {
  const { document } = parseHTML(ler('index.html'));
  const scripts = [...document.querySelectorAll('script')].map(s => s.getAttribute('src'));
  assert.deepEqual(scripts, ['./config.js', './auth.js', './store.js', './metodo.js', './app.js']);
  const refs = [...document.querySelectorAll('[src], [href]')].map(e => e.getAttribute('src') || e.getAttribute('href'));
  for (const r of refs) {
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(r)) continue;
    assert.match(r, /^\.\//, 'caminho relativo: ' + r);
  }
  assert.ok(refs.includes('./metodo.css') && refs.includes('./styles.css'));
});

test('manifesto e service worker: caminhos relativos, cache vof-shell-v3', () => {
  const man = JSON.parse(ler('manifest.webmanifest'));
  assert.equal(man.start_url, './');
  assert.equal(man.scope, './');
  for (const i of man.icons) assert.match(i.src, /^\.\//);
  const sw = ler('sw.js');
  assert.match(sw, /const CACHE = 'vof-shell-v3'/);
  const shell = /const SHELL\s*=\s*\[([\s\S]*?)\]/.exec(sw)[1];
  for (const m of shell.matchAll(/'([^']+)'/g)) assert.match(m[1], /^\.\//);
});

test('service worker: ignora supabase.co, outros endereços e tudo que não é GET', () => {
  const ouvintes = {};
  const ctx = vm.createContext({
    self: { addEventListener: (t, f) => { ouvintes[t] = f; }, location: { origin: 'https://exemplo.test' }, skipWaiting() {}, clients: { claim() {} } },
    caches: { open: async () => ({ addAll: async () => {}, put: async () => {} }), match: async () => undefined, keys: async () => [], delete: async () => true },
    fetch: async () => ({ ok: true, type: 'basic', clone() { return this; } }), URL, Request: class { constructor(u) { this.url = u; } }, Response: { error: () => ({}) }, setTimeout, clearTimeout, Promise,
  });
  vm.runInContext(ler('sw.js'), ctx);
  const tratou = (url, method = 'GET') => { let usado = false; ouvintes.fetch({ request: { url, method }, respondWith() { usado = true; } }); return usado; };
  assert.equal(tratou('https://heveemylixartyijxewh.supabase.co/functions/v1/vof-sync', 'POST'), false);
  assert.equal(tratou('https://heveemylixartyijxewh.supabase.co/storage/v1/object/sign/x'), false);
  assert.equal(tratou('https://fonts.googleapis.com/css2'), false);
  assert.equal(tratou('https://exemplo.test/metodo-vof/app.js', 'POST'), false);
  assert.equal(tratou('https://exemplo.test/metodo-vof/app.js'), true);
});

test('a publicação leva tudo o que a página pede (simula o cp do deploy.yml)', () => {
  const yml = ler('.github/workflows/deploy.yml');
  const destino = mkdtempSync(join(tmpdir(), 'vof-pub-'));
  const dist = join(destino, 'dist');
  mkdirSync(dist);
  const raiz = fileURLToPath(RAIZ);
  try {
    const linhas = yml.split('\n').map(l => l.trim()).filter(l => /^cp /.test(l));
    assert.ok(linhas.length >= 2, 'o deploy copia os arquivos por lista');
    for (const l of linhas) {
      const partes = l.split(/\s+/).slice(1);
      const recursivo = partes[0] === '-R';
      const arquivos = partes.slice(recursivo ? 1 : 0, -1);
      for (const a of arquivos) {
        if (!existe(a)) continue; // arquivo de outro dono ainda não escrito: o conferir abaixo acusa
        cpSync(join(raiz, a), join(dist, a), { recursive: recursivo });
      }
    }
    const { refs, faltando } = conferir(dist);
    assert.ok(refs.includes('app.js') && refs.includes('metodo.js') && refs.includes('icone-512.png'));
    assert.deepEqual(faltando, [], 'faltam na publicação');
    assert.ok(!readdirSync(dist).includes('supabase') && !readdirSync(dist).includes('tests'), 'só o público vai para o ar');
  } finally { rmSync(destino, { recursive: true, force: true }); }
});

test('package.json: "test" roda a pasta tests/ e usa o linkedom da Central', () => {
  const pkg = JSON.parse(ler('package.json'));
  assert.equal(pkg.scripts.test, 'node --test tests/');
  // Na máquina do Léo confere contra a Central; na CI (sem a pasta vizinha) vale a versão fixada.
  let versao = '0.18.12';
  try { versao = JSON.parse(readFileSync(new URL('../vida-leo/package.json', RAIZ), 'utf8')).devDependencies.linkedom; } catch {}
  assert.equal(pkg.devDependencies.linkedom, versao);
});

/* ───────────── com o metodo.js de verdade ───────────── */
test('integração com o metodo.js real: áreas desenham e 25 notas 4 fecham em 100', { skip: !existe('metodo.js') && 'metodo.js ainda não existe' }, async () => {
  const p = await abrir({ metodo: 'real', conteudo: CONTEUDO });
  assert.equal(p.run('VOFMetodo.PRATICAS.length'), 25);
  for (const h of ['#/metodo', '#/apresentacao', '#/palco', '#/diagnostico/novo']) {
    await p.irPara(h);
    assert.doesNotMatch(p.texto(), /undefined|NaN|não carregou|não carregaram/, h);
  }
  assert.equal(await preencherDiagnostico(p, 4), 25);
  assert.equal(p.document.querySelector('[data-geral]').textContent, '100');
  for (const id of ['g1', 'g2', 'g3', 'g4', 'g5']) {
    const r = p.document.querySelector('input[name="nota-' + id + '"][value="0"]');
    r.checked = true; p.evento(r, 'change');
  }
  assert.equal(p.document.querySelector('[data-geral]').textContent, '0', 'dimensão confirmada em zero leva o geral a zero (caderno p. 91)');
  assert.match(p.document.querySelector('#diag-resultado').textContent, /Abaixo de 40: Gestores/);
});
