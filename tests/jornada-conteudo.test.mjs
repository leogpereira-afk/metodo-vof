import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const raiz = new URL('../', import.meta.url);
const fonte = readFileSync(new URL('jornada-conteudo.js', raiz), 'utf8');
const contexto = vm.createContext({ console });
contexto.window = contexto;
vm.runInContext(readFileSync(new URL('metodo.js', raiz), 'utf8'), contexto);
vm.runInContext(fonte, contexto);
const modulos = contexto.VOFMetodo.MODULOS;
const { versao, porId, conquistas } = contexto.VOFExercicios;

test('exercícios cobrem exatamente os 18 módulos reais, preservando seus IDs', () => {
  assert.equal(versao, 1);
  assert.deepEqual(Object.keys(porId).sort(), [...modulos.map(m => m.id)].sort());
  assert.equal(modulos.length, 18);
  for (const modulo of modulos) {
    assert.match(modulo.fonte, /Caderno completo/);
    assert.ok(Object.isFrozen(porId[modulo.id]));
    assert.ok(Object.isFrozen(porId[modulo.id].opcoes));
  }
});

test('cada missão oferece escolhas específicas, um acerto e feedback explicativo em todas as alternativas', () => {
  const cenarios = new Set(), perguntas = new Set(), escritas = new Set(), tipos = new Set(), corretas = new Set();
  for (const [id, exercicio] of Object.entries(porId)) {
    for (const campo of ['tipo', 'label', 'cenario', 'pergunta', 'escrita', 'aplicacao', 'revisao', 'incentivo']) {
      assert.equal(typeof exercicio[campo], 'string', `${id}.${campo}`);
      assert.ok(exercicio[campo].trim().length > (campo === 'tipo' ? 5 : 8), `${id}.${campo} vazio`);
    }
    assert.equal(exercicio.opcoes.length, 3, id);
    assert.deepEqual([...exercicio.opcoes.map(o => o.id)].sort(), ['entrega', 'evidencia', 'ritmo']);
    assert.equal(exercicio.opcoes.filter(o => o.correta).length, 1, id);
    assert.equal(new Set(exercicio.opcoes.map(o => o.titulo)).size, 3, `${id} títulos repetidos`);
    assert.equal(new Set(exercicio.opcoes.map(o => o.feedback)).size, 3, `${id} feedback genérico`);
    for (const opcao of exercicio.opcoes) {
      assert.equal(typeof opcao.correta, 'boolean', id);
      assert.ok(opcao.titulo.length > 12, id);
      assert.ok(opcao.detalhe.length > 35, id);
      assert.ok(opcao.feedback.length > 90, `${id}.${opcao.id} precisa explicar a escolha`);
      assert.ok(Object.isFrozen(opcao));
    }
    cenarios.add(exercicio.cenario); perguntas.add(exercicio.pergunta); escritas.add(exercicio.escrita);
    tipos.add(exercicio.tipo); corretas.add(exercicio.opcoes.find(o => o.correta).id);
  }
  assert.equal(cenarios.size, 18);
  assert.equal(perguntas.size, 18);
  assert.equal(escritas.size, 18);
  assert.ok(tipos.size >= 3);
  assert.equal(corretas.size, 3, 'a posição da resposta correta precisa variar');
});

test('respostas preservam conceitos verificáveis nas teses e evidências do módulo de origem', () => {
  // Âncoras explícitas impedem desvios nas regras pedagógicas já publicadas.
  // As duas verificações são necessárias: presença no módulo e na resposta correta.
  const ancoras = {
    arquitetura: [/Pessoas e Gestores/, /Venda.*Opera.*Finan/, /promessa/],
    conscientizar: [/sintoma/i, /evid.ncia/i, /respons.vel/i],
    ciclo: [/ponto de partida/, /padr.o/],
    times: [/0 a 3/, /capacidade/],
    diagnostico: [/0 a 4/, /amostra/, /data de corte/],
    venda: [/escopo/, /prazo/, /crit.rio de aceite/],
    operacao: [/passagem/, /crit.rio de aceite/],
    financas: [/13 semanas/, /premissas/, /caixa/],
    pessoas: [/demonstr/, /pr.tica/, /reconhecimento/],
    gestores: [/respons.vel/, /prazo/, /equipe/],
    '90dias': [/linha de base/, /padr.o/, /autonomia/],
    dono: [/decis.o/, /realizado/i, /proje..o/],
    venda2: [/margem/, /reten..o/, /voz do cliente/i],
    operacao2: [/restri..o/, /A3/, /fluxo/],
    financas2: [/capital de giro/, /proje..o/, /margem/],
    pessoas2: [/fatos/, /capacidade/, /perfil/],
    gestores2: [/al.ada/, /limite/, /quem decide/],
    dinamicas: [/AP/, /calibra/, /multiplicador/]
  };
  for (const modulo of modulos) {
    const origem = [modulo.tese, modulo.resumo, modulo.entrega, ...modulo.evidencias, ...modulo.ferramentas, modulo.frase].join(' ');
    const opcao = porId[modulo.id].opcoes.find(o => o.correta);
    const resposta = [opcao.titulo, opcao.detalhe, opcao.feedback].join(' ');
    for (const regra of ancoras[modulo.id]) {
      const ancora = new RegExp(regra.source, 'i');
      assert.match(origem, ancora, `${modulo.id}: conceito não identificado na fonte atual`);
      assert.match(resposta, ancora, `${modulo.id}: resposta precisa preservar ${ancora}`);
    }
  }
});

test('conteúdo diferencia casos fictícios, registro de estudo e prática sem prometer certificação', () => {
  assert.match(fonte, /cenários abaixo são didáticos e fictícios/);
  assert.match(fonte, /não comprova aplicação na empresa nem certificação/);
  for (const exercicio of Object.values(porId)) {
    const texto = JSON.stringify(exercicio);
    assert.doesNotMatch(texto, /burro|incapaz|fracassado|certificado garantido|lucro garantido/i);
    assert.doesNotMatch(texto, /R\$|\d+%/);
    assert.doesNotMatch(texto, /\u2013|\u2014/);
    assert.ok(exercicio.aplicacao !== exercicio.escrita);
    assert.ok(exercicio.revisao.includes('?'));
  }
});

test('quatro conquistas conservam IDs atuais e reconhecem estudo sem fingir resultado operacional', () => {
  assert.deepEqual([...conquistas.map(c => c.id)], ['primeiro', 'ritmo', 'base', 'trilha']);
  for (const conquista of conquistas) {
    assert.ok(conquista.titulo && conquista.mensagem && conquista.arte);
    assert.match(conquista.arte, /^\.\/assets\/vof\/conquista-(primeiro|ritmo|base|trilha)\.webp$/);
    assert.ok(Object.isFrozen(conquista));
    assert.doesNotMatch(conquista.mensagem, /certifica|empresa transformada|garantid/i);
  }
  assert.match(conquistas[3].mensagem, /aplicar, observar e compartilhar/);
});
