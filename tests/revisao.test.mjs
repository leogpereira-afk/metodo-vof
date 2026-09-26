// Revisão de ponta a ponta (26/09): defeitos que só apareceram com o app
// aberto no navegador, com os dados chegando depois do primeiro desenho e com
// o conteúdo do APN na forma real (acréscimos por módulo, códigos citados).
// Rodar: node --test tests/
//
// Nomes, turmas, empresas e textos daqui são inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montar, crachaFalso, servidorFalso, assentar } from './helpers/casca.mjs';

const DADOS = () => ({
  turmas: [{ id: 't-leste', nome: 'Turma Fictícia Leste', nivel: 1, status: 'em andamento', inicio: '2026-09-01', participantes: 9, empresaId: '', facilitador: '', obs: '' }],
  empresas: [],
  planos: [{ id: 'plano-t-leste', turmaId: 't-leste', restricao: 'Fila sem dono', meta: '', indicador: '', responsavel: '', dia0: '2026-09-01', marcos: [], checklist: {} }],
  diagnosticos: [{ id: 'd-leste', alvoTipo: 'turma', alvoId: 't-leste', momento: 'linha_de_base', data: '2026-09-02', avaliador: 'Avaliadora Fictícia', notas: { v1: { nota: 2, evidencia: 'Registro fictício' } }, obs: '' }],
});

// Forma real do conteúdo: acréscimos por módulo citando dinâmicas e pontos-chave
// pelo código, fonte como [{doc, paginas}], temas dentro do checklist e módulos novos.
const CONTEUDO = {
  dinamicas: { credito: 'Crédito fictício', dinamicas: [{ id: 'roda-ficticia', titulo: 'Roda fictícia', pilar: 'venda', tempo: 'Não informado na fonte.', objetivo: 'Objetivo inventado.' }] },
  insights: {
    credito: 'crédito fictício',
    insights: [{ id: 'in-ficticio', tese: 'Ponto fictício', explicacao: 'Explicação inventada.', pilar: 'estrategia', modulo_vof: ['arquitetura'], fonte: [{ doc: 'apn_estudo', paginas: '3' }] }],
    pulos_do_gato: [], casos: [],
  },
  modulos: {
    modulos: [{
      id: 'arquitetura',
      acrescimos: { perguntas: ['Pergunta inventada?'], praticas: ['Prática inventada.'], dinamicas: ['roda-ficticia', 'dinamica-que-nao-existe'], insights: ['in-ficticio'] },
      nota_de_integracao: 'Nota de integração inventada.',
      fonte: [{ doc: 'apn_integral', paginas: '1-2' }, { doc: 'vof_caderno', paginas: '3' }],
      fonte_dos_itens: { perguntas: [[{ doc: 'apn_integral', paginas: '99' }]] },
    }],
    novos_modulos: [{ id: 'novo:ficticio', titulo: 'Módulo novo fictício', tese: 'Tese inventada.', perguntas: ['Outra pergunta?'] }],
  },
  checklist: { fases: [{ fase: 'Dia 0', itens: [{ acao: 'Ação fictícia do dia 0', evidencia: 'Evidência fictícia' }] }], temas: [{ tema: 'Tema fictício', sintese: 'Síntese inventada.', pilar: 'dono' }] },
};

async function abrir({ hash = '#/', memoria, conteudo } = {}) {
  const servidor = servidorFalso({ dados: DADOS(), conteudo });
  const p = montar({ cracha: crachaFalso(), servidor, hash, memoria });
  await assentar();
  return p;
}

test('link direto para um diagnóstico, sem cópia no aparelho: abre o registro quando os dados chegam', async () => {
  const p = await abrir({ hash: '#/diagnostico/d-leste' });
  assert.doesNotMatch(p.texto(), /Buscando os dados/);
  assert.ok(p.document.querySelector('[data-diag-form]'), 'o editor aparece');
  assert.equal(p.document.querySelector('[data-evidencia="v1"]').value, 'Registro fictício');
});

test('link direto para o plano de uma turma, sem cópia no aparelho: abre o plano quando os dados chegam', async () => {
  const p = await abrir({ hash: '#/plano/t-leste' });
  assert.doesNotMatch(p.texto(), /Buscando os dados/);
  assert.equal(p.document.querySelector('[data-p="restricao"]').value, 'Fila sem dono');
});

test('editor aberto não é redesenhado por atualização vinda do servidor', async () => {
  const p = await abrir({ hash: '#/plano/t-leste' });
  const campo = p.document.querySelector('[data-p="meta"]');
  p.run('STORE.atualizar()');
  await assentar();
  assert.equal(p.document.querySelector('[data-p="meta"]'), campo, 'o mesmo campo continua na tela');
});

test('Dinâmicas: atualização de turmas e diagnósticos não fecha o item aberto para leitura', async () => {
  const p = await abrir({ hash: '#/dinamicas', conteudo: CONTEUDO });
  const item = p.document.querySelector('[data-secao-corpo="dinamicas"] .apn-item');
  item.setAttribute('open', '');
  p.run('STORE.atualizar()');
  await assentar();
  const depois = p.document.querySelector('[data-secao-corpo="dinamicas"] .apn-item');
  assert.equal(depois, item, 'o mesmo elemento: a tela não foi redesenhada');
  assert.ok(depois.hasAttribute('open'));
});

test('Versão com prática: a sala recebe abrirComplemento e abrirApostila mesmo sem visitar a aba Método', async () => {
  const p = await abrir({ hash: '#/apresentacao' });
  p.run('window.VOFMetodo = Object.assign({}, window.VOFMetodo, { abrirApresentacao: function (i, m, extra) { window.__extra = extra; } })');
  p.document.querySelector('[data-ap-metodo]').click();
  await assentar();
  const tipos = p.run('[typeof (window.__extra || {}).abrirComplemento, typeof (window.__extra || {}).abrirApostila]');
  assert.deepEqual([...tipos], ['function', 'function']);
  p.run('window.__extra.abrirApostila({ origem: "teste" })');
  await assentar();
  assert.equal(p.sandbox.location.hash, '#/apostila');
});

test('palco recarregado volta ao slide em que estava', async () => {
  const memoria = new Map([['vof_apres_indice', '2']]);
  const p = await abrir({ hash: '#/palco', memoria });
  assert.match(p.document.querySelector('#palco-cont').textContent, /^3 \//);
});

test('complemento do módulo na forma real: acréscimos por campo, códigos viram títulos, fonte legível', async () => {
  const p = await abrir({ hash: '#/dinamicas/arquitetura', conteudo: CONTEUDO });
  const c = p.document.querySelector('.apn-complemento');
  assert.ok(c, 'o complemento aparece aberto');
  const t = c.textContent;
  assert.match(t, /Pergunta inventada\?/);
  assert.match(t, /Roda fictícia/, 'dinâmica citada pelo código aparece pelo título');
  assert.match(t, /Ponto fictício/, 'ponto-chave citado pelo código aparece pelo título');
  assert.doesNotMatch(t, /dinamica-que-nao-existe|roda-ficticia|in-ficticio/, 'código cru não aparece');
  assert.match(t, /1 item citado ainda não foi carregado/);
  assert.match(t, /APN 109, íntegra p\. 1-2; Caderno V\.O\.F\. p\. 3/);
  assert.doesNotMatch(t, /p\. 99/, 'rastreio item a item não vai para a tela');
  assert.doesNotMatch(t, /\[object Object\]|undefined/);
});

test('Dinâmicas e APN: temas do checklist, módulos novos, pilar com acento e crédito sem repetição', async () => {
  const p = await abrir({ hash: '#/dinamicas', conteudo: CONTEUDO });
  const secoes = [...p.document.querySelectorAll('[data-secao]')].map(b => b.getAttribute('data-secao'));
  assert.ok(secoes.includes('temas'), 'temas que moram no checklist aparecem');
  assert.ok(secoes.includes('novos'), 'módulos novos aparecem');
  assert.match(p.document.querySelector('[data-secao-corpo="novos"]').textContent, /Módulo novo fictício/);
  const chips = [...p.document.querySelectorAll('[data-pilar]')].map(b => b.textContent);
  assert.ok(chips.includes('Estratégia') && chips.includes('Dono'), 'pilar com nome de gente: ' + chips.join(', '));
  const item = p.document.querySelector('[data-secao-corpo="dinamicas"] .apn-item');
  assert.doesNotMatch(item.querySelector('summary').textContent, /informado/, '"não informado" não ocupa o lugar do tempo');
  assert.equal((p.texto().match(/crédito fictício/gi) || []).length, 1);
});
