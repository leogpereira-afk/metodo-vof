// Testes do método (metodo.js e metodo.css): conteúdo portado da Central, as 25
// práticas do diagnóstico, a regra de pontuação do caderno, as abas, a sala de
// apresentação e a jornada. Rodar: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

// linkedom vem do package.json do projeto; enquanto ele não existir, usa o da
// Central (mesma máquina, pasta vizinha). Sem nenhum dos dois, o erro diz o porquê.
let linkedom;
try { linkedom = await import('linkedom'); } catch {
  const vizinho = new URL('../../vida-leo/node_modules/linkedom/esm/index.js', import.meta.url);
  if (!existsSync(vizinho)) throw new Error('linkedom não encontrado: adicione "linkedom" às devDependencies do package.json.');
  linkedom = await import(vizinho.href);
}
const { parseHTML } = linkedom;

const raiz = new URL('../', import.meta.url);
const FONTE = readFileSync(new URL('metodo.js', raiz), 'utf8');
const CSS = readFileSync(new URL('metodo.css', raiz), 'utf8');

function montar({ memoria = new Map(), confirmar = () => true } = {}) {
  const { window, document, HTMLElement } = parseHTML('<!doctype html><html lang="pt-BR"><head></head><body><main id="app"></main></body></html>');
  let ativo = null;
  HTMLElement.prototype.focus = function () { ativo = this; };
  HTMLElement.prototype.blur = function () { if (ativo === this) ativo = null; };
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => ativo || document.body });
  const eventos = new EventTarget();
  const ctx = {
    document, console, CustomEvent, confirm: confirmar,
    localStorage: { getItem: k => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: k => memoria.delete(k) },
    setTimeout: () => 0, clearTimeout() {},
    addEventListener: eventos.addEventListener.bind(eventos),
    removeEventListener: eventos.removeEventListener.bind(eventos),
    dispatchEvent: eventos.dispatchEvent.bind(eventos)
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(FONTE, ctx, { filename: 'metodo.js' });
  return { V: ctx.VOFMetodo, window, document, memoria, ctx, app: document.getElementById('app') };
}
function tecla(amb, alvo, key, extra = {}) {
  const ev = new amb.window.Event('keydown', { bubbles: true, cancelable: true });
  Object.assign(ev, { key, ...extra });
  alvo.dispatchEvent(ev);
  return ev;
}
function abrir(inicio = 0, modo = 'apresentar', opcoes = {}) {
  const amb = montar(opcoes);
  amb.V.abrirApresentacao(inicio, modo);
  amb.modal = amb.document.querySelector('.modal-vof');
  amb.q = s => amb.modal.querySelector(s);
  return amb;
}
const titulo = amb => amb.q('[data-titulo]').textContent;
// Notas do exemplo fictício do próprio caderno (p. 34, 41, 50, 61 e 75).
const EXEMPLO = { v: [3, 3, 2, 3, 3], o: [3, 2, 2, 3, 2], f: [2, 1, 2, 1, 2], p: [3, 4, 3, 3, 3], g: [2, 2, 2, 2, 2] };
function notasDe(mapa) {
  const n = {};
  Object.entries(mapa).forEach(([letra, lista]) => lista.forEach((v, i) => { n[letra + (i + 1)] = v; }));
  return n;
}
const todas = valor => notasDe({ v: Array(5).fill(valor), o: Array(5).fill(valor), f: Array(5).fill(valor), p: Array(5).fill(valor), g: Array(5).fill(valor) });

/* ---------------- texto e contrato ---------------- */
test('nenhum travessão em metodo.js nem em metodo.css', () => {
  for (const [nome, texto] of [['metodo.js', FONTE], ['metodo.css', CSS]]) {
    assert.equal(/[\u2013\u2014]/.test(texto), false, `${nome} tem travessão`);
  }
});

test('contrato: window.VOFMetodo expõe o combinado com a casca', () => {
  const { V } = montar();
  for (const k of ['MODULOS', 'ETAPAS', 'IMAGENS', 'REFERENCIAS', 'APRESENTACAO', 'PRATICAS', 'DIMENSOES']) assert.ok(V[k], k);
  for (const k of ['pontuar', 'render', 'slides', 'abrirApresentacao']) assert.equal(typeof V[k], 'function', k);
  assert.ok(Object.isFrozen(V.MODULOS) && Object.isFrozen(V.MODULOS[0]) && Object.isFrozen(V.PRATICAS[0].niveis));
});

test('MODULOS tem 18 itens, 11 no Nível 1 e 7 no Nível 2; a apresentação soma as 2 aberturas', () => {
  const { V } = montar();
  assert.equal(V.MODULOS.length, 18);
  assert.equal(V.MODULOS.filter(m => m.nivel === 1).length, 11);
  assert.equal(V.MODULOS.filter(m => m.nivel === 2).length, 7);
  assert.equal(new Set(V.MODULOS.map(m => m.id)).size, 18);
  assert.equal(V.APRESENTACAO.length, 20);
  assert.deepEqual([...V.APRESENTACAO.slice(0, 2).map(m => m.id)], ['intro-piramide', 'intro-vof']);
  for (const m of V.MODULOS) {
    for (const campo of ['titulo', 'tese', 'resumo', 'entrega', 'fonte', 'frase']) assert.ok(m[campo], `${m.id}.${campo}`);
    assert.ok(m.perguntas.length && m.evidencias.length && m.ferramentas.length, m.id);
  }
  assert.equal(V.ETAPAS.length, 5);
});

/* ---------------- as 25 práticas ---------------- */
test('PRATICAS: 25, cinco por dimensão, cada uma com 5 níveis e fonte', () => {
  const { V } = montar();
  assert.equal(V.PRATICAS.length, 25);
  assert.deepEqual([...V.DIMENSOES.map(d => d.nome)], ['Venda', 'Operação', 'Finanças', 'Pessoas', 'Gestores']);
  assert.deepEqual([...V.DIMENSOES.map(d => d.id)], ['venda', 'operacao', 'financas', 'pessoas', 'gestores']);
  const letra = { venda: 'v', operacao: 'o', financas: 'f', pessoas: 'p', gestores: 'g' };
  for (const d of V.DIMENSOES) {
    const doGrupo = V.PRATICAS.filter(x => x.dimensao === d.id);
    assert.deepEqual([...doGrupo.map(x => x.id)], [1, 2, 3, 4, 5].map(i => letra[d.id] + i), d.id);
  }
  for (const x of V.PRATICAS) {
    assert.equal(x.niveis.length, 5, x.id);
    x.niveis.forEach((n, i) => assert.ok(n.startsWith(i + ': ') && n.length > 12, `${x.id} nível ${i}`));
    assert.match(x.fonte, /^Caderno p\. \d+$/, x.id);
    assert.ok(x.titulo && x.descricao && x.evidencia, x.id);
    assert.match(x.pergunta, /\?$/, x.id);
    assert.ok(x.elevacao.para3 && x.elevacao.para4 && x.elevacao.evidencia, x.id);
    assert.match(x.elevacao.fonte, /^Caderno p\. \d+$/, x.id);
  }
  // amostras do texto fiel (caderno p. 33 e p. 30)
  const v1 = V.PRATICAS[0];
  assert.equal(v1.titulo, 'Entender o cliente');
  assert.equal(v1.pergunta, 'Sabemos para quem vender?');
  assert.equal(v1.niveis[4], '4: Aprimorado e autônomo. Além de 3: melhoria com efeito verificado e substituto capacitado que executou o padrão.');
});

/* ---------------- pontuação (regra do caderno) ---------------- */
test('pontuar dá 0 com tudo zero e 100 com tudo 4', () => {
  const { V } = montar();
  const zero = V.pontuar(todas(0)), cem = V.pontuar(todas(4));
  for (const d of V.DIMENSOES) { assert.equal(zero[d.id], 0); assert.equal(cem[d.id], 100); }
  assert.equal(zero.geral, 0); assert.equal(cem.geral, 100);
  assert.equal(cem.nucleo, 100); assert.equal(cem.sustentacao, 100);
  assert.deepEqual([...zero.faltando], []); assert.deepEqual([...cem.faltando], []);
  assert.equal(cem.cobertura, 100); assert.equal(cem.completo, true);
});

test('pontuar reproduz os exemplos fictícios do caderno (p. 91, 92 e 96)', () => {
  const { V } = montar();
  const r = V.pontuar(notasDe(EXEMPLO));
  assert.deepEqual([...V.DIMENSOES.map(d => r[d.id])], [70, 60, 40, 80, 50]);
  assert.equal(V.formatarPontos(r.nucleo), '55,1785');
  assert.equal(V.formatarPontos(r.sustentacao), '63,2456');
  assert.equal(V.formatarPontos(r.geral), '58,2739');
  assert.equal(r.faixa.nome, 'Controle em construção');
  assert.deepEqual([...r.abaixoDe40], []);
  // p. 96: dia 90 com 75, 70, 60, 80 e 65
  const dia90 = V.pontuar(notasDe({ v: [3, 3, 3, 3, 3], o: [3, 3, 3, 3, 2], f: [3, 3, 2, 2, 2], p: [4, 3, 3, 3, 3], g: [3, 3, 3, 2, 2] }));
  assert.deepEqual([...V.DIMENSOES.map(d => dia90[d.id])], [75, 70, 60, 80, 65]);
  assert.equal(V.formatarPontos(dia90.geral), '69,6406');
  // p. 92: 90/90/20/50/50 pela geométrica é 52,6612 (a aritmética daria 60)
  const extremos = V.pontuar(notasDe({ v: [4, 4, 4, 3, 3], o: [4, 4, 4, 3, 3], f: [1, 1, 1, 1, 0], p: [2, 2, 2, 2, 2], g: [2, 2, 2, 2, 2] }));
  assert.equal(V.formatarPontos(extremos.geral), '52,6612');
  assert.deepEqual([...extremos.abaixoDe40], ['financas']);
});

test('pontuar: ND não fecha a nota, N/A ajusta o denominador, zero zera o integral, valor fora da régua é nomeado', () => {
  const { V } = montar();
  const semV1 = todas(4); delete semV1.v1;
  const nd = V.pontuar(semV1);
  assert.equal(nd.venda, null); assert.equal(nd.geral, null); assert.equal(nd.completo, false);
  assert.deepEqual([...nd.faltando], ['v1']);
  assert.equal(V.formatarPontos(nd.geral), 'não calculável');
  assert.equal(nd.cobertura, 96);

  const na = V.pontuar({ ...todas(4), v1: 'na' });
  assert.equal(na.venda, 100); assert.deepEqual([...na.inaplicaveis], ['v1']); assert.equal(na.cobertura, 100);
  const naParcial = V.pontuar({ ...todas(2), v1: 'N/A', v2: 4 });
  assert.equal(naParcial.venda, 100 * (4 + 2 + 2 + 2) / 16);

  const zeroConfirmado = V.pontuar({ ...todas(4), g1: 0, g2: 0, g3: 0, g4: 0, g5: 0 });
  assert.equal(zeroConfirmado.gestores, 0); assert.equal(zeroConfirmado.geral, 0); assert.equal(zeroConfirmado.sustentacao, 0); assert.equal(zeroConfirmado.nucleo, 100);

  const invalida = V.pontuar({ ...todas(3), o2: 7 });
  assert.deepEqual([...invalida.invalidas], ['o2']); assert.deepEqual([...invalida.faltando], ['o2']); assert.equal(invalida.operacao, null);

  const salvo = {}; Object.entries(todas(3)).forEach(([k, v]) => { salvo[k] = { nota: v, evidencia: 'registro fictício' }; });
  assert.equal(V.pontuar(salvo).geral, 75);

  const vendaInteiraNA = V.pontuar({ ...todas(4), v1: 'na', v2: 'na', v3: 'na', v4: 'na', v5: 'na' });
  assert.deepEqual([...vendaInteiraNA.dimensoesSemCriterio], ['venda']); assert.equal(vendaInteiraNA.geral, null);
  assert.equal(V.pontuar().geral, null);
});

test('pontuar com N/A segue o caderno: p. 34 (100 × soma ÷ (4 × aplicáveis)) e p. 31 (cobertura sobre as aplicáveis)', () => {
  const { V } = montar();
  // Exemplo da p. 34 (Venda 3, 3, 2, 3, 3 = 70) com V1 inaplicável: 100 × 11 ÷ 16.
  const comNA = V.pontuar({ ...notasDe(EXEMPLO), v1: 'na' });
  assert.equal(comNA.venda, 68.75);
  assert.equal(comNA.detalhe.venda.aplicaveis, 4);
  assert.deepEqual([...comNA.inaplicaveis], ['v1']);
  assert.equal(comNA.cobertura, 100, '24 pontuadas de 24 aplicáveis');
  // As outras dimensões do exemplo não mudam.
  assert.deepEqual([...['operacao', 'financas', 'pessoas', 'gestores'].map(d => comNA[d])], [60, 40, 80, 50]);
  // N/A e ND juntos: a cobertura conta pontuadas ÷ aplicáveis (23 de 24), e o ND não fecha a dimensão.
  const comND = V.pontuar({ ...notasDe(EXEMPLO), v1: 'na', o2: null });
  assert.equal(comND.cobertura, Math.round(1e10 * 100 * 23 / 24) / 1e10);
  assert.equal(comND.operacao, null);
  assert.equal(comND.geral, null);
  // Salvo pela tela, na forma {nota: 'na', evidencia}.
  assert.equal(V.pontuar({ ...notasDe(EXEMPLO), v1: { nota: 'na', evidencia: 'Só vende à vista' } }).venda, 68.75);
});

/* ---------------- abas ---------------- */
test('render desenha as quatro abas e navega por teclado', () => {
  const amb = montar(), { V, app, document } = amb;
  V.render(app);
  const tabs = [...document.querySelectorAll('[role=tab]')];
  assert.deepEqual(tabs.map(t => t.textContent), ['Visão geral', 'Nível 1 · Fundamentos', 'Nível 2 · Avançado', 'Ferramentas e fontes']);
  const painel = t => document.getElementById(t.getAttribute('aria-controls'));
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true'); assert.equal(tabs[0].getAttribute('tabindex'), '0');
  assert.equal(painel(tabs[1]).hidden, true);
  tecla(amb, tabs[0], 'ArrowRight');
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true'); assert.equal(tabs[0].getAttribute('tabindex'), '-1');
  assert.equal(painel(tabs[1]).hidden, false); assert.equal(painel(tabs[0]).hidden, true);
  assert.equal(document.activeElement, tabs[1]);
  tecla(amb, tabs[1], 'End'); assert.equal(tabs[3].getAttribute('aria-selected'), 'true');
  tecla(amb, tabs[3], 'ArrowRight'); assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  tecla(amb, tabs[0], 'ArrowLeft'); assert.equal(tabs[3].getAttribute('aria-selected'), 'true');
  tecla(amb, tabs[3], 'Home'); assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  assert.equal(painel(tabs[1]).querySelectorAll('.vof-module-card').length, 11);
  assert.equal(painel(tabs[2]).querySelectorAll('.vof-module-card').length, 7);
  assert.deepEqual([...document.querySelectorAll('.vof-architecture b')].map(x => x.textContent), ['Venda', 'Operação', 'Finanças', 'Pessoas', 'Gestores']);
});

test('visão geral mantém a ordem final da Central', () => {
  const { V, app, document } = montar();
  V.render(app, { cabecalho: false });
  assert.equal(document.querySelector('.vof-topo'), null);
  const visao = document.querySelector('[role=tabpanel]');
  const ordem = [...visao.children].map(x => x.className.split(' ').find(c => c.startsWith('vof-')));
  assert.deepEqual(ordem, ['vof-hero', 'vof-reading-guide', 'vof-opening', 'vof-metrics', 'vof-journey', 'vof-section-head', 'vof-module-grid', 'vof-overview-details']);
  const dentro = [...visao.querySelector('[data-vof-aprofundar]').children].map(x => x.className);
  assert.deepEqual(dentro, ['vof-visuals', 'vof-section-head', 'vof-architecture', 'vof-section-head', 'vof-cycle', 'vof-principles', 'vof-section-head', 'vof-timeline']);
  assert.equal(visao.querySelectorAll('.vof-module-grid .vof-module-card').length, 6);
});

test('a aba escolhida é lembrada entre desenhos e pode vir da casca', () => {
  const { V, app, document } = montar();
  const trocas = [];
  V.render(app, { aoTrocarAba: id => trocas.push(id) });
  document.querySelectorAll('[role=tab]')[2].click();
  V.render(app);
  assert.equal(document.querySelector('[role=tab][aria-selected=true]').textContent, 'Nível 2 · Avançado');
  V.render(app, { aba: 'ferramentas' });
  assert.equal(document.querySelector('[role=tab][aria-selected=true]').textContent, 'Ferramentas e fontes');
  assert.ok(trocas.includes('nivel2'));
});

/* ---------------- sala de apresentação ---------------- */
test('apresentação: as 20 etapas oferecem conteúdo, pergunta, visual e fonte', () => {
  const amb = abrir();
  assert.equal(amb.modal.querySelectorAll('select option').length, 20);
  for (let i = 0; i < 20; i++) {
    assert.ok(titulo(amb));
    assert.ok(amb.q('[data-pergunta-principal]').textContent);
    assert.match(amb.q('[data-fonte]').textContent, /Caderno completo/);
    assert.ok(amb.q('[data-vof-visual]').children.length);
    amb.q('[data-proximo]').click();
  }
  assert.match(titulo(amb), /Times, AP/);
});

test('apresentar e aplicar têm visibilidade independente e preservam o rascunho', () => {
  const amb = abrir(2), q = amb.q;
  assert.equal(q('.vof-slide').hidden, false); assert.equal(q('[data-vof-aplicacao]').hidden, true);
  q('[data-vof-modo="aplicar"]').click(); assert.equal(q('.vof-slide').hidden, true);
  const area = q('textarea'); area.value = 'Revisar a promessa com a equipe em sete dias'; area.oninput();
  q('[data-vof-modo="apresentar"]').click(); q('[data-vof-modo="aplicar"]').click(); assert.equal(q('textarea').value, area.value);
  q('[data-proximo]').click(); q('[data-anterior]').click(); assert.equal(q('textarea').value, area.value);
});

test('setas editam a resposta sem trocar o assunto', () => {
  const amb = abrir(2, 'aplicar'), antes = titulo(amb), area = amb.q('textarea');
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageDown']) {
    const ev = tecla(amb, area, key);
    assert.equal(titulo(amb), antes); assert.equal(ev.defaultPrevented, false);
  }
  tecla(amb, amb.modal, 'ArrowRight'); assert.match(titulo(amb), /Conscientizar/);
});

test('atalhos respeitam seletor, modificadores e janelas sobrepostas', () => {
  const amb = abrir(2), antes = titulo(amb);
  tecla(amb, amb.q('select'), 'ArrowRight'); assert.equal(titulo(amb), antes);
  tecla(amb, amb.modal, 'ArrowRight', { ctrlKey: true }); assert.equal(titulo(amb), antes);
  const outra = amb.document.createElement('div');
  outra.setAttribute('role', 'dialog'); outra.setAttribute('aria-modal', 'true'); outra.innerHTML = '<input aria-label="Teste">';
  amb.document.body.appendChild(outra);
  tecla(amb, outra, 'ArrowRight'); assert.equal(titulo(amb), antes);
  tecla(amb, amb.modal, 'ArrowRight'); assert.equal(titulo(amb), antes, 'com outra janela por cima, a sala não anda');
  tecla(amb, outra, 'Escape'); assert.ok(amb.modal.isConnected, 'Esc de outra janela não fecha a sala');
  outra.remove();
  tecla(amb, amb.modal, 'ArrowRight'); assert.notEqual(titulo(amb), antes);
});

test('início e final têm limites, passador anda por PageUp/PageDown e a conclusão é explícita', () => {
  const amb = abrir();
  tecla(amb, amb.modal, 'ArrowLeft'); assert.match(titulo(amb), /pirâmide/);
  tecla(amb, amb.modal, 'PageDown'); assert.match(titulo(amb), /O que é o Método/);
  tecla(amb, amb.modal, 'PageUp'); assert.match(titulo(amb), /pirâmide/);
  tecla(amb, amb.modal, 'End'); assert.match(titulo(amb), /Times, AP/);
  assert.equal(amb.q('[data-proximo]').hidden, true); assert.equal(amb.q('[data-finalizar]').hidden, false);
  tecla(amb, amb.modal, 'ArrowRight'); assert.match(titulo(amb), /Times, AP/);
  tecla(amb, amb.modal, 'Home'); assert.match(titulo(amb), /pirâmide/);
  assert.equal(amb.q('[data-anterior]').disabled, true);
  amb.q('[data-vof-indice]').querySelector('option[value="7"]').selected = true;
  amb.q('[data-vof-indice]').onchange(); assert.equal(titulo(amb), amb.V.APRESENTACAO[7].titulo);
});

test('a missão pontua uma vez, grava em vof_jornada_v1 e mantém a evidência', () => {
  const amb = abrir(2, 'aplicar'), q = amb.q;
  q('.vof-challenge-option').click();
  q('textarea').value = 'Validar escopo com a operação até sexta-feira'; q('textarea').oninput();
  assert.equal(q('[data-vof-salvar]').disabled, false);
  q('[data-vof-salvar]').click(); q('[data-vof-salvar]').click();
  assert.equal(amb.V.jornada.estado().xp, 30);
  assert.equal(JSON.parse(amb.memoria.get('vof_jornada_v1')).xp, 30);
  q('[data-proximo]').click(); q('[data-anterior]').click();
  assert.match(q('textarea').value, /Validar escopo/); assert.match(q('[data-vof-salvar]').textContent, /Atualizar resposta/);
});

test('continuar missão abre direto no modo Aplicar, no primeiro módulo aberto', () => {
  const { V, app, document } = montar();
  V.render(app);
  document.querySelector('[data-vof-continuar]').click();
  const p = document.querySelector('.vof-presenter');
  assert.equal(p.dataset.modo, 'aplicar'); assert.equal(document.querySelector('[data-vof-aplicacao]').hidden, false);
  assert.equal(document.querySelector('[data-titulo]').textContent, V.MODULOS[0].titulo);
});

test('modal autocontido: fundo inerte, Tab não escapa, Esc fecha e o foco volta', () => {
  const amb = montar(), { V, app, document } = amb;
  V.render(app);
  const botao = document.querySelector('[data-vof-apresentar]');
  botao.focus(); botao.click();
  const overlay = document.querySelector('.vof-overlay'), modal = overlay.querySelector('.modal-vof');
  assert.equal(modal.getAttribute('role'), 'dialog'); assert.equal(modal.getAttribute('aria-modal'), 'true');
  assert.equal(app.hasAttribute('inert'), true); assert.equal(app.getAttribute('aria-hidden'), 'true');
  assert.equal(document.activeElement, overlay.querySelector('.vof-fechar'));
  const itens = [...modal.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex="0"]')].filter(x => !x.disabled && !x.closest('[hidden]'));
  itens.at(-1).focus();
  const ev = tecla(amb, itens.at(-1), 'Tab');
  assert.equal(ev.defaultPrevented, true); assert.equal(document.activeElement, itens[0]);
  tecla(amb, itens[0], 'Tab', { shiftKey: true }); assert.equal(document.activeElement, itens.at(-1));
  tecla(amb, modal, 'Escape');
  assert.equal(document.querySelector('.vof-overlay'), null);
  assert.equal(app.hasAttribute('inert'), false); assert.equal(app.hasAttribute('aria-hidden'), false);
  assert.equal(document.activeElement, botao);
});

test('uma sala por vez; o controle leva ao slide e avisa a casca (sala pelo celular)', () => {
  const amb = montar(), { V, document } = amb;
  const avisos = [];
  V.ouvir('vof-apresentacao', e => avisos.push(e));
  const c = V.abrirApresentacao(0);
  assert.equal(V.abrirApresentacao(5, 'aplicar'), c);
  assert.equal(document.querySelectorAll('.vof-overlay').length, 1);
  assert.equal(c.indice, 5); assert.equal(c.modo, 'aplicar');
  assert.equal(c.irPara(99), false); assert.equal(c.indice, 5);
  c.proximo(); assert.equal(document.querySelector('[data-titulo]').textContent, V.APRESENTACAO[6].titulo);
  tecla(amb, c.modal, 'ArrowRight');
  assert.deepEqual(avisos.map(a => a.tipo + ':' + a.origem), ['abriu:abrir', 'slide:abrir', 'modo:abrir', 'slide:controle', 'slide:teclado']);
  assert.equal(avisos.at(-1).indice, 7);
  assert.equal(c.telaCheia(true), true); assert.ok(c.modal.classList.contains('vof-expanded'));
  c.fechar();
  assert.equal(avisos.at(-1).tipo, 'fechou'); assert.equal(V.apresentacaoAtual(), null); assert.equal(c.aberta, false);
});

test('slides() devolve a lista plana para a casca', () => {
  const { V } = montar();
  const s = V.slides();
  assert.equal(s.length, 20);
  s.forEach((x, i) => {
    assert.equal(x.indice, i);
    for (const campo of ['titulo', 'tese', 'frase', 'fonte', 'visualHTML']) assert.ok(x[campo], `${i}.${campo}`);
    assert.ok(Array.isArray(x.perguntas) && Array.isArray(x.evidencias) && Array.isArray(x.ferramentas));
  });
  assert.equal(s[0].tipo, 'abertura'); assert.equal(s[2].tipo, 'modulo');
  assert.match(s[4].visualHTML, /O motor do método/);
});

/* ---------------- o que vem da casca ---------------- */
test('apostila: sem a casca avisa a aba Apostila; com a casca chama abrirApostila; o PDF morto sumiu', () => {
  const sem = montar();
  sem.V.render(sem.app);
  sem.document.querySelector('[data-vof-caderno]').click();
  assert.equal(sem.document.querySelector('.vof-layout .vof-aviso').textContent, 'A apostila é aberta pela aba Apostila.');
  assert.equal(sem.document.querySelector('a[href*="Caderno_Completo"]'), null);

  const com = montar(), chamadas = [];
  com.V.render(com.app, { abrirApostila: arg => chamadas.push(arg.origem) });
  com.document.querySelector('[data-vof-caderno]').click();
  com.document.querySelector('.vof-topo [data-vof-apostila]').click();
  com.document.querySelector('.vof-reference [data-vof-apostila]').click();
  com.V.abrirApresentacao(3);
  com.document.querySelector('[data-caderno]').click();
  assert.deepEqual(chamadas, ['capa', 'cabecalho', 'referencias', 'apresentacao']);
});

test('apostila pela sala: com a casca a sala fecha antes; sem a casca o aviso aparece dentro da sala', () => {
  const com = montar(), chamadas = [];
  com.V.render(com.app, { abrirApostila: arg => chamadas.push([arg.origem, Boolean(com.document.querySelector('.vof-overlay'))]) });
  com.V.abrirApresentacao(4);
  com.document.querySelector('[data-caderno]').click();
  assert.deepEqual(chamadas, [['apresentacao', false]], 'a casca recebe a chamada com a sala já fechada');

  const sem = montar();
  sem.V.render(sem.app);
  sem.V.abrirApresentacao(4);
  sem.document.querySelector('[data-caderno]').click();
  assert.ok(sem.document.querySelector('.vof-overlay'), 'sem a casca a sala continua aberta');
  assert.equal(sem.document.querySelector('.modal-vof > .vof-aviso').textContent, 'A apostila é aberta pela aba Apostila.');
});

test('a sala fecha quando a casca troca de tela (hash) e não cala a região de avisos', () => {
  const amb = montar(), { V, document } = amb;
  const toasts = document.createElement('div');
  toasts.id = 'toasts'; toasts.setAttribute('role', 'status'); toasts.setAttribute('aria-live', 'polite');
  document.body.appendChild(toasts);
  V.render(amb.app);
  V.abrirApresentacao(3);
  assert.equal(amb.app.hasAttribute('inert'), true);
  assert.equal(toasts.hasAttribute('inert'), false); assert.equal(toasts.hasAttribute('aria-hidden'), false);
  amb.ctx.dispatchEvent(new Event('hashchange'));
  assert.equal(document.querySelector('.vof-overlay'), null);
  assert.equal(V.apresentacaoAtual(), null);
  assert.equal(amb.app.hasAttribute('inert'), false);
  // depois de fechada, outra troca de tela não faz nada (o ouvinte saiu junto)
  assert.doesNotThrow(() => amb.ctx.dispatchEvent(new Event('hashchange')));
});

test('apostila: falha da casca vira aviso com a causa', async () => {
  const amb = montar();
  amb.V.render(amb.app, { abrirApostila: () => Promise.reject(new Error('sem conexão')) });
  amb.document.querySelector('[data-vof-caderno]').click();
  await new Promise(r => setImmediate(r));
  assert.equal(amb.document.querySelector('.vof-layout .vof-aviso').textContent, 'Não foi possível abrir a apostila: sem conexão');
});

test('complemento: o botão só existe quando a casca fornece abrirComplemento', () => {
  const sem = montar();
  sem.V.render(sem.app);
  assert.equal(sem.document.querySelector('.vof-tool-card [data-vof-complemento]'), null);
  sem.V.abrirApresentacao(2, 'aplicar');
  assert.equal(sem.document.querySelector('[data-vof-extra]').hidden, true);

  const com = montar(), chamadas = [];
  com.V.render(com.app, { abrirComplemento: (id, ctx) => chamadas.push([id, ctx.origem]) });
  com.document.querySelector('.vof-tool-card [data-vof-complemento]').click();
  com.V.abrirApresentacao(0, 'aplicar');
  assert.equal(com.document.querySelector('[data-vof-extra]').hidden, true, 'abertura não tem complemento');
  com.V.apresentacaoAtual().irPara(8);
  assert.equal(com.document.querySelector('[data-vof-extra]').hidden, false);
  com.document.querySelector('[data-vof-extra] [data-vof-complemento]').click();
  assert.equal(com.document.querySelector('.vof-overlay'), null, 'a sala fecha antes de a casca mostrar o complemento');
  assert.deepEqual(chamadas, [[null, 'ferramentas'], [com.V.APRESENTACAO[8].id, 'apresentacao']]);
});

/* ---------------- jornada ---------------- */
test('jornada: traz o progresso da Central uma vez, sem apagar a chave de lá, e limpar não ressuscita', () => {
  const memoria = new Map([['cl_vof_jornada_v1', JSON.stringify({ xp: 60, respostas: { arquitetura: { concluida: true }, conscientizar: { concluida: true } } })]]);
  const amb = montar({ memoria });
  assert.equal(amb.V.jornada.estado().xp, 60);
  assert.ok(memoria.has('vof_jornada_v1')); assert.ok(memoria.has('cl_vof_jornada_v1'));
  amb.V.render(amb.app);
  assert.match(amb.document.querySelector('[data-vof-journey-status]').textContent, /^2 de 18/);
  assert.equal(amb.document.querySelectorAll('.vof-module-card.concluida').length, 2 + 2, 'visão geral e Nível 1 mostram as duas concluídas');
  amb.document.querySelector('[data-vof-limpar]').click();
  assert.equal(amb.V.jornada.estado().xp, 0);
  assert.equal(montar({ memoria }).V.jornada.estado().xp, 0, 'recarregar não copia de novo');
  assert.equal(amb.document.querySelectorAll('.vof-module-card.concluida').length, 0);
});

test('jornada: limpar pede confirmação e localStorage quebrado não derruba a tela', () => {
  const memoria = new Map([['vof_jornada_v1', JSON.stringify({ xp: 30, respostas: { arquitetura: { concluida: true } } })]]);
  const amb = montar({ memoria, confirmar: () => false });
  amb.V.render(amb.app);
  amb.document.querySelector('[data-vof-limpar]').click();
  assert.equal(amb.V.jornada.estado().xp, 30);
  const quebrado = new Map([['vof_jornada_v1', '{isto não é json']]);
  const b = montar({ memoria: quebrado });
  assert.equal(b.V.jornada.estado().xp, 0);
  assert.doesNotThrow(() => b.V.render(b.app));
});

/* ---------------- arquivos ---------------- */
test('toda imagem citada existe em assets/vof e todo caminho é relativo', () => {
  const { V } = montar();
  const caminhos = new Set([...FONTE.matchAll(/["'(]((?:\.\/)?assets\/[^"')\s]+)/g)].map(m => m[1]));
  assert.ok(caminhos.size >= 5);
  for (const c of caminhos) {
    assert.ok(c.startsWith('./assets/vof/'), `caminho não relativo: ${c}`);
    assert.ok(existsSync(new URL(c, raiz)), `imagem ausente: ${c}`);
  }
  Object.values(V.IMAGENS).forEach(img => assert.ok(existsSync(new URL(img.src, raiz)), img.src));
  assert.doesNotMatch(FONTE, /https?:\/\/[^'"]*\.(png|jpe?g|pdf)/);
});

test('metodo.css só usa tokens próprios e não conta com o modal da Central', () => {
  const alheios = [...CSS.matchAll(/var\(--(?!vof-)[\w-]+/g)].map(m => m[0]);
  assert.deepEqual(alheios, []);
  assert.doesNotMatch(CSS, /#modais|\.fundo\b|(?<![\w-])\.btn\b|(?<![\w-])\.kpi\b/);
  assert.match(CSS, /prefers-color-scheme:dark/);
});
