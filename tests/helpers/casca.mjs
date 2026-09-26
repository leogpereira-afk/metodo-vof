// Bancada da casca: carrega o index.html no linkedom e roda os scripts na
// ordem do index dentro de uma vm, com localStorage, fetch e location falsos.
// Mesma técnica da Central (vida-leo/tests/helpers/dom.mjs).
//
// Todos os nomes aqui são inventados. Nenhum cliente, participante ou CPF real.
import { parseHTML } from 'linkedom';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';

export const RAIZ = new URL('../../', import.meta.url);
export const ler = nome => readFileSync(new URL(nome, RAIZ), 'utf8');
export const existe = nome => existsSync(new URL(nome, RAIZ));

export function crachaFalso({ sis = 'vof', sub = 'zz_facilitadora', nome = 'Facilitadora de Teste', papel = 'facilitador', exp } = {}) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const agora = Math.floor(Date.now() / 1000);
  return b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sis, sub, nome, papel, iat: agora, exp: exp ?? agora + 3600 }) + '.assinatura-de-teste';
}

// Um VOFMetodo falso, para a casca ser testada mesmo sem o metodo.js. Imita o
// contrato: 25 práticas, cinco dimensões e a regra "dimensão com prática sem
// nota fica em aberto (null)".
export const METODO_FALSO = `
window.VOFMetodo = (function () {
  var DIMENSOES = [{id:'venda',nome:'Venda'},{id:'operacao',nome:'Operação'},{id:'financas',nome:'Finanças'},{id:'pessoas',nome:'Pessoas'},{id:'gestores',nome:'Gestores'}];
  var LETRA = {venda:'v',operacao:'o',financas:'f',pessoas:'p',gestores:'g'};
  var PRATICAS = [];
  DIMENSOES.forEach(function (d) { for (var i = 1; i <= 5; i++) PRATICAS.push({ id: LETRA[d.id] + i, dimensao: d.id, titulo: 'Prática ' + i + ' de ' + d.nome, pergunta: 'Acontece de verdade?', niveis: ['0: Ausente. nada','1: Definido. pouco','2: Executado. parte','3: Controlado. quase','4: Aprimorado. pleno'], fonte: 'Caderno p. 1' }); });
  function pontuar(notas) {
    var r = { faltando: [] }, valores = [];
    DIMENSOES.forEach(function (d) {
      var soma = 0, falta = false;
      PRATICAS.filter(function (p) { return p.dimensao === d.id; }).forEach(function (p) {
        var v = notas[p.id]; if (typeof v === 'number') soma += v; else { falta = true; r.faltando.push(p.id); }
      });
      r[d.id] = falta ? null : 100 * soma / 20; valores.push(r[d.id]);
    });
    r.geral = valores.some(function (v) { return v === null; }) ? null : valores.reduce(function (a, b) { return a + b; }, 0) / valores.length;
    return r;
  }
  var SLIDES = [
    { titulo: 'Abertura de teste', tese: 'Tese de teste', frase: 'Frase de teste', perguntas: ['Pergunta A?'], evidencias: ['Evidência A'], ferramentas: ['Ferramenta A'], fonte: 'Caderno p. 2', visualHTML: '<div class="visual-teste">visual</div>' },
    { titulo: 'Segundo slide de teste', tese: 'Outra tese', frase: '', perguntas: ['Pergunta B?'], evidencias: [], ferramentas: [], fonte: 'Caderno p. 3', visualHTML: '' },
    { titulo: 'Terceiro slide de teste', tese: 'Mais uma tese', frase: '', perguntas: [], evidencias: [], ferramentas: [], fonte: '', visualHTML: '' },
    { titulo: 'Quarto slide de teste', tese: 'Última tese', frase: '', perguntas: [], evidencias: [], ferramentas: [], fonte: '', visualHTML: '' }
  ];
  return {
    MODULOS: [{ id: 'arquitetura', titulo: 'Arquitetura do método', nivel: 1 }], ETAPAS: [], IMAGENS: {}, REFERENCIAS: [], APRESENTACAO: [],
    PRATICAS: PRATICAS, DIMENSOES: DIMENSOES, pontuar: pontuar,
    render: function (c, o) { window.__renders = (window.__renders || 0) + 1; window.__opcoesRender = o; c.innerHTML = '<div class="metodo-falso">Método desenhado</div>'; },
    slides: function () { return SLIDES.map(function (s, i) { return Object.assign({ indice: i }, s); }); },
    abrirApresentacao: function (i, m) { window.__abriu = [i, m]; }
  };
})();`;

// Servidor falso do vof-sync e do equipe-auth. Guarda as chamadas, confere a
// revisão otimista como o rpc de verdade e aceita falhas programadas por ação:
// falhas = { list: { status: 401, corpo: {...} } } ou { rev: 'rede' }.
// arquivados = { planos: [registro, ...] }: nascem arquivados (revisão 2), e o
// falso imita a porta: a lista manda o arquivado sem conteúdo ao facilitador,
// upsert em arquivado volta 409 e restore é só do admin.
export function servidorFalso({ dados = {}, arquivados = {}, conteudo = null, papel = 'facilitador', falhas = {}, eu = null } = {}) {
  const banco = new Map();
  let relogio = 0;
  const agora = () => new Date(Date.UTC(2026, 8, 25, 12, 0, 0, relogio++)).toISOString();
  const guardar = (colecao, reg) => banco.set(colecao + ':' + reg.id, { colecao, id: reg.id, registro: JSON.parse(JSON.stringify(reg)), revision: 1, apagado: false, atualizado_em: agora() });
  for (const [col, regs] of Object.entries(dados)) regs.forEach(r => guardar(col, r));
  for (const [col, regs] of Object.entries(arquivados)) regs.forEach(r => { guardar(col, r); Object.assign(banco.get(col + ':' + r.id), { apagado: true, revision: 2 }); });
  if (conteudo) for (const [id, doc] of Object.entries(conteudo)) guardar('conteudo', Object.assign({ id }, doc));
  const chamadas = [];
  const resposta = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(JSON.stringify(corpo)) });
  const porColecao = () => {
    const pc = {};
    for (const l of banco.values()) pc[l.colecao] = (pc[l.colecao] || 0) + l.revision;
    return pc;
  };
  async function fetchFalso(url, init) {
    const corpo = JSON.parse(init && init.body ? init.body : '{}');
    const auth = (init && init.headers && (init.headers.Authorization || init.headers.authorization)) || '';
    if (String(url).endsWith('/equipe-auth')) {
      chamadas.push({ porta: 'equipe-auth', ...corpo, auth });
      if (falhas.eu === 'rede') throw new TypeError('Failed to fetch');
      if (corpo.acao === 'eu') return eu ? resposta(eu.status || 200, eu.corpo || eu) : resposta(200, { ok: true });
      return resposta(400, { erro: 'Ação não prevista no teste.' });
    }
    chamadas.push({ porta: 'vof-sync', ...corpo, auth });
    const f = falhas[corpo.action];
    if (f === 'rede') throw new TypeError('Failed to fetch');
    if (f) return resposta(f.status, f.corpo || { erro: 'falha programada' });
    switch (corpo.action) {
      case 'rev': return resposta(200, { rev: { rev: 1, porColecao: porColecao() } });
      case 'list': {
        const itens = [...banco.values()].filter(l => l.colecao === corpo.colecao)
          .map(l => ({ id: l.id, registro: l.apagado && papel !== 'admin' ? { id: l.id } : l.registro, apagado: l.apagado, atualizado_em: l.atualizado_em, revision: l.revision }));
        return resposta(200, { itens, proximo: null });
      }
      case 'get': {
        const l = banco.get(corpo.colecao + ':' + corpo.id);
        return resposta(200, { registro: l && !l.apagado ? l.registro : null, revision: l ? l.revision : 0 });
      }
      case 'upsert': {
        if (corpo.colecao === 'conteudo' && papel !== 'admin') return resposta(403, { erro: 'Seu acesso não permite esta alteração.' });
        const chave = corpo.colecao + ':' + corpo.registro.id;
        const l = banco.get(chave);
        const atual = l ? l.revision : 0;
        const esperada = corpo.expectedRevision ?? atual;
        if (esperada !== atual) return resposta(409, { erro: 'Outra pessoa atualizou este item. Sua alteração foi preservada para revisão.' });
        if (l && l.apagado) return resposta(409, { erro: 'Este item foi arquivado. Atualize a lista.' });
        const reg = Object.assign({}, corpo.registro, { atualizadoEm: agora() });
        banco.set(chave, { colecao: corpo.colecao, id: reg.id, registro: reg, revision: atual + 1, apagado: false, atualizado_em: agora() });
        return resposta(200, { ok: true, revision: atual + 1, registro: reg, apagado: false });
      }
      case 'delete': {
        if (papel !== 'admin') return resposta(403, { erro: 'Seu acesso não permite esta alteração.' });
        const l = banco.get(corpo.colecao + ':' + corpo.id);
        if (!l) return resposta(409, { erro: 'Item não encontrado.' });
        l.apagado = true; l.revision++;
        return resposta(200, { ok: true, revision: l.revision, registro: l.registro, apagado: true });
      }
      case 'restore': {
        if (papel !== 'admin') return resposta(403, { erro: 'Seu acesso não permite esta alteração.' });
        const l = banco.get(corpo.colecao + ':' + corpo.id);
        if (!l) return resposta(409, { erro: 'Este item não existe mais. Atualize a lista.' });
        l.apagado = false; l.revision++; l.atualizado_em = agora();
        return resposta(200, { ok: true, revision: l.revision, registro: l.registro, apagado: false });
      }
      case 'urlArquivo': return resposta(200, { url: 'https://exemplo.test/cofre/apostila.pdf?assinatura=teste', expira: new Date(Date.now() + 600000).toISOString() });
      default: return resposta(400, { erro: 'Ação desconhecida.' });
    }
  }
  return { fetch: fetchFalso, chamadas, banco, doSync: acao => chamadas.filter(c => c.porta === 'vof-sync' && (!acao || c.action === acao)) };
}

export const assentar = async (voltas = 30) => { for (let i = 0; i < voltas; i++) await new Promise(r => setImmediate(r)); };

// Monta a página. metodo: 'falso' (padrão), 'real' (metodo.js do projeto) ou 'nenhum'.
export function montar({ cracha = null, usuarioSalvo = null, hash = '#/', servidor = servidorFalso(), metodo = 'falso', memoria = new Map() } = {}) {
  const { document, window: jan, HTMLElement } = parseHTML(ler('index.html'));
  let foco = null;
  HTMLElement.prototype.focus = function () { foco = this; };
  HTMLElement.prototype.blur = function () { if (foco === this) foco = null; };
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => foco || document.body });
  if (cracha) memoria.set('vof_cracha', cracha);
  if (usuarioSalvo) memoria.set('vof_user', JSON.stringify(usuarioSalvo));
  const localStorage = {
    getItem: k => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => { memoria.set(k, String(v)); },
    removeItem: k => { memoria.delete(k); }, clear: () => memoria.clear(), key: i => [...memoria.keys()][i] ?? null,
    get length() { return memoria.size; },
  };
  const ouvintes = {};
  const aberturas = [];
  let hashAtual = hash;
  const sandbox = {
    document, console, localStorage, sessionStorage: localStorage,
    navigator: { onLine: true, userAgent: 'bancada' },
    history: { replaceState() {}, pushState() {} },
    fetch: servidor.fetch,
    AbortController, atob, btoa, crypto: globalThis.crypto, URL, URLSearchParams, TextEncoder, TextDecoder,
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; },
    clearTimeout: t => clearTimeout(t), setInterval: () => 0, clearInterval: () => {},
    queueMicrotask,
    Event: jan.Event, CustomEvent: jan.CustomEvent, HTMLElement,
    open: (...args) => { aberturas.push(args); return null; },
    scrollTo() {}, scrollY: 0, alert() {}, confirm: () => true,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener(tipo, fn) { (ouvintes[tipo] = ouvintes[tipo] || []).push(fn); },
    removeEventListener(tipo, fn) { ouvintes[tipo] = (ouvintes[tipo] || []).filter(f => f !== fn); },
    dispatchEvent(ev) { (ouvintes[ev.type] || []).slice().forEach(f => f(ev)); return true; },
  };
  sandbox.location = {
    get hash() { return hashAtual; },
    set hash(v) {
      const novo = String(v).startsWith('#') ? String(v) : '#' + v;
      if (novo === hashAtual) return;
      hashAtual = novo;
      queueMicrotask(() => sandbox.dispatchEvent({ type: 'hashchange' }));
    },
    get href() { return 'https://exemplo.test/metodo-vof/' + hashAtual; },
    origin: 'https://exemplo.test', pathname: '/metodo-vof/', hostname: 'exemplo.test', reload() {},
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  const scripts = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src').replace(/^\.\//, ''));
  for (const nome of scripts) {
    if (nome === 'metodo.js') {
      if (metodo === 'nenhum') continue;
      if (metodo === 'falso' || !existe('metodo.js')) { vm.runInContext(METODO_FALSO, sandbox, { filename: 'metodo-falso.js' }); continue; }
    }
    vm.runInContext(ler(nome), sandbox, { filename: nome });
  }
  const run = codigo => vm.runInContext(codigo, sandbox);
  const irPara = async h => { sandbox.location.hash = h; await assentar(); };
  const app = () => document.querySelector('#app');
  const texto = () => app().textContent;
  const evento = (el, tipo, extra) => { const ev = new jan.Event(tipo, { bubbles: true, cancelable: true }); Object.assign(ev, extra || {}); el.dispatchEvent(ev); return ev; };
  const focar = el => { foco = el; };
  return { sandbox, document, run, memoria, servidor, aberturas, irPara, app, texto, evento, focar, janela: jan };
}
