// Percurso didático completo: interface real, conta fictícia, API e dados de teste.
// Exercícios, respostas, prática e XP são conferidos também em outro aparelho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montar, crachaFalso, servidorFalso, assentar } from './helpers/casca.mjs';

const json = (p, expressao) => JSON.parse(p.run('JSON.stringify(' + expressao + ')'));
const resumo = p => json(p, 'VOFMetodo.jornada.resumo()');
const estado = p => json(p, 'VOFJornada.estado()');
const campo = (p, seletor) => {
  const el = p.document.querySelector('.modal-vof ' + seletor);
  assert.ok(el, 'campo da missão disponível: ' + seletor);
  return el;
};
function preencher(p, seletor, valor) {
  const el = campo(p, seletor);
  if (el.tagName === 'SELECT') {
    el.querySelectorAll('option').forEach(o => {
      if (o.getAttribute('value') === valor) o.setAttribute('selected', '');
      else o.removeAttribute('selected');
    });
  } else el.value = valor;
  p.evento(el, el.tagName === 'SELECT' ? 'change' : 'input');
  return el;
}
async function abrir({ memoria = new Map(), servidor = servidorFalso({ jornada: true }), usuario = 'zz_aluna_aplicacao' } = {}) {
  const p = montar({ cracha: crachaFalso({ sub: usuario, nome: 'Aluna Fictícia de Aplicação', papel: 'facilitador' }),
    memoria, servidor, metodo: 'real', jornada: true, content: true });
  // linkedom não implementa o setter HTMLSelectElement.value. Completa somente
  // essa API de plataforma na bancada, preservando o getter e a UI de produção.
  const proto = Object.getPrototypeOf(p.document.createElement('select'));
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.get && !descriptor.set) Object.defineProperty(proto, 'value', { ...descriptor,
    set(valor) { this.querySelectorAll('option').forEach(o => { if (o.getAttribute('value') === String(valor)) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); } });
  await assentar();
  await p.run('VOFJornada.conectar()');
  await assentar();
  return p;
}
function abrirMissao(p, id) {
  p.run('VOFMetodo.abrirApresentacao(VOFMetodo.APRESENTACAO.findIndex(m => m.id === ' + JSON.stringify(id) + '), "aplicar")');
}
function concluir(p, id, texto = 'Ação fictícia: observar uma ocorrência, combinar o próximo passo e conferir o resultado.') {
  const exercicio = json(p, 'VOFExercicios.porId[' + JSON.stringify(id) + ']');
  const correta = exercicio.opcoes.find(o => o.correta);
  campo(p, '[data-opcao="' + correta.id + '"]').click();
  preencher(p, 'textarea[aria-label="Evidência escrita da missão"]', texto);
  campo(p, '[data-vof-salvar]').click();
}

test('jornada aplicada:18 cenários com explicação, prática,540XP e retomada em outro aparelho', async t => {
  const servidor = servidorFalso({ jornada: true, dados: {
    empresas: [{ id: 'empresa-teste-aplicacao', nome: 'Empresa Fictícia da Aplicação' }],
    turmas: [{ id: 'turma-teste-aplicacao', nome: 'Turma Fictícia da Aplicação', status: 'planejada', nivel: 1 }],
  } });
  const bancoAntes = JSON.stringify([...servidor.banco]);
  const p = await abrir({ servidor });
  const modulos = json(p, 'VOFMetodo.MODULOS');
  const esperado = new Map();
  assert.equal(modulos.length, 18); assert.equal(resumo(p).xp, 0);
  p.document.querySelector('[data-inicio-missao]').click();

  for (const [indice, mod] of modulos.entries()) {
    await t.test('missão ' + mod.ordem + ': ' + mod.titulo, async () => {
      const exercicio = json(p, 'VOFExercicios.porId[' + JSON.stringify(mod.id) + ']');
      const correta = exercicio.opcoes.find(o => o.correta);
      assert.equal(json(p, 'VOFMetodo.apresentacaoAtual().estado()').id, mod.id);
      assert.match(campo(p, '.vof-case').textContent, /situação ilustrativa/);
      assert.ok(campo(p, '.vof-case').textContent.includes(exercicio.cenario));
      assert.equal(campo(p, '.vof-learning-feedback').hidden, true);
      assert.equal(campo(p, '.vof-practice').hidden, true, 'aplicação fica recolhida até a conclusão');
      preencher(p, 'textarea[aria-label="Evidência escrita da missão"]', 'Resposta fictícia suficientemente longa para estudar o cenário.');
      assert.equal(campo(p, '[data-vof-salvar]').disabled, true, 'texto sem escolha não conclui');

      for (const errada of exercicio.opcoes.filter(o => !o.correta)) {
        campo(p, '[data-opcao="' + errada.id + '"]').click();
        const feedback = campo(p, '.vof-learning-feedback');
        assert.equal(feedback.hidden, false);
        assert.ok(feedback.textContent.includes(errada.feedback), 'explicação é específica da alternativa');
        assert.equal(feedback.classList.contains('correta'), false);
        assert.equal(campo(p, '[data-vof-salvar]').disabled, true, 'alternativa incoerente não concede conclusão');
        campo(p, '[data-vof-salvar]').click();
        assert.equal(resumo(p).xp, indice * 30);
      }

      campo(p, '[data-opcao="' + correta.id + '"]').click();
      assert.equal(campo(p, '.vof-learning-feedback').classList.contains('correta'), true);
      assert.ok(campo(p, '.vof-learning-feedback').textContent.includes(correta.feedback));
      preencher(p, 'textarea[aria-label="Evidência escrita da missão"]', 'curto');
      assert.equal(campo(p, '[data-vof-salvar]').disabled, true);
      const texto = 'Missão fictícia ' + mod.ordem + ': combinar uma ação de ' + mod.titulo + ', registrar a evidência e revisar com a equipe de teste.';
      preencher(p, 'textarea[aria-label="Evidência escrita da missão"]', texto);
      assert.equal(campo(p, '[data-vof-salvar]').disabled, false);
      campo(p, '[data-vof-salvar]').click();
      const xp = (indice + 1) * 30;
      assert.equal(resumo(p).xp, xp); assert.equal(resumo(p).feitas, indice + 1);
      assert.equal(estado(p).respostas[mod.id].desafioVersao, 1);
      assert.equal(campo(p, '.vof-celebration').hidden, false);
      assert.ok(campo(p, '.vof-celebration img').getAttribute('src').includes('conquista-'));
      assert.equal(campo(p, '.vof-practice').hidden, false);
      assert.equal(campo(p, '.vof-practice').tagName, 'DETAILS');
      assert.ok(campo(p, '.vof-practice').textContent.includes(exercicio.aplicacao));
      assert.ok(campo(p, '.vof-practice').textContent.includes(exercicio.revisao));
      campo(p, '[data-vof-salvar]').click();
      assert.equal(resumo(p).xp, xp, 'repetir clique não duplica os pontos');

      campo(p, '.vof-practice').open = true;
      preencher(p, '[data-pratica-prazo]', '2026-11-20');
      preencher(p, '[data-pratica-situacao]', 'em_pratica');
      const resultado = 'Aplicação fictícia da missão ' + mod.ordem + ': a equipe observou a ocorrência e registrou o próximo teste.';
      preencher(p, '[data-pratica-resultado]', resultado);
      campo(p, '[data-pratica-salvar]').click();
      assert.equal(estado(p).respostas[mod.id].pratica.prazo, '2026-11-20');
      assert.equal(estado(p).respostas[mod.id].pratica.situacao, 'em_pratica');
      assert.equal(estado(p).respostas[mod.id].pratica.resultado, resultado);
      assert.equal(resumo(p).xp, xp, 'aplicação prática não concede XP extra');
      esperado.set(mod.id, { opcao: correta.id, texto, resultado });

      campo(p, '[data-missao-seguinte]').click();
      if (indice === 17) assert.equal(p.document.querySelector('.modal-vof'), null);
      else assert.equal(json(p, 'VOFMetodo.apresentacaoAtual().estado()').id, modulos[indice + 1].id);
    });
  }

  assert.equal(resumo(p).xp, 540); assert.equal(resumo(p).percentual, 100);
  assert.equal(resumo(p).conquistas.filter(c => c.atingida).length, 4);
  assert.equal(await p.run('VOFJornada.sincronizar()'), true);
  assert.equal(json(p, 'VOFJornada.status()').pendentes, 0);
  assert.equal(JSON.stringify([...servidor.banco]), bancoAntes, 'estudo não altera cadastros da gestão');

  for (const [rotulo, memoria] of [['recarregamento', p.memoria], ['outro aparelho', new Map()]]) {
    const retomada = await abrir({ memoria, servidor });
    assert.equal(resumo(retomada).xp, 540, rotulo + ': total preservado');
    for (const mod of modulos) {
      abrirMissao(retomada, mod.id);
      const r = esperado.get(mod.id);
      assert.equal(campo(retomada, 'textarea[aria-label="Evidência escrita da missão"]').value, r.texto);
      assert.equal(campo(retomada, '[data-opcao="' + r.opcao + '"]').getAttribute('aria-pressed'), 'true');
      assert.equal(campo(retomada, '[data-pratica-prazo]').value, '2026-11-20');
      assert.equal(campo(retomada, '[data-pratica-situacao]').value, 'em_pratica');
      assert.equal(campo(retomada, '[data-pratica-resultado]').value, r.resultado);
      campo(retomada, '[data-vof-salvar]').click();
      assert.equal(resumo(retomada).xp, 540, rotulo + ': revisão não repete XP');
      campo(retomada, '[aria-label="Fechar a apresentação"]').click();
    }
  }
});

test('revisão da prática exige resultado, registra data e persiste sem novos pontos', async () => {
  const p = await abrir(); abrirMissao(p, 'arquitetura'); concluir(p, 'arquitetura');
  assert.equal(resumo(p).xp, 30);
  preencher(p, '[data-pratica-prazo]', '2026-11-20');
  preencher(p, '[data-pratica-situacao]', 'planejada');
  preencher(p, '[data-pratica-resultado]', ''); campo(p, '[data-pratica-salvar]').click();
  assert.equal(estado(p).respostas.arquitetura.pratica.situacao, 'planejada');
  assert.equal(estado(p).respostas.arquitetura.pratica.revisaoEm, '');
  preencher(p, '[data-pratica-situacao]', 'revisada');
  preencher(p, '[data-pratica-resultado]', 'curto'); campo(p, '[data-pratica-salvar]').click();
  assert.notEqual(estado(p).respostas.arquitetura.pratica.situacao, 'revisada', 'texto curto não vira revisão');
  assert.match(campo(p, '[data-pratica-status]').textContent, /resultado|12|caracteres/i);
  const resultado = 'Resultado fictício conferido: a passagem entre áreas ganhou um responsável e será revisada novamente.';
  preencher(p, '[data-pratica-resultado]', resultado); campo(p, '[data-pratica-salvar]').click();
  const salvo = estado(p).respostas.arquitetura.pratica;
  assert.equal(salvo.situacao, 'revisada'); assert.equal(salvo.resultado, resultado);
  assert.match(salvo.revisaoEm, /^\d{4}-\d{2}-\d{2}$/); assert.equal(resumo(p).xp, 30);
  await p.run('VOFJornada.sincronizar()');
  const retomada = await abrir({ servidor: p.servidor }); abrirMissao(retomada, 'arquitetura');
  assert.equal(campo(retomada, '[data-pratica-situacao]').value, 'revisada');
  assert.equal(campo(retomada, '[data-pratica-resultado]').value, resultado);
  assert.equal(estado(retomada).respostas.arquitetura.pratica.revisaoEm, salvo.revisaoEm);
  assert.equal(resumo(retomada).xp, 30);
});

test('um segundo usuário não recebe respostas, pontos ou práticas do primeiro', async () => {
  const servidor = servidorFalso({ jornada: true }), p = await abrir({ servidor });
  abrirMissao(p, 'venda'); concluir(p, 'venda'); await p.run('VOFJornada.sincronizar()');
  const outra = await abrir({ servidor, memoria: p.memoria, usuario: 'zz_outro_aluno_aplicacao' });
  assert.equal(resumo(outra).xp, 0); assert.equal(resumo(outra).feitas, 0);
  abrirMissao(outra, 'venda');
  assert.equal(campo(outra, 'textarea[aria-label="Evidência escrita da missão"]').value, '');
  assert.equal(campo(outra, '.vof-practice').hidden, true);
});
