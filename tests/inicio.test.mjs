// Testes da TELA INICIAL (bloco de propósito e frase do dia), do link que
// abre o módulo na área Método, da CSP do index.html e da versão do cache do
// service worker. Rodar: node --test tests/
//
// O fuso fica fixo em São Paulo: a frase do dia muda à meia-noite de Brasília,
// e teste que só passa no fuso de quem roda não prova nada. Um dos testes
// troca o fuso de propósito para provar que a escolha não depende dele.
// Nomes, turmas e empresas daqui são inventados.
process.env.TZ = 'America/Sao_Paulo';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { montar, crachaFalso, servidorFalso, assentar, ler, existe } from './helpers/casca.mjs';

// O texto aprovado pelo Léo (26/09/2026). Mudou aqui ou no app.js sem ele? O teste acusa.
const TITULO = 'Pessoas que performam. Negócios que prosperam.';
const TEXTO = 'Cada turma trabalha para que a empresa deixe de funcionar por heroísmo e passe a funcionar como sistema: o dono com tempo para a própria vida, a equipe que sabe o que se espera dela e é reconhecida, o caixa que avisa antes e o cliente que recebe o combinado. Uma restrição por vez, em ciclos de 90 dias.';
const CHAMADA = 'Comece pelo que já foi combinado: confira os próximos marcos e feche cada decisão com dono, data e dado.';
const TRAVESSOES = new RegExp('[' + String.fromCharCode(8211) + String.fromCharCode(8212) + ']');

const DADOS = () => ({
  turmas: [{ id: 't-norte', nome: 'Turma Piloto Norte', nivel: 1, status: 'em andamento', inicio: '2026-09-01', participantes: 12, empresaId: '', facilitador: 'Facilitadora de Teste', obs: '' }],
  empresas: [],
  planos: [{ id: 'plano-t-norte', turmaId: 't-norte', restricao: 'Prazo de entrega', meta: 'Entregar 90% no prazo', indicador: 'Entregas no prazo', responsavel: 'Responsável Fictício', dia0: '2026-09-01',
    marcos: [{ id: 'm1', fase: 'Até dia 30', acao: 'Mapear a fila do gargalo', evidencia: '', feito: false, data: '' }], checklist: {} }],
  diagnosticos: [],
});
async function abrir({ metodo = 'real', papel = 'facilitador' } = {}) {
  const p = montar({ cracha: crachaFalso({ papel }), servidor: servidorFalso({ dados: DADOS(), papel }), metodo, hash: '#/' });
  await assentar();
  return p;
}
const idDaFrase = (p, quando) => p.run('fraseDoDia(new Date(' + JSON.stringify(quando) + ')).modulo.id');
const salaAberta = p => p.run('(function () { var s = VOFMetodo.apresentacaoAtual(); return s ? s.estado().id : null; })()');

/* ───────────── o bloco de propósito ───────────── */
test('Início: o bloco de propósito abre a tela, antes dos cartões de turmas, marcos e diagnósticos', async () => {
  const p = await abrir();
  const filhos = [...p.document.querySelector('#miolo').children];
  const iProp = filhos.findIndex(e => e.classList.contains('proposito'));
  const iGrade = filhos.findIndex(e => e.classList.contains('resumo-grade'));
  assert.equal(iProp, 0, 'o propósito é o primeiro bloco da Início');
  assert.ok(iGrade > iProp, 'os cartões vêm depois do propósito');
  assert.match(filhos[iGrade].textContent, /Turmas em andamento[\s\S]*Próximos marcos[\s\S]*Diagnósticos recentes/);

  const prop = filhos[iProp];
  const ola = prop.querySelector('.proposito-ola'), h1 = prop.querySelector('h1');
  assert.equal(ola.textContent, 'Olá, Facilitadora.', 'a saudação continua');
  assert.ok(prop.innerHTML.indexOf('proposito-ola') < prop.innerHTML.indexOf('<h1'), 'a saudação vem acima do título');
  assert.equal(p.document.querySelectorAll('#miolo h1').length, 1, 'um título só na tela');
  assert.equal(h1.textContent, TITULO);
  assert.equal(h1.querySelector('em').textContent, 'Negócios que prosperam.', 'a segunda frase ganha destaque próprio');
  assert.equal(prop.querySelector('.proposito-texto').textContent, TEXTO);
  assert.equal(prop.querySelector('.proposito-chamada p').textContent, CHAMADA);
  assert.doesNotMatch(prop.textContent, TRAVESSOES, 'sem travessão no bloco');
  assert.doesNotMatch(p.texto(), /undefined|NaN|\[object /);
  // As ações de sempre continuam na Início, depois do propósito.
  assert.ok(p.document.querySelector('.inicio-acoes a[href="#/apresentacao"]'));
  assert.ok(p.document.querySelector('.inicio-acoes [data-nova-turma]'));
});

test('Início: o botão da chamada leva ao cartão Próximos marcos, sem trocar de área', async () => {
  const p = await abrir();
  const rolagens = [];
  p.sandbox.HTMLElement.prototype.scrollIntoView = function (opcoes) { rolagens.push({ el: this, opcoes }); };
  const botao = p.document.querySelector('.proposito-chamada [data-ir-marcos]');
  assert.equal(botao.tagName, 'BUTTON', 'botão de verdade, não link com #: # vira rota neste app');
  assert.match(botao.textContent, /próximos marcos/i, 'o botão faz o que a chamada promete');
  botao.click();
  await assentar();
  assert.equal(rolagens.length, 1);
  assert.equal(rolagens[0].el.id, 'cartao-marcos');
  assert.match(rolagens[0].el.textContent, /Próximos marcos[\s\S]*Mapear a fila do gargalo/);
  assert.equal(p.run('location.hash'), '#/', 'continua na Início');
  assert.equal(p.document.activeElement.id, 'marcos-titulo', 'o foco vai para o título do cartão');
});

test('Início sem metodo.js: o propósito continua inteiro, sem frase do dia e sem buraco', async () => {
  const p = await abrir({ metodo: 'nenhum' });
  const prop = p.document.querySelector('.proposito');
  assert.ok(prop);
  assert.equal(prop.querySelector('h1').textContent, TITULO);
  assert.equal(p.document.querySelector('.frase-dia'), null);
  assert.ok(!prop.classList.contains('com-frase'), 'sem a frase, o bloco não reserva a coluna dela');
  assert.match(p.texto(), /não carregou/);
  assert.equal(p.run('fraseDoDia()'), null);
});

/* ───────────── frase do dia ───────────── */
test('frase do dia: a mesma o dia inteiro e outra depois da meia-noite de São Paulo', async () => {
  const p = await abrir();
  // 26/09/2026 em São Paulo (UTC-3) vai de 03:00 UTC do dia 26 a 02:59:59 UTC do dia 27.
  const dia26 = idDaFrase(p, '2026-09-26T03:00:00Z');
  assert.equal(idDaFrase(p, '2026-09-26T12:00:00Z'), dia26);
  assert.equal(idDaFrase(p, '2026-09-27T02:59:59Z'), dia26, 'mesma frase até 23:59:59');
  assert.notEqual(idDaFrase(p, '2026-09-26T02:59:59Z'), dia26, 'às 23:59 do dia 25 era outra');
  assert.notEqual(idDaFrase(p, '2026-09-27T03:00:00Z'), dia26, 'à meia-noite do dia 27 muda');
  // A meia-noite de Greenwich (21h em São Paulo) não troca a frase.
  assert.equal(idDaFrase(p, '2026-09-26T23:59:00Z'), idDaFrase(p, '2026-09-27T00:01:00Z'));
  // A virada do ano também troca, e 31/12 de ano bissexto é o dia 366.
  assert.equal(p.run("diaDoAnoNaCasa(new Date('2026-01-01T03:00:00Z'))"), 1);
  assert.equal(p.run("diaDoAnoNaCasa(new Date('2026-01-01T02:59:59Z'))"), 365, 'ainda 31/12/2025 em São Paulo');
  assert.equal(p.run("diaDoAnoNaCasa(new Date('2028-12-31T15:00:00Z'))"), 366);
  assert.notEqual(idDaFrase(p, '2026-01-01T02:59:59Z'), idDaFrase(p, '2026-01-01T03:00:00Z'));
});

test('frase do dia: não depende do fuso do aparelho', async () => {
  const p = await abrir();
  const emSaoPaulo = idDaFrase(p, '2026-09-26T12:00:00Z');
  const antes = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Tokyo';
    // Controle: o fuso trocou mesmo (em Tóquio já é dia 27).
    assert.equal(p.run("new Date('2026-09-26T15:30:00Z').getDate()"), 27, 'o fuso do teste não trocou: o teste abaixo não provaria nada');
    assert.equal(idDaFrase(p, '2026-09-26T15:30:00Z'), emSaoPaulo, 'em São Paulo ainda é dia 26');
  } finally { process.env.TZ = antes; }
});

test('frase do dia: 18 dias seguidos passam pelos 18 módulos, com as frases de VOFMetodo.MODULOS', async () => {
  const p = await abrir();
  const modulos = JSON.parse(p.run('JSON.stringify(VOFMetodo.MODULOS.map(function (m) { return { id: m.id, titulo: m.titulo, frase: m.frase }; }))'));
  assert.equal(modulos.length, 18);
  const vistos = new Set();
  for (let i = 0; i < 18; i++) vistos.add(idDaFrase(p, new Date(Date.UTC(2026, 0, 1, 15) + i * 86400000).toISOString()));
  assert.equal(vistos.size, 18, 'nenhum módulo fica de fora da rotação');
  for (const m of modulos) {
    assert.ok(m.frase && m.frase.trim(), m.id + ' sem frase');
    assert.doesNotMatch(m.frase + ' ' + m.titulo, TRAVESSOES, m.id + ': a frase vai para a tela inicial');
  }
});

test('frase do dia na Início: frase e título do módulo de hoje, e o link abre esse módulo no Método', async () => {
  const p = await abrir();
  const antes = p.run('fraseDoDia().modulo.id');
  const bloco = p.document.querySelector('.proposito .frase-dia');
  assert.ok(bloco, 'a frase do dia mora no bloco de propósito');
  const id = bloco.querySelector('[data-frase-dia]').getAttribute('data-frase-dia');
  assert.ok([antes, p.run('fraseDoDia().modulo.id')].includes(id), 'é a frase de hoje');
  const mod = JSON.parse(p.run('JSON.stringify(VOFMetodo.MODULOS.filter(function (m) { return m.id === ' + JSON.stringify(id) + '; })[0])'));
  assert.equal(bloco.querySelector('blockquote').textContent, mod.frase);
  assert.equal(bloco.querySelector('.frase-dia-modulo').textContent, 'Módulo ' + mod.ordem + ' · ' + mod.titulo);
  const link = bloco.querySelector('a.frase-dia-link');
  assert.equal(link.getAttribute('href'), '#/metodo/' + encodeURIComponent(id));
  assert.match(link.getAttribute('aria-label'), new RegExp('^Abrir o módulo '));
  await p.irPara(link.getAttribute('href'));
  assert.equal(salaAberta(p), id, 'a sala abre no módulo da frase');
  assert.equal(p.document.querySelector('.modal-vof [data-titulo]').textContent, mod.titulo);
  const aba = p.document.querySelector('.vof-tabs [aria-selected="true"]');
  assert.equal(aba.getAttribute('data-vof-aba'), mod.nivel === 2 ? 'nivel2' : 'nivel1', 'por trás, a aba do nível do módulo');
  assert.ok(p.document.querySelector('.abas a.ativa[href="#/metodo"]'), 'a área Método fica marcada no menu');
  await p.irPara('#/');
  assert.equal(salaAberta(p), null, 'voltar à Início fecha a sala');
});

test('#/metodo/<id> abre o módulo certo para cada um dos 18; id desconhecido avisa e não abre sala', async () => {
  const p = await abrir();
  const ids = JSON.parse(p.run('JSON.stringify(VOFMetodo.MODULOS.map(function (m) { return m.id; }))'));
  for (const id of ids) {
    await p.irPara('#/');
    await p.irPara('#/metodo/' + encodeURIComponent(id));
    assert.equal(salaAberta(p), id, id);
  }
  // De um módulo direto para outro (endereço digitado): a sala não fecha sozinha.
  await p.irPara('#/metodo/venda');
  assert.equal(salaAberta(p), 'venda');
  await p.irPara('#/metodo/financas2');
  assert.equal(salaAberta(p), 'financas2');
  await p.irPara('#/');
  await p.irPara('#/metodo/nao-existe');
  assert.equal(salaAberta(p), null);
  assert.match(p.texto(), /Não encontrei o módulo "nao-existe" no método/);
  await p.irPara('#/metodo');
  assert.equal(salaAberta(p), null, 'a área Método sozinha não abre sala');
  assert.doesNotMatch(p.texto(), /Não encontrei o módulo/);
});

test('#/metodo/<id> com módulo que existe mas não está na sala: diz a causa em vez de calar', async () => {
  // O método falso tem o módulo "arquitetura" e nenhuma sala (APRESENTACAO vazia).
  const p = await abrir({ metodo: 'falso' });
  await p.irPara('#/metodo/arquitetura');
  assert.match(p.texto(), /O módulo "Arquitetura do método" existe, mas a sala do método não abriu/);
  assert.equal(p.run('window.__abriu'), undefined, 'não pede sala com índice inventado');
  assert.match(p.texto(), /Método desenhado/, 'a área Método continua');
});

test('frase do dia: texto e título do módulo passam por esc, e o id vai codificado no link', async () => {
  const p = await abrir({ metodo: 'falso' });
  p.run("VOFMetodo.MODULOS = [{ id: 'x\"><img src=x>', ordem: '01', nivel: 1, titulo: '<img src=x id=titulo-mau>', frase: '<script>window.__xss = 1</script><b id=frase-ma>oi</b>' }]");
  await p.irPara('#/turmas');
  await p.irPara('#/');
  const bloco = p.document.querySelector('.frase-dia');
  assert.ok(bloco);
  assert.equal(bloco.querySelectorAll('img, script, b').length, 0, 'nada do dado vira elemento');
  assert.equal(bloco.querySelector('blockquote').textContent, '<script>window.__xss = 1</script><b id=frase-ma>oi</b>');
  assert.match(bloco.querySelector('.frase-dia-modulo').textContent, /<img src=x id=titulo-mau>/);
  assert.equal(bloco.querySelector('a').getAttribute('href'), '#/metodo/' + encodeURIComponent('x"><img src=x>'));
  assert.equal(p.run('window.__xss'), undefined);
});

// Visto no Chrome (26/09): a seta do "Abrir o módulo" herdava o sublinhado do
// link e virava um traço solto sob ela. Seta inline-block dentro de um link de
// TEXTO corta essa herança; link flex não serve, porque lá a seta vira item
// flex (bloco) e o sublinhado passa para ela mesmo assim.
test('frase do dia: a seta do link não herda o sublinhado, e o alvo continua com 44 px', () => {
  const css = ler('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const seta = /\.frase-dia-link::after\s*\{([^}]*)\}/.exec(css);
  const link = /\.frase-dia-link\s*\{([^}]*)\}/.exec(css);
  assert.ok(seta && link, 'o link e a seta existem');
  assert.match(seta[1], /display:\s*inline-block/);
  assert.match(link[1], /display:\s*inline-block/);
  assert.doesNotMatch(link[1], /display:\s*(inline-)?flex/, 'link flex faz a seta herdar o sublinhado');
  assert.match(link[1], /min-height:\s*44px/, 'régua de dedo: link é navegação');
});

/* ───────────── CSP do index.html ───────────── */
function lerCsp() {
  const { document } = parseHTML(ler('index.html'));
  const metas = [...document.querySelectorAll('meta[http-equiv]')].filter(m => /^content-security-policy$/i.test(m.getAttribute('http-equiv')));
  assert.equal(metas.length, 1, 'uma CSP só, em meta');
  const texto = metas[0].getAttribute('content');
  const dir = {};
  for (const parte of texto.split(';').map(x => x.trim()).filter(Boolean)) {
    const [nome, ...fontes] = parte.split(/\s+/);
    assert.ok(!(nome in dir), 'diretiva repetida: ' + nome);
    dir[nome] = fontes;
  }
  return { document, meta: metas[0], texto, dir };
}

test('index.html: CSP com script-src \'self\', sem \'unsafe-eval\' e sem curinga', () => {
  const { texto, dir } = lerCsp();
  assert.deepEqual(dir['script-src'], ["'self'"]);
  assert.deepEqual(dir['default-src'], ["'self'"]);
  assert.deepEqual(dir['object-src'], ["'none'"]);
  assert.deepEqual(dir['base-uri'], ["'none'"]);
  assert.deepEqual(dir['form-action'], ["'self'"]);
  assert.deepEqual(dir['frame-src'], ["'none'"]);
  assert.deepEqual(dir['connect-src'], ["'self'", 'https://heveemylixartyijxewh.supabase.co']);
  assert.deepEqual(dir['img-src'], ["'self'", 'data:', 'blob:']);
  assert.deepEqual(dir['font-src'], ["'self'", 'https://fonts.gstatic.com']);
  assert.deepEqual(dir['style-src'], ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']);
  assert.doesNotMatch(texto, /unsafe-eval|unsafe-hashes|strict-dynamic/);
  for (const [nome, fontes] of Object.entries(dir)) {
    for (const f of fontes) {
      assert.ok(!f.includes('*'), nome + ' com curinga: ' + f);
      assert.ok(!/^(https?|wss?|ftp):$/.test(f), nome + ' aceita um protocolo inteiro: ' + f);
      if (f === "'unsafe-inline'") assert.equal(nome, 'style-src', "'unsafe-inline' só vale para estilo");
      if (f === 'data:' || f === 'blob:') assert.equal(nome, 'img-src', f + ' só vale para imagem');
    }
  }
});

test('index.html: a CSP vem antes de tudo que carrega, e não há script inline nem on*', () => {
  const { document, meta } = lerCsp();
  const cabeca = [...document.head.children];
  const iCsp = cabeca.indexOf(meta);
  const iPrimeiro = cabeca.findIndex(e => ['LINK', 'SCRIPT', 'STYLE'].includes(e.tagName));
  assert.ok(iCsp >= 0 && iCsp < iPrimeiro, 'a meta da CSP precisa vir antes dos links e scripts');
  for (const s of document.querySelectorAll('script')) {
    assert.ok(s.getAttribute('src'), 'script sem src é script inline');
    assert.equal(s.textContent.trim(), '', 'script com src não leva código dentro');
  }
  for (const el of document.querySelectorAll('*')) {
    for (const a of el.attributes) assert.ok(!/^on/i.test(a.name), el.tagName + ' com ' + a.name);
  }
  assert.doesNotMatch(ler('index.html'), /javascript:/i);
});

test('CSP: cobre o backend do config.js e as fontes do Google; o código não depende de eval nem de on* gerado', () => {
  const { dir } = lerCsp();
  const base = /API_BASE\s*=\s*"([^"]+)"/.exec(ler('config.js'))[1];
  assert.ok(dir['connect-src'].includes(new URL(base).origin), 'trocar o backend no config.js exige trocar a CSP');
  const { document } = parseHTML(ler('index.html'));
  for (const l of document.querySelectorAll('link[rel="stylesheet"]')) {
    const href = l.getAttribute('href');
    if (/^https:/.test(href)) assert.ok(dir['style-src'].includes(new URL(href).origin), href);
  }
  for (const nome of ['app.js', 'metodo.js', 'store.js', 'auth.js', 'config.js']) {
    const codigo = ler(nome);
    assert.doesNotMatch(codigo, /<[a-zA-Z][^<>]*\son[a-z]+\s*=/, nome + ': HTML gerado com on*, que a CSP bloqueia');
    assert.doesNotMatch(codigo, /\beval\(|new Function\(|set(?:Timeout|Interval)\(\s*['"`]/, nome + ': código em texto, que a CSP bloqueia');
    assert.doesNotMatch(codigo, /javascript:/i, nome);
  }
});

/* ───────────── service worker ───────────── */
test('sw.js: cache na versão nova (vof-shell-v2) e SHELL com tudo que o index.html e o manifesto pedem', () => {
  const sw = ler('sw.js');
  assert.match(sw, /const CACHE = 'vof-shell-v2';/);
  assert.doesNotMatch(sw, /vof-shell-v1/);
  assert.match(sw, /const MEU_PREFIXO = 'vof-';/, 'a limpeza apaga a v1 e só as caches deste sistema');
  const shell = [...(/const SHELL\s*=\s*\[([\s\S]*?)\]/.exec(sw)[1]).matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.equal(new Set(shell).size, shell.length, 'SHELL sem repetição');
  assert.ok(shell.includes('./') && shell.includes('./index.html'));
  for (const s of shell) if (s !== './') assert.ok(existe(s.replace(/^\.\//, '')), 'SHELL cita arquivo que não existe: ' + s);
  const { document } = parseHTML(ler('index.html'));
  const locais = [...document.querySelectorAll('[src], [href]')].map(e => e.getAttribute('src') || e.getAttribute('href')).filter(r => r.startsWith('./'));
  assert.ok(locais.length >= 8);
  for (const r of locais) assert.ok(shell.includes(r), 'SHELL sem ' + r);
  for (const i of JSON.parse(ler('manifest.webmanifest')).icons) assert.ok(shell.includes(i.src), 'SHELL sem ' + i.src);
});
