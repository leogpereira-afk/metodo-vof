// XSS: dado gravado por uma pessoa e visto por outra não vira código.
//
// Por que importa: o app mora em leogpereira-afk.github.io, a mesma origem de
// outros dez sistemas da casa, e todos guardam o crachá (JWT de 30 dias) no
// localStorage dessa origem. Um único XSS aqui lê os crachás de TODOS.
//
// Como o teste trabalha: cada campo de texto de cada coleção (turmas,
// empresas, diagnósticos, planos, salas), do conteúdo do APN, do crachá, da
// resposta do servidor e do hash da URL recebe uma carga DIFERENTE, marcada
// com o nome do campo. O teste passa por todas as áreas e editores e, a cada
// passo, confere o DOM inteiro:
//   1. nenhum atributo on* (onerror, onload, onmouseover, ontoggle...);
//   2. nenhum script, iframe, object, embed, base, svg, math, style ou link
//      nascido de dado (os scripts do index.html são os únicos);
//   3. nenhum href, src, action ou data começando com javascript:, data: ou
//      vbscript:, e nenhuma imagem fora de ./assets e ./icone;
//   4. nenhum nome de atributo estranho (sinal de aspas que romperam o valor).
// E confere que cada carga APARECEU em algum lugar (texto, valor de campo ou
// atributo): assim o teste não passa por não ter chegado à tela certa.
//
// Rodar: node --test tests/
// Nomes daqui são inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { montar, crachaFalso, servidorFalso, assentar, ler } from './helpers/casca.mjs';

/* ───────────── as cargas ───────────── */
const TIPOS = [
  m => `<img src=x onerror=alert('${m}')>`,
  m => `"><svg onload=alert('${m}')>`,
  m => `' onmouseover='alert("${m}")' data-x='`,
  m => `javascript:alert('${m}')`,
  m => `</textarea><script>alert('${m}')</script>`,
  m => `"><iframe src="javascript:alert('${m}')"></iframe>`,
  m => `'><object data="javascript:alert('${m}')"></object>`,
  m => `</option></select><embed src="javascript:alert('${m}')">`,
  m => `<a href="javascript:alert('${m}')">${m}</a>`,
  m => `<details open ontoggle=alert('${m}')>`,
  m => `data:text/html,<script>alert('${m}')</script>`,
  m => `" onfocus="alert('${m}')" autofocus x="`,
  m => `<a href=" vbscript:msgbox('${m}')">${m}</a>`,
  m => `<base href="javascript:alert('${m}')//">`,
  m => `<math><style>*{}</style><a xlink:href="javascript:alert('${m}')">x</a></math>`,
];
// A cauda rompe QUALQUER contexto que ficar sem escape: texto, atributo com
// aspas duplas ou simples e o miolo de um textarea. Sem ela, um campo que por
// acaso recebesse "<img ...>" dentro de um textarea passaria sem escape e sem
// alarme (o navegador lê o miolo do textarea como texto).
const CAUDA = m => `</textarea>"'><img src=x onerror=alert('${m}')>`;
const marcaDe = campo => 'xss-' + campo.toLowerCase().replace(/[^a-z0-9]+/g, '-');
function fabrica() {
  let n = 0;
  const marcas = new Map();
  const carga = campo => {
    const marca = marcaDe(campo);
    assert.ok(!marcas.has(marca), 'campo repetido no teste: ' + campo);
    marcas.set(marca, campo);
    return TIPOS[n++ % TIPOS.length](marca) + CAUDA(marca);
  };
  return { carga, marcas };
}

/* ───────────── a conferência do DOM ───────────── */
const TAGS_PROIBIDAS = new Set(['script', 'iframe', 'object', 'embed', 'frame', 'frameset', 'base', 'svg', 'math', 'style', 'link', 'meta', 'template', 'applet', 'noscript']);
const ATRIBUTOS_DE_URL = new Set(['href', 'src', 'action', 'formaction', 'data', 'xlink:href', 'poster', 'background', 'codebase', 'cite', 'srcset', 'ping', 'lowsrc', 'dynsrc']);
const ESQUEMA_PERIGOSO = /^(javascript|data|vbscript):/;
const NOME_DE_ATRIBUTO = /^[a-z][a-z0-9-]*$/;
const nomesDe = el => Array.from(el.getAttributeNames ? el.getAttributeNames() : []);

function conferir(p, passo) {
  const d = p.document;
  const problemas = [];
  for (const el of d.querySelectorAll('*')) {
    const tag = String(el.tagName).toLowerCase();
    const noCorpo = !!(d.body && d.body.contains(el));
    // Do index.html: os scripts e o aviso de "sem JavaScript", filhos diretos do body.
    const doIndex = el.parentNode === d.body && p.doIndex.has(tag + ':' + (el.getAttribute('src') || ''));
    if (tag === 'script' && !doIndex) problemas.push('script criado: ' + el.outerHTML.slice(0, 120));
    if (noCorpo && !doIndex && TAGS_PROIBIDAS.has(tag)) problemas.push('<' + tag + '> no corpo: ' + el.outerHTML.slice(0, 120));
    for (const nome of nomesDe(el)) {
      const n = nome.toLowerCase(), v = String(el.getAttribute(nome) ?? '');
      if (n.startsWith('on')) problemas.push('atributo ' + nome + ' em <' + tag + '>: ' + v.slice(0, 80));
      if (noCorpo && !NOME_DE_ATRIBUTO.test(n)) problemas.push('atributo com nome estranho "' + nome + '" em <' + tag + '>');
      if (noCorpo && n.includes('xss')) problemas.push('atributo nascido de dado: ' + nome);
      if (ATRIBUTOS_DE_URL.has(n)) {
        const limpo = v.replace(/[\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
        if (ESQUEMA_PERIGOSO.test(limpo)) problemas.push(n + ' perigoso em <' + tag + '>: ' + v.slice(0, 80));
      }
      if (n === 'style' && /xss|expression|url\(|javascript/i.test(v)) problemas.push('style com dado em <' + tag + '>: ' + v.slice(0, 80));
    }
    if (noCorpo && tag === 'img' && !/^\.\/(assets\/|icone-)/.test(el.getAttribute('src') || '')) problemas.push('imagem fora dos arquivos do app: ' + el.outerHTML.slice(0, 120));
  }
  for (const args of p.aberturas) {
    const url = String(args[0] ?? '').replace(/[\u0000-\u0020]/g, '').toLowerCase();
    if (!/^https:\/\//.test(url)) problemas.push('window.open com endereço que não é https: ' + String(args[0]).slice(0, 80));
  }
  assert.deepEqual(problemas, [], 'XSS no passo "' + passo + '"');
  colher(p);
}

// O que apareceu na tela: texto, valor de campo, atributo e título.
function colher(p) {
  const d = p.document, partes = [d.body.textContent, d.title];
  for (const el of d.querySelectorAll('*')) {
    for (const nome of nomesDe(el)) partes.push(String(el.getAttribute(nome) ?? ''));
    if (typeof el.value === 'string') partes.push(el.value);
  }
  const tudo = partes.join('\n');
  for (const m of p.marcas.keys()) if (tudo.includes(m)) p.vistos.add(m);
}

/* ───────────── a bancada ───────────── */
// O que o index.html põe direto no body (tag:src), lido do próprio arquivo.
const DO_INDEX = (() => {
  const { document } = parseHTML(ler('index.html'));
  return new Set([...document.body.children].filter(x => ['script', 'noscript'].includes(x.tagName.toLowerCase())).map(x => x.tagName.toLowerCase() + ':' + (x.getAttribute('src') || '')));
})();
// Troca respostas do servidor falso por ação, sem mexer no helper da casa:
// trocas['urlArquivo'] = corpo => ({ status, corpo }) | null (null segue o falso).
function comTrocas(servidor, trocas) {
  const original = servidor.fetch;
  servidor.fetch = async (url, init) => {
    const corpo = JSON.parse(init && init.body ? init.body : '{}');
    const chave = String(url).endsWith('/equipe-auth') ? 'auth:' + corpo.acao : corpo.action;
    const r = trocas[chave] ? trocas[chave](corpo) : null;
    if (r) return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => JSON.parse(JSON.stringify(r.corpo)) };
    return original(url, init);
  };
  return servidor;
}
function abrir({ carga, marcas }, { cracha, servidor, hash = '#/', metodo = 'real', memoria }) {
  const p = montar({ cracha, servidor, metodo, hash, memoria });
  p.marcas = marcas;
  p.vistos = new Set();
  p.doIndex = DO_INDEX;
  return p;
}
const enc = encodeURIComponent;
const clicar = (p, el) => { el.click(); return assentar(); };
const fecharJanelas = async p => {
  for (const b of p.document.querySelectorAll('#overlays [data-fechar]')) b.click();
  for (const b of p.document.querySelectorAll('.vof-fechar')) b.click();
  await assentar();
};
function digitar(p, el, valor) { el.value = valor; p.evento(el, 'input'); p.evento(el, 'change'); }
// O select do linkedom não aceita .value: marca a opção, como a casca faz nos testes dela.
function escolher(p, sel, valor) {
  sel.querySelectorAll('option').forEach(o => { if (o.getAttribute('value') === valor) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
  p.evento(sel, 'change');
}
function faltando(p, naoExibidos) {
  return [...p.marcas.keys()].filter(m => !p.vistos.has(m) && !naoExibidos.has(p.marcas.get(m))).map(m => p.marcas.get(m));
}

/* ───────────── os dados envenenados ───────────── */
function dadosEnvenenados(carga) {
  const e1 = { id: carga('empresa.id'), nome: carga('empresa.nome'), segmento: carga('empresa.segmento'), cidade: carga('empresa.cidade'), contato: carga('empresa.contato'), obs: carga('empresa.obs') };
  const t1 = { id: carga('turma1.id'), nome: carga('turma1.nome'), nivel: carga('turma1.nivel'), status: 'em andamento', inicio: '2026-09-01', participantes: carga('turma1.participantes'), empresaId: e1.id, facilitador: carga('turma1.facilitador'), obs: carga('turma1.obs') };
  const t2 = { id: carga('turma2.id'), nome: carga('turma2.nome'), nivel: 2, status: carga('turma2.status'), inicio: carga('turma2.inicio'), participantes: 4, empresaId: carga('turma2.empresaId'), facilitador: carga('turma2.facilitador'), obs: carga('turma2.obs') };
  const t3 = { id: carga('turma3.id'), nome: carga('turma3.nome'), nivel: 1, status: 'planejada', inicio: '2026-10-01', participantes: '', empresaId: '', facilitador: '', obs: '' };
  const idCheck = carga('checklist.item.id');
  const idModulo = 'arquitetura';
  return {
    dados: {
      empresas: [e1],
      turmas: [t1, t2, t3],
      diagnosticos: [
        { id: carga('diag1.id'), alvoTipo: 'turma', alvoId: t1.id, momento: 'linha_de_base', data: '2026-09-02', avaliador: carga('diag1.avaliador'), obs: carga('diag1.obs'),
          notas: { v1: { nota: 2, evidencia: carga('diag1.v1.evidencia') }, o1: { nota: 'na', evidencia: carga('diag1.o1.evidencia') }, [carga('diag1.nota.chave')]: { nota: carga('diag1.nota.valor'), evidencia: carga('diag1.nota.evidencia') } } },
        { id: carga('diag2.id'), alvoTipo: 'turma', alvoId: t1.id, momento: carga('diag2.momento'), data: '2026-09-30', avaliador: carga('diag2.avaliador'), obs: carga('diag2.obs'), notas: { v1: carga('diag2.v1') } },
        { id: carga('diag3.id'), alvoTipo: 'empresa', alvoId: e1.id, momento: 'linha_de_base', data: carga('diag3.data'), avaliador: carga('diag3.avaliador'), obs: '', notas: {} },
        { id: carga('diag4.id'), alvoTipo: carga('diag4.alvoTipo'), alvoId: carga('diag4.alvoId'), momento: 'dia_30', data: '2026-09-10', avaliador: '', obs: '', notas: {} },
      ],
      planos: [
        { id: 'plano-' + t1.id, turmaId: t1.id, restricao: carga('plano1.restricao'), meta: carga('plano1.meta'), indicador: carga('plano1.indicador'), responsavel: carga('plano1.responsavel'), dia0: '2026-09-01',
          marcos: [
            { id: carga('marco1.id'), fase: 'Até dia 30', acao: carga('marco1.acao'), evidencia: carga('marco1.evidencia'), feito: false, data: carga('marco1.data') },
            { id: 'm-2', fase: carga('marco2.fase'), acao: carga('marco2.acao'), evidencia: '', feito: false, data: '' },
          ],
          checklist: { [idCheck]: { feito: true, data: carga('plano1.checklist.data'), evidencia: carga('plano1.checklist.evidencia') } } },
        { id: 'plano-' + t2.id, turmaId: t2.id, restricao: carga('plano2.restricao'), meta: '', indicador: '', responsavel: '', dia0: carga('plano2.dia0'), marcos: [], checklist: {} },
      ],
      salas: [{ id: 'ABC234', slide: carga('sala.slide'), modo: carga('sala.modo'), atualizadoPor: carga('sala.atualizadoPor'), atualizadoEm: carga('sala.atualizadoEm') }],
    },
    arquivados: { planos: [{ id: 'plano-' + t3.id, turmaId: t3.id, restricao: carga('plano3.restricao'), marcos: [], checklist: {} }] },
    conteudo: {
      dinamicas: {
        credito: carga('dinamicas.credito'),
        itens: [
          { id: 'din-1', nome: carga('din1.nome'), objetivo: carga('din1.objetivo'), como_conduzir: carga('din1.como_conduzir'), materiais: [carga('din1.materiais.0'), carga('din1.materiais.1')],
            tempo: '20 min', tamanho_do_grupo: carga('din1.tamanho_do_grupo'), pilar: carga('din1.pilar'), fonte: carga('din1.fonte'), [carga('din1.chave')]: carga('din1.valor_da_chave') },
          { id: 'din-2', titulo: carga('din2.titulo'), passos: [{ acao: carga('din2.passo.acao'), detalhe: carga('din2.passo.detalhe') }], pilares: [carga('din2.pilares.0'), 'venda'],
            fonte: [{ doc: carga('din2.fonte.doc'), paginas: carga('din2.fonte.paginas') }], tempo: carga('din2.tempo') },
          carga('din3.item.texto'),
        ],
      },
      insights: {
        credito: carga('insights.credito'),
        pontos_chave: [{ tese: carga('ponto.tese'), explicacao: carga('ponto.explicacao'), pilar: 'Finanças', modulo_vof: [idModulo, carga('ponto.modulo_vof')] }],
        pulos_do_gato: [{ titulo: carga('pulo.titulo'), como_aplicar: carga('pulo.como_aplicar') }],
        casos: [{ titulo: carga('caso.titulo'), licao: carga('caso.licao') }],
        temas: [{ titulo: carga('tema.titulo'), resumo: carga('tema.resumo') }],
        [carga('insights.secao.extra')]: [{ titulo: carga('secao.extra.titulo') }],
      },
      modulos: {
        credito: carga('modulos.credito'),
        modulos: [{ id: idModulo, acrescimos: { perguntas: [carga('modulo.acrescimo.pergunta')], dinamicas: ['din-1', 'codigo-que-nao-existe'] }, nota_de_integracao: carga('modulo.nota_de_integracao'), fonte: carga('modulo.fonte') }],
        novos_modulos: [{ id: 'novo:1', titulo: carga('novo.titulo'), tese: carga('novo.tese'), perguntas: [carga('novo.pergunta')] }],
      },
      checklist: {
        credito: carga('checklist.credito'),
        grupos: [{ titulo: carga('checklist.grupo.titulo'), itens: [{ id: idCheck, texto: carga('checklist.item.texto'), detalhe: carga('checklist.item.detalhe') }] }],
        itens: [{ texto: carga('checklist.item2.texto'), fase: carga('checklist.item2.fase') }, carga('checklist.item3.string')],
      },
    },
  };
}

// Campos que a tela NUNCA mostra (só servem de chave de busca ou são
// descartados pela validação). Se um dia um deles aparecer, o teste avisa; e
// todo campo fora desta lista tem de aparecer em algum passo.
const NAO_EXIBIDOS = new Set([
  'turma2.empresaId',        // só procura a empresa; sem achar, a tela diz "Empresa removida"
  'diag4.alvoTipo', 'diag4.alvoId', // idem: "Turma removida"
  'diag1.nota.chave', 'diag1.nota.valor', 'diag1.nota.evidencia', // nota de prática que não existe no método
  'diag2.v1',                // nota que não é 0 a 4 nem "na" vira sem nota
  'sala.slide', 'sala.modo', // a sala só aceita número inteiro e os dois modos
  'sala.atualizadoPor', 'sala.atualizadoEm', // rastro de quem mexeu: não aparece
  'plano3.restricao',        // plano arquivado não mostra o conteúdo
]);

/* ───────────── os testes ───────────── */
test('XSS: cada campo de cada coleção, do APN, do crachá e do hash passa por todas as áreas sem virar código', async () => {
  const f = fabrica();
  const { carga } = f;
  const base = dadosEnvenenados(carga);
  const trocas = {};
  const servidor = comTrocas(servidorFalso({ dados: base.dados, arquivados: base.arquivados, conteudo: base.conteudo, papel: 'admin',
    eu: { ok: true, usuario: 'zz_facilitadora', nome: carga('eu.nome'), papel: carga('eu.papel') } }), trocas);
  const p = abrir(f, { cracha: crachaFalso({ papel: 'admin', nome: carga('cracha.nome') }), servidor });
  const turmas = base.dados.turmas, diags = base.dados.diagnosticos;

  // O primeiro desenho sai do crachá, antes do servidor responder.
  conferir(p, 'primeiro desenho (nome do crachá)');
  await assentar();
  conferir(p, 'início com os dados');

  // Método: o conteúdo é do próprio metodo.js; a sala de apresentação abre por cima.
  await p.irPara('#/metodo');
  conferir(p, 'método');
  const apresentar = p.document.querySelector('[data-vof-apresentar]');
  if (apresentar) { await clicar(p, apresentar); conferir(p, 'método: sala de apresentação'); await fecharJanelas(p); }

  // Dinâmicas e APN: cada seção, cada pilar e a busca.
  await p.irPara('#/dinamicas');
  conferir(p, 'dinâmicas');
  for (const b of [...p.document.querySelectorAll('#apn-corpo [data-secao]')]) { await clicar(p, b); conferir(p, 'dinâmicas: seção ' + b.getAttribute('data-secao')); }
  for (const b of [...p.document.querySelectorAll('#apn-corpo [data-pilar]')]) { await clicar(p, b); conferir(p, 'dinâmicas: pilar'); }
  const busca = p.document.querySelector('[data-apn-busca]');
  digitar(p, busca, carga('busca.apn'));
  conferir(p, 'dinâmicas: busca digitada');
  await p.irPara('#/turmas'); // sai e volta: o conteúdo já em memória desenha sem esperar
  await p.irPara('#/dinamicas');
  conferir(p, 'dinâmicas: segunda visita (conteúdo em memória)');
  await p.irPara('#/dinamicas/arquitetura');
  conferir(p, 'dinâmicas: complemento do módulo');
  await p.irPara('#/dinamicas/' + enc(carga('hash.dinamicas.modulo')));
  conferir(p, 'dinâmicas: módulo vindo do hash');

  // Turmas e empresas: lista, filtros, e cada janela de editar e apagar.
  await p.irPara('#/turmas');
  conferir(p, 'turmas e empresas');
  for (const b of [...p.document.querySelectorAll('[data-filtro-status]')]) { await clicar(p, b); conferir(p, 'turmas: filtro'); }
  for (const sel of ['[data-editar-turma]', '[data-editar-empresa]', '[data-apagar-turma]', '[data-apagar-empresa]', '[data-nova-turma]', '[data-nova-empresa]']) {
    for (const b of [...p.document.querySelectorAll('#miolo ' + sel)]) {
      await clicar(p, b);
      conferir(p, 'turmas: janela ' + sel);
      await fecharJanelas(p);
    }
  }
  // O que se digita e se grava volta para a tela de outra pessoa do mesmo jeito.
  await clicar(p, [...p.document.querySelectorAll('[data-editar-turma]')].find(b => b.getAttribute('data-editar-turma') === turmas[2].id));
  let form = p.document.querySelector('#overlays [data-form]');
  form.querySelector('[name=facilitador]').value = carga('form.turma.facilitador');
  form.querySelector('[name=obs]').value = carga('form.turma.obs');
  p.evento(form, 'submit');
  await assentar();
  conferir(p, 'turmas: turma gravada pelo formulário');
  await clicar(p, [...p.document.querySelectorAll('[data-editar-turma]')].find(b => b.getAttribute('data-editar-turma') === turmas[2].id));
  conferir(p, 'turmas: turma gravada, aberta de novo');
  await fecharJanelas(p);
  await clicar(p, p.document.querySelector('[data-nova-empresa]'));
  form = p.document.querySelector('#overlays [data-form]');
  form.querySelector('[name=nome]').value = carga('form.empresa.nome');
  form.querySelector('[name=cidade]').value = carga('form.empresa.cidade');
  p.evento(form, 'submit');
  await assentar();
  conferir(p, 'turmas: empresa gravada pelo formulário');

  // Diagnóstico: lista, comparação por alvo, cada editor, o novo e o apagar.
  await p.irPara('#/diagnostico');
  conferir(p, 'diagnóstico');
  const alvos = [...p.document.querySelectorAll('[data-diag-alvo-sel] option')].map(o => o.getAttribute('value')).filter(Boolean);
  for (const v of alvos) {
    escolher(p, p.document.querySelector('[data-diag-alvo-sel]'), v);
    conferir(p, 'diagnóstico: comparação de ' + v.slice(0, 20));
  }
  for (const d of diags) {
    await p.irPara('#/diagnostico/' + enc(d.id));
    conferir(p, 'diagnóstico: editor');
    const ap = p.document.querySelector('[data-apagar-diag]');
    if (ap) { await clicar(p, ap); conferir(p, 'diagnóstico: janela de apagar'); await fecharJanelas(p); }
  }
  await p.irPara('#/diagnostico/novo');
  escolher(p, p.document.querySelector('[data-campo="alvo"]'), 'turma:' + turmas[0].id);
  digitar(p, p.document.querySelector('[data-evidencia="v2"]'), carga('novo.diag.evidencia'));
  digitar(p, p.document.querySelector('[data-campo="avaliador"]'), carga('novo.diag.avaliador'));
  conferir(p, 'diagnóstico: novo, digitado');
  p.evento(p.document.querySelector('[data-diag-form]'), 'submit');
  await assentar();
  conferir(p, 'diagnóstico: novo, gravado');
  await p.irPara('#/diagnostico/' + enc(carga('hash.diagnostico.id')));
  conferir(p, 'diagnóstico: código vindo do hash');

  // Plano de 90 dias: lista, cada editor (marcos e checklist), o arquivado.
  await p.irPara('#/plano');
  conferir(p, 'plano');
  for (const t of turmas) {
    await p.irPara('#/plano/' + enc(t.id));
    conferir(p, 'plano: editor');
    const novo = p.document.querySelector('[data-novo-marco]');
    if (novo) { await clicar(p, novo); conferir(p, 'plano: ação nova'); }
    const acao = [...p.document.querySelectorAll('[data-m="acao"]')].pop();
    if (acao && !acao.disabled) { digitar(p, acao, carga('plano.digitado.' + turmas.indexOf(t))); conferir(p, 'plano: ação digitada'); }
  }
  await p.irPara('#/plano/' + enc(carga('hash.plano.turmaId')));
  conferir(p, 'plano: turma vinda do hash');

  // Apostila: o link vem do servidor. javascript: é recusado; aspas não rompem o atributo.
  await p.irPara('#/apostila');
  // Espaço na frente e letras trocadas: o navegador ignora os dois e executaria.
  trocas.urlArquivo = () => ({ status: 200, corpo: { url: ' JaVaScRiPt:alert(1)//' + carga('apostila.url.javascript'), expira: carga('apostila.expira') } });
  await clicar(p, p.document.querySelector('[data-apostila]'));
  conferir(p, 'apostila: servidor mandou javascript:');
  trocas.urlArquivo = () => ({ status: 200, corpo: { url: 'https://cofre.test/a.pdf?x=' + carga('apostila.url.https'), expira: '' } });
  await clicar(p, p.document.querySelector('[data-apostila]'));
  conferir(p, 'apostila: link https com aspas e tags');
  const link = p.document.querySelector('#apostila-status a');
  assert.ok(link && link.getAttribute('href').startsWith('https://cofre.test/'), 'o link https continua inteiro, só escapado');
  trocas.urlArquivo = () => ({ status: 500, corpo: { erro: carga('apostila.erro') } });
  await clicar(p, p.document.querySelector('[data-apostila]'));
  conferir(p, 'apostila: erro do servidor');

  // Apresentação, palco e controle, com a sala envenenada e códigos vindos do hash.
  await p.irPara('#/apresentacao');
  conferir(p, 'apresentação');
  const cod = p.document.querySelector('[data-ap-codigo]');
  cod.value = carga('controle.codigo.digitado');
  p.evento(p.document.querySelector('[data-ap-controle]'), 'submit');
  await assentar();
  conferir(p, 'apresentação: código digitado');
  await p.irPara('#/apresentacao');
  await clicar(p, p.document.querySelector('[data-ap-metodo]'));
  conferir(p, 'apresentação: versão com prática');
  await fecharJanelas(p);
  await p.irPara('#/palco/ABC234');
  conferir(p, 'palco com sala');
  await p.irPara('#/palco/' + enc(carga('hash.palco.codigo')));
  conferir(p, 'palco: código vindo do hash');
  await p.irPara('#/controle/ABC234');
  conferir(p, 'controle');
  await p.irPara('#/controle/' + enc(carga('hash.controle.codigo')));
  conferir(p, 'controle: código vindo do hash');

  // Rota vinda do hash: nome malicioso e nomes que existem em todo objeto.
  for (const h of [carga('hash.rota'), '__proto__', 'constructor', 'toString', 'hasOwnProperty', '__defineGetter__']) {
    await p.irPara('#/' + enc(h));
    conferir(p, 'rota do hash: ' + h.slice(0, 20));
    assert.ok(p.document.querySelector('.proposito'), 'rota desconhecida cai no início: ' + h.slice(0, 20));
  }

  // Além dos campos que a tela nunca mostra: o link javascript: que o store
  // recusa, e os códigos de sala e rotas do hash, que só servem de busca ou
  // são reduzidos a letras e números.
  const nunca = new Set([...NAO_EXIBIDOS, 'apostila.url.javascript', 'apostila.expira', 'controle.codigo.digitado',
    'hash.palco.codigo', 'hash.controle.codigo', 'hash.rota', 'hash.diagnostico.id', 'hash.plano.turmaId']);
  assert.deepEqual(faltando(p, nunca), [], 'cargas que o teste não viu na tela (o teste não chegou lá?)');
  assert.deepEqual([...nunca].filter(c => p.vistos.has(marcaDe(c))), [], 'campo dado como "nunca na tela" apareceu: tire da lista e confira o escape dele');
});

test('XSS: papel e nome do crachá, recado do servidor no login e erro de sincronização', async () => {
  const f = fabrica();
  const { carga } = f;
  const base = dadosEnvenenados(carga);

  // Crachá com papel desconhecido: a tela é só de leitura e mostra o papel como texto.
  const s1 = servidorFalso({ dados: base.dados, conteudo: base.conteudo, papel: 'facilitador' });
  const p1 = abrir(f, { cracha: crachaFalso({ nome: carga('cracha2.nome'), papel: carga('cracha2.papel') }), servidor: s1 });
  conferir(p1, 'papel desconhecido: primeiro desenho');
  await assentar();
  for (const h of ['#/', '#/turmas', '#/diagnostico/' + enc(base.dados.diagnosticos[0].id), '#/plano/' + enc(base.dados.turmas[0].id), '#/apresentacao']) {
    await p1.irPara(h);
    conferir(p1, 'papel desconhecido: ' + h.slice(0, 30));
  }

  // Login: usuário digitado e recado de erro do servidor de autenticação.
  const trocas = { 'auth:login': () => ({ status: 401, corpo: { erro: carga('login.erro') } }) };
  const p2 = abrir(f, { cracha: null, servidor: comTrocas(servidorFalso({}), trocas) });
  conferir(p2, 'login');
  const u = p2.document.querySelector('#lg-u');
  u.value = carga('login.usuario'); p2.evento(u, 'input');
  p2.document.querySelector('#lg-s').value = 'senha-de-teste';
  p2.evento(p2.document.querySelector('#form-login'), 'submit');
  await assentar();
  conferir(p2, 'login: erro do servidor');
  p2.run('renderApp()');
  conferir(p2, 'login: redesenho com o usuário digitado');

  // 401 com motivo: o recado vai para a tela de login.
  const p3 = abrir(f, { cracha: crachaFalso(), servidor: servidorFalso({ dados: {}, falhas: { rev: { status: 401, corpo: { erro: carga('sessao.motivo') } } } }) });
  await assentar();
  conferir(p3, 'login: motivo da queda de sessão');

  // Erro de sincronização e de gravação: a mensagem do servidor é texto.
  const s4 = servidorFalso({ dados: {}, falhas: { list: { status: 500, corpo: { erro: carga('sync.erro') } }, upsert: { status: 409, corpo: { erro: carga('upsert.conflito') } } } });
  const p4 = abrir(f, { cracha: crachaFalso({ papel: 'admin' }), servidor: s4 });
  await assentar();
  conferir(p4, 'erro de sincronização');
  await p4.irPara('#/turmas');
  conferir(p4, 'erro de sincronização: lista vazia honesta');
  await clicar(p4, p4.document.querySelector('[data-nova-turma]'));
  const form = p4.document.querySelector('#overlays [data-form]');
  form.querySelector('[name=nome]').value = 'Turma Fictícia';
  p4.evento(form, 'submit');
  await assentar();
  conferir(p4, 'conflito na gravação');
  await p4.irPara('#/dinamicas');
  conferir(p4, 'erro ao trazer o APN');

  const vistos = new Set([...p1.vistos, ...p2.vistos, ...p3.vistos, ...p4.vistos]);
  for (const campo of ['cracha2.nome', 'cracha2.papel', 'login.erro', 'login.usuario', 'sessao.motivo', 'sync.erro', 'upsert.conflito']) {
    assert.ok(vistos.has(marcaDe(campo)), 'a carga de ' + campo + ' apareceu na tela');
  }
});

test('rota com nome de propriedade de objeto (__proto__, constructor) cai no início em vez de quebrar', async () => {
  const p = montar({ cracha: crachaFalso(), servidor: servidorFalso({}), hash: '#/' });
  await assentar();
  for (const h of ['__proto__', 'constructor', 'toString', 'valueOf', '__defineGetter__']) {
    await p.irPara('#/turmas');
    await p.irPara('#/' + h);
    assert.ok(p.document.querySelector('.proposito'), h + ' desenha o início');
    assert.equal(p.document.title, 'Início · Método V.O.F.', h + ' não põe código de função no título');
  }
});

// O que mora SÓ no localStorage: a jornada (a cópia da Central e a própria),
// a cópia local dos dados e os rascunhos. Os outros sistemas do endereço
// escrevem no mesmo localStorage, então aqui o dado não passa pelo servidor:
// chega com qualquer tipo (lista onde se espera texto, texto onde se espera número).
const CHAVE_CACHE = 'vof_cache_v1_zz_facilitadora';
const chaveRascunho = nome => 'vof_rascunho_v1_zz_facilitadora_' + encodeURIComponent(nome);
test('XSS: jornada, cópia local e rascunhos plantados no localStorage por outro sistema da mesma origem não viram código', async () => {
  const f = fabrica();
  const { carga } = f;
  const memoria = new Map();
  memoria.set('cl_vof_jornada_v1', JSON.stringify({ xp: carga('ls.jornada.xp'), respostas: {
    arquitetura: { opcao: carga('ls.jornada.opcao'), texto: carga('ls.jornada.texto'), concluida: true, data: carga('ls.jornada.data') } } }));
  const turma = { id: 't-ls', nome: [carga('ls.turma.nome')], nivel: carga('ls.turma.nivel'), status: 'em andamento', inicio: '2026-09-01', participantes: '', empresaId: 'e-ls', facilitador: [carga('ls.turma.facilitador')], obs: '', _rev: carga('ls.turma._rev') };
  const empresa = { id: 'e-ls', nome: [carga('ls.empresa.nome')], segmento: [carga('ls.empresa.segmento')], cidade: '', contato: '', obs: '' };
  const diag = { id: 'd-ls', alvoTipo: 'turma', alvoId: 't-ls', momento: carga('ls.diag.momento'), data: '2026-09-02', avaliador: [carga('ls.diag.avaliador')], obs: [carga('ls.diag.obs')],
    notas: { v1: { nota: carga('ls.diag.nota'), evidencia: [carga('ls.diag.evidencia')] } } };
  const plano = { id: 'plano-t-ls', turmaId: 't-ls', restricao: [carga('ls.plano.restricao')], meta: '', indicador: '', responsavel: '', dia0: '2026-09-01',
    marcos: [{ id: carga('ls.marco.id'), fase: 'Até dia 30', acao: [carga('ls.marco.acao')], evidencia: '', feito: carga('ls.marco.feito'), data: '' }], checklist: {} };
  memoria.set(CHAVE_CACHE, JSON.stringify({ dados: { turmas: [turma], empresas: [empresa], diagnosticos: [diag], planos: [plano] }, arquivados: {}, rev: {}, buscadoEm: {}, em: '2026-09-25T12:00:00.000Z' }));
  memoria.set(chaveRascunho('diag_novo'), JSON.stringify({ id: 'd-novo', alvoTipo: 'turma', alvoId: 't-ls', momento: 'dia_30', data: '2026-09-20', avaliador: [carga('ls.rascunho.avaliador')], obs: carga('ls.rascunho.obs'),
    notas: { o1: { nota: 'na', evidencia: carga('ls.rascunho.evidencia') } }, _alteradoEm: '2026-09-25T10:00:00.000Z' }));
  memoria.set(chaveRascunho('plano_t-ls'), JSON.stringify(Object.assign({}, plano, { meta: [carga('ls.rascunho.plano.meta')], _alteradoEm: '2026-09-25T10:00:00.000Z' })));
  // Servidor fora do ar: a tela vive só do que está no aparelho.
  const servidor = servidorFalso({ falhas: { rev: 'rede', list: 'rede', get: 'rede' } });
  const p = abrir(f, { cracha: crachaFalso({ papel: 'admin' }), servidor, memoria });
  await assentar();
  conferir(p, 'início com a cópia local');
  await p.irPara('#/metodo');
  conferir(p, 'método com a jornada trazida da Central');
  p.sandbox.VOFMetodo.abrirApresentacao(2, 'aplicar'); // a missão do módulo Arquitetura
  conferir(p, 'sala no modo Aplicar com a resposta guardada');
  await fecharJanelas(p);
  for (const h of ['#/turmas', '#/diagnostico', '#/diagnostico/d-ls', '#/diagnostico/novo', '#/plano', '#/plano/t-ls']) {
    await p.irPara(h);
    conferir(p, 'cópia local: ' + h);
  }
  // xp que não é número vira 0; opcao só é comparada; data, _rev e "feito"
  // não aparecem; nota fora da régua vira sem nota.
  const nunca = new Set(['ls.jornada.xp', 'ls.jornada.opcao', 'ls.jornada.data', 'ls.turma._rev', 'ls.diag.nota', 'ls.marco.feito']);
  assert.deepEqual(faltando(p, nunca), [], 'cargas que o teste não viu na tela (o teste não chegou lá?)');
  assert.deepEqual([...nunca].filter(c => p.vistos.has(marcaDe(c))), [], 'campo dado como "nunca na tela" apareceu: tire da lista e confira o escape dele');
});

// Defeito (não é XSS, é disponibilidade): a jornada vinha do localStorage sem
// conferir o tipo. xp {"toString":1} fazia Number() lançar e a aba Método
// inteira virava "Não consegui desenhar o método"; texto que não é texto
// lançava ao abrir a sala no modo Aplicar e deixava a página de trás inerte.
test('jornada com tipo inesperado no localStorage (a própria ou a da Central) não derruba o Método nem a sala', async () => {
  // [chave, JSON como está no localStorage, XP esperado na tela, texto esperado no campo da missão Arquitetura]
  const casos = [
    ['vof_jornada_v1', '{"xp":{"toString":1},"respostas":{}}', '0 XP', ''],
    ['cl_vof_jornada_v1', '{"xp":{"valueOf":0,"toString":0},"respostas":{"arquitetura":{"concluida":true}}}', '0 XP', ''],
    ['vof_jornada_v1', '{"xp":30,"respostas":{"arquitetura":{"texto":{"toString":1},"concluida":1}}}', '30 XP', ''],
    // opcao que não é texto contava como "escolhida": o botão de concluir ligava sem nenhuma opção marcada.
    ['vof_jornada_v1', '{"xp":30,"respostas":{"arquitetura":{"texto":"Evidência fictícia com mais de doze letras","opcao":["evidencia"]}}}', '30 XP', 'Evidência fictícia com mais de doze letras'],
    // 1e400 chega do JSON.parse como Infinity; "__proto__" como chave não pode trocar o protótipo das respostas.
    ['vof_jornada_v1', '{"xp":1e400,"respostas":{"__proto__":{"arquitetura":{"texto":{"toString":1}}}}}', '0 XP', ''],
  ];
  for (const [chave, json, xp, texto] of casos) {
    const memoria = new Map([[chave, json]]);
    const p = montar({ cracha: crachaFalso(), servidor: servidorFalso({}), metodo: 'real', memoria, hash: '#/metodo' });
    await assentar();
    const rotulo = chave + ' ' + json.slice(0, 70);
    assert.doesNotMatch(p.texto(), /Não consegui desenhar o método/, rotulo);
    assert.equal(p.document.querySelector('[data-vof-journey-xp]').textContent, xp, rotulo);
    await p.irPara('#/apresentacao');
    await clicar(p, p.document.querySelector('[data-ap-metodo]'));
    assert.equal(p.document.querySelector('#toasts').textContent, '', rotulo + ': a versão com prática abre sem erro');
    const ap = p.sandbox.VOFMetodo.apresentacaoAtual();
    assert.ok(ap, rotulo + ': a sala abriu');
    ap.irPara(2); ap.definirModo('aplicar'); // a missão do módulo Arquitetura
    const area = p.document.querySelector('[data-vof-desafio] textarea');
    assert.ok(area, rotulo + ': a missão aparece');
    assert.equal(area.value, texto, rotulo + ': só texto entra no campo');
    assert.equal(p.document.querySelector('[data-vof-salvar]').disabled, true, rotulo + ': sem opção marcada, concluir fica desligado');
    ap.fechar();
    assert.equal([...p.document.body.children].filter(x => x.hasAttribute('inert')).length, 0, rotulo + ': fechar devolve a página');
  }
});

test('APN: chave de seção com aspas não derruba a área nem o filtro', async () => {
  const conteudo = { insights: { pontos_chave: [{ tese: 'Tese fictícia', pilar: 'venda' }], 'lista "especial"]': [{ titulo: 'Item fictício da seção extra' }] } };
  const p = montar({ cracha: crachaFalso(), servidor: servidorFalso({ conteudo }), hash: '#/dinamicas' });
  await assentar();
  assert.doesNotMatch(p.texto(), /Não consegui trazer o conteúdo/);
  const botao = [...p.document.querySelectorAll('[data-secao]')].find(b => b.getAttribute('data-secao') === 'x-lista "especial"]');
  assert.ok(botao, 'a seção extra aparece');
  await clicar(p, botao);
  assert.match(p.texto(), /Item fictício da seção extra/);
  // Segunda visita desenha na hora, com o conteúdo em memória: também não pode quebrar.
  await p.irPara('#/turmas');
  await p.irPara('#/dinamicas');
  const busca = p.document.querySelector('[data-apn-busca]');
  busca.value = 'fictício'; p.evento(busca, 'input');
  const conta = [...p.document.querySelectorAll('[data-conta]')].find(x => x.getAttribute('data-conta') === 'x-lista "especial"]');
  assert.equal(conta.textContent, '1', 'a contagem da seção extra acompanha a busca');
});

test('esc escapa & < > " e \' nos dois arquivos (app.js e metodo.js)', async () => {
  const esperado = '&amp;&lt;&gt;&quot;&#39;';
  const p = montar({ cracha: crachaFalso(), servidor: servidorFalso({}), hash: '#/' });
  await assentar();
  assert.equal(p.run('esc(`&<>"\'`)'), esperado, 'esc do app.js');
  assert.equal(p.run('esc(null) + esc(undefined) + esc(0)'), '0');
  // O esc do metodo.js mora dentro da função do módulo: roda as duas linhas dele à parte.
  const fonte = ler('metodo.js');
  const linhas = ['const ESCAPES = ', 'const esc = '].map(ini => fonte.split('\n').find(l => l.trim().startsWith(ini)));
  assert.ok(linhas.every(Boolean), 'metodo.js ainda define ESCAPES e esc');
  const ctx = vm.createContext({});
  vm.runInContext(linhas.join('\n') + '\n;globalThis.__esc = esc;', ctx);
  assert.equal(ctx.__esc('&<>"\''), esperado, 'esc do metodo.js');
});

// Defeito (não é XSS, é disponibilidade): a porta aceita qualquer tipo em
// turma.nome, marco.acao, diagnóstico.avaliador, empresa.cidade e afins. Um
// crachá de facilitador que gravasse {"toString":1} direto na porta fazia
// String() lançar TypeError em esc, norm e ordenarPorNome: Início, Turmas,
// Diagnóstico, Plano e Dinâmicas deixavam de desenhar para todo mundo, admin
// incluído, e o admin nem chegava ao botão de apagar. O store.js tira as
// chaves toString e valueOf de tudo o que chega do servidor e do aparelho.
test('texto com chave "toString" gravado direto na porta não derruba as telas de ninguém', async () => {
  const quebra = () => ({ toString: 1, valueOf: 1 }); // String() e Number() lançam TypeError com isto
  const dados = {
    turmas: [
      { id: 't-quebra', nome: quebra(), status: 'em andamento', nivel: 1, inicio: '2026-09-01', empresaId: 'e-quebra', facilitador: quebra(), obs: quebra(), atualizadoEm: quebra() },
      { id: 't-boa', nome: 'Turma Fictícia Boa', status: 'planejada', nivel: 1, inicio: '2026-10-01' },
    ],
    empresas: [{ id: 'e-quebra', nome: 'Empresa Fictícia', segmento: [quebra()], cidade: quebra(), contato: { nome: quebra() } }],
    diagnosticos: [{ id: 'd-quebra', alvoTipo: 'turma', alvoId: 't-quebra', momento: 'linha_de_base', data: '2026-09-02', avaliador: quebra(), obs: quebra(), atualizadoEm: quebra(), notas: {} }],
    planos: [{ id: 'plano-t-quebra', turmaId: 't-quebra', restricao: quebra(), meta: quebra(), indicador: quebra(), responsavel: quebra(), dia0: '2026-09-01',
      marcos: [{ id: 'm-quebra', fase: 'Dia 0', acao: quebra(), evidencia: quebra(), feito: false, data: '' }], checklist: { 'chk-1': { feito: true, evidencia: quebra(), data: quebra() } } }],
  };
  const conteudo = {
    dinamicas: { credito: quebra(), itens: [{ id: 'din-1', titulo: 'Dinâmica fictícia', pilar: quebra(), objetivo: quebra(), fonte: [{ doc: 'apn_estudo', paginas: quebra() }] }] },
    checklist: { itens: [{ id: 'chk-1', texto: 'Item fictício do checklist', detalhe: quebra() }] },
  };
  // O mesmo formato deixado no aparelho: rascunho que um link #/diagnostico/<código> abre.
  const memoria = new Map([['vof_rascunho_v1_zz_facilitadora_' + enc('diag_d-rascunho'), JSON.stringify({ id: 'd-rascunho', _alteradoEm: '2026-09-25T10:00:00.000Z',
    alvoTipo: 'turma', alvoId: 't-boa', momento: 'dia_30', data: '2026-09-20', avaliador: quebra(), obs: quebra(), notas: { v1: { nota: 2, evidencia: quebra() } } })]]);
  const p = montar({ cracha: crachaFalso({ papel: 'admin' }), servidor: servidorFalso({ dados, conteudo, papel: 'admin' }), hash: '#/', memoria });
  const erros = [];
  p.sandbox.console = Object.assign({}, console, { error: (...a) => erros.push(a.map(String).join(' ')) });
  await assentar();
  const telas = [
    ['#/', '.proposito'], ['#/turmas', '#lista-turmas .linha'], ['#/diagnostico', '#diag-painel'], ['#/diagnostico/d-quebra', '[data-diag-form]'],
    ['#/diagnostico/d-rascunho', '[data-diag-form]'], ['#/plano', '#miolo .linha-link'], ['#/plano/t-quebra', '#plano-marcos .marco'], ['#/dinamicas', '.apn-item'],
  ];
  for (const [h, seletor] of telas) {
    await p.irPara(h);
    assert.ok(p.document.querySelector(seletor), h + ' desenhou a tela');
  }
  // Os filtros e as janelas também leem esses campos.
  await p.irPara('#/diagnostico');
  escolher(p, p.document.querySelector('[data-diag-alvo-sel]'), 'turma:t-quebra');
  assert.ok(p.document.querySelector('#diag-painel .lista'), 'a comparação da turma desenhou');
  await p.irPara('#/turmas');
  await clicar(p, p.document.querySelector('[data-editar-turma="t-quebra"]'));
  assert.ok(p.document.querySelector('#overlays [data-form]'), 'a janela de editar a turma abriu');
  assert.deepEqual(erros, [], 'nenhum erro de desenho');
});
