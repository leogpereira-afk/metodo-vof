// Percurso de aprendizagem completo com a aplicação e o método reais.
// A bancada só usa pessoas, respostas e servidor fictícios. O sistema atual
// tem os papéis admin e facilitador; "aluno" descreve o percurso de uso aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montar, crachaFalso, servidorFalso, assentar } from './helpers/casca.mjs';

async function abrir({ memoria = new Map(), servidor = servidorFalso() } = {}) {
  const p = montar({
    cracha: crachaFalso({ papel: 'facilitador', nome: 'Participante Fictício' }),
    servidor, metodo: 'real', memoria,
  });
  await assentar();
  return p;
}

const json = (p, expressao) => JSON.parse(p.run('JSON.stringify(' + expressao + ')'));
const resumo = p => json(p, 'VOFMetodo.jornada.resumo()');
const estado = p => json(p, 'VOFMetodo.jornada.estado()');
const sala = p => json(p, 'VOFMetodo.apresentacaoAtual()?.estado() || null');
const campo = (p, seletor) => {
  const el = p.document.querySelector('.modal-vof ' + seletor);
  assert.ok(el, 'controle da missão existe: ' + seletor);
  return el;
};
const escrever = (p, texto) => {
  const el = campo(p, '.vof-challenge textarea');
  el.value = texto;
  p.evento(el, 'input');
};
const escritasNoServidor = p => p.servidor.doSync().filter(c =>
  !['rev', 'list', 'get', 'urlArquivo', 'getCfg', 'ping', 'saude'].includes(c.action));

function conferirInicio(p, feitas, total = 18) {
  const painel = p.document.querySelector('#inicio-jornada');
  assert.ok(painel);
  assert.match(painel.textContent, new RegExp((feitas * 30) + ' XP'));
  assert.equal(Number(painel.querySelector('progress').getAttribute('value')), Math.round(feitas / total * 100));
  assert.equal(painel.querySelectorAll('.inicio-conquista.atingida').length,
    [feitas >= 1, feitas >= 3, feitas >= 11, feitas === total].filter(Boolean).length);
  const proximo = resumo(p).proximo;
  assert.equal(painel.querySelector('[data-inicio-missao]')?.getAttribute('data-inicio-missao') || null, proximo?.id || null);
}

test('aluno: 18 missões, do primeiro acesso à conclusão, sem alterar dados de gestão', async t => {
  const servidor = servidorFalso({ dados: {
    empresas: [{ id: 'empresa-aprendizagem-teste', nome: 'Empresa Fictícia de Aprendizagem' }],
    turmas: [{ id: 'turma-aprendizagem-teste', nome: 'Turma Fictícia', status: 'planejada', nivel: 1 }],
  } });
  const bancoAntes = JSON.stringify([...servidor.banco]);
  const p = await abrir({ servidor });
  const modulos = json(p, 'VOFMetodo.MODULOS');
  const respostasEsperadas = new Map();
  assert.equal(modulos.length, 18);
  assert.equal(p.document.querySelector('[data-quem-papel]').textContent, 'Facilitador');
  assert.equal(resumo(p).xp, 0);
  conferirInicio(p, 0);

  // Inicializa o Método para testar também o painel reutilizado após a Home.
  await p.irPara('#/metodo');
  assert.equal(p.document.querySelectorAll('[data-missao]').length, 18);
  await p.irPara('#/');
  p.document.querySelector('[data-inicio-missao]').click();

  for (const [indice, mod] of modulos.entries()) {
    await t.test('missão ' + mod.ordem + ': ' + mod.titulo, async () => {
      const antes = indice * 30;
      assert.equal(sala(p).id, mod.id, 'o botão anterior abre a missão correta');
      assert.equal(sala(p).modo, 'aplicar');
      assert.equal(campo(p, '[data-titulo]').textContent, mod.titulo);
      assert.equal(resumo(p).xp, antes, 'abrir a missão não concede XP');
      const salvar = campo(p, '[data-vof-salvar]');
      assert.equal(salvar.disabled, true);
      assert.equal(campo(p, '.vof-celebration').hidden, true);

      escrever(p, 'curto');
      assert.equal(salvar.disabled, true, 'resposta curta não conclui');
      escrever(p, 'Uma resposta suficientemente longa, mas ainda sem escolher um caminho.');
      assert.equal(salvar.disabled, true, 'texto sem escolha não conclui');
      salvar.click();
      assert.equal(resumo(p).xp, antes, 'acionar botão desabilitado não concede XP');
      const opcao = ['evidencia', 'entrega', 'ritmo'][indice % 3];
      campo(p, '[data-opcao="' + opcao + '"]').click();
      assert.equal(salvar.disabled, false);
      assert.equal(campo(p, '[data-passo="escolher"]').classList.contains('feito'), true);
      escrever(p, '  curto  ');
      assert.equal(salvar.disabled, true, 'o limite usa o texto sem espaços nas pontas');
      assert.equal(campo(p, '[data-passo="escrever"]').classList.contains('feito'), false);
      const texto = 'Missão ' + mod.ordem + ' fictícia: registrar uma ação para ' + mod.titulo + ' e conferir a evidência na semana seguinte.';
      escrever(p, '  ' + texto + '  ');
      assert.equal(salvar.disabled, false);
      assert.equal(resumo(p).xp, antes, 'escrever e escolher preserva a condição de rascunho');
      assert.equal(Boolean(estado(p).respostas[mod.id].concluida), false);
      salvar.click();

      const feitas = indice + 1;
      const depois = resumo(p);
      assert.equal(depois.feitas, feitas);
      assert.equal(depois.xp, feitas * 30);
      assert.equal(depois.percentual, Math.round(feitas / 18 * 100));
      assert.equal(depois.nivel, feitas >= 18 ? 'Multiplicador' : feitas >= 9 ? 'Condutor' : feitas >= 3 ? 'Praticante' : 'Explorador');
      assert.deepEqual(depois.conquistas.map(c => c.atingida), [feitas >= 1, feitas >= 3, feitas >= 11, feitas === 18]);
      assert.deepEqual(depois.proximo?.id || null, modulos[indice + 1]?.id || null);
      assert.equal(estado(p).respostas[mod.id].texto, texto, 'salvar normaliza apenas espaços das pontas');
      assert.equal(estado(p).respostas[mod.id].opcao, opcao);
      assert.equal(estado(p).respostas[mod.id].concluida, true);
      assert.match(estado(p).respostas[mod.id].data, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(campo(p, '[data-passo="registrar"]').classList.contains('feito'), true);
      assert.equal(campo(p, '.vof-celebration').hidden, false);
      assert.equal(campo(p, '.vof-celebration').classList.contains('nova-conquista'), true);
      assert.match(campo(p, '[data-conquista-texto]').textContent, /não uma validação da empresa/);
      conferirInicio(p, feitas);

      salvar.click();
      assert.equal(resumo(p).xp, feitas * 30, 'segundo clique não duplica pontos');
      assert.equal(campo(p, '.vof-celebration').classList.contains('nova-conquista'), false, 'atualização não repete a celebração de novo XP');
      const revisada = texto + ' Revisão fictícia: definir o responsável pelo acompanhamento.';
      escrever(p, revisada);
      salvar.click();
      assert.equal(resumo(p).xp, feitas * 30, 'revisão preserva os pontos');
      respostasEsperadas.set(mod.id, { opcao, texto: revisada });
      assert.equal(estado(p).respostas[mod.id].texto, revisada);
      const proxima = campo(p, '[data-missao-seguinte]');
      assert.match(proxima.textContent, feitas === 18 ? /Revisar minha jornada/ : /Próxima missão/);
      proxima.click();
      if (feitas === 18) {
        assert.equal(sala(p), null);
        assert.equal(p.document.querySelector('.modal-vof'), null);
      } else {
        assert.equal(sala(p).id, modulos[feitas].id);
        assert.equal(sala(p).modo, 'aplicar');
      }

      // Confere o painel completo nas mudanças de nível e conclusão da base.
      if ([3, 9, 11, 18].includes(feitas)) {
        p.run('VOFMetodo.fecharApresentacao()');
        await p.irPara('#/metodo');
        assert.match(p.document.querySelector('[data-vof-journey-status]').textContent, new RegExp('^' + feitas + ' de 18'));
        assert.equal(p.document.querySelector('[data-vof-journey-xp]').textContent, feitas * 30 + ' XP');
        assert.equal(p.document.querySelectorAll('[data-missao].concluida').length, feitas);
        assert.equal(p.document.querySelectorAll('.vof-achievements .conquistada').length, depois.conquistas.filter(c => c.atingida).length);
        assert.equal(Number(p.document.querySelector('.vof-journey-progress').getAttribute('aria-valuenow')), feitas);
        await p.irPara('#/');
        conferirInicio(p, feitas);
        if (feitas < 18) p.document.querySelector('[data-inicio-missao]').click();
      }
    });
  }

  assert.deepEqual(escritasNoServidor(p), [], 'aprender não grava nem modifica dados da gestão');
  assert.equal(JSON.stringify([...servidor.banco]), bancoAntes);
  assert.match(p.document.querySelector('#inicio-jornada').textContent, /Você completou as missões/);
  assert.equal(p.document.querySelector('#inicio-jornada a').getAttribute('href'), '#/metodo');

  await t.test('recarregar e revisar as 18 respostas preserva todos os textos, escolhas e 540 XP', async () => {
    const recarregada = await abrir({ memoria: p.memoria, servidor });
    assert.equal(resumo(recarregada).xp, 540);
    assert.equal(resumo(recarregada).percentual, 100);
    assert.equal(resumo(recarregada).nivel, 'Multiplicador');
    conferirInicio(recarregada, 18);
    for (const mod of modulos) {
      await recarregada.irPara('#/metodo/' + mod.id);
      const resposta = respostasEsperadas.get(mod.id);
      assert.equal(campo(recarregada, 'textarea').value, resposta.texto, mod.id);
      assert.equal(campo(recarregada, '[data-opcao="' + resposta.opcao + '"]').getAttribute('aria-pressed'), 'true', mod.id);
      assert.equal(campo(recarregada, '[data-vof-salvar]').textContent, 'Atualizar resposta · 0 XP');
      assert.equal(campo(recarregada, '.vof-celebration').hidden, true, 'reabrir não dispara conquista antiga');
      campo(recarregada, '[data-vof-salvar]').click();
      assert.equal(resumo(recarregada).xp, 540, mod.id + ': revisão não soma pontos');
      assert.equal(estado(recarregada).respostas[mod.id].texto, resposta.texto);
      recarregada.run('VOFMetodo.fecharApresentacao()');
    }
    assert.deepEqual(escritasNoServidor(recarregada), []);
    assert.equal(JSON.stringify([...servidor.banco]), bancoAntes);
  });
});

test('aluno: visitar as 20 telas, incluindo as duas aberturas, não conclui nem pontua', async () => {
  const p = await abrir();
  const apresentacao = json(p, 'VOFMetodo.APRESENTACAO');
  assert.equal(apresentacao.length, 20);
  for (const [i, mod] of apresentacao.entries()) {
    p.run('VOFMetodo.abrirApresentacao(' + i + ', "apresentar")');
    assert.equal(sala(p).id, mod.id);
    assert.equal(campo(p, '[data-titulo]').textContent, mod.titulo);
    assert.ok(campo(p, '[data-fonte]').textContent.trim());
    if (i < 2) {
      assert.equal(p.document.querySelector('.vof-challenge'), null);
      assert.match(p.document.querySelector('.vof-opening-note').textContent, /sem pontuação/);
    }
    assert.equal(resumo(p).xp, 0);
    assert.equal(resumo(p).feitas, 0);
  }
  p.run('VOFMetodo.fecharApresentacao()');
  assert.deepEqual(escritasNoServidor(p), []);
});

test('aluno: rascunho de cada missão sobrevive ao recarregamento sem virar conquista', async () => {
  const p = await abrir();
  const modulos = json(p, 'VOFMetodo.MODULOS');
  for (const mod of modulos) {
    await p.irPara('#/metodo/' + mod.id);
    campo(p, '[data-opcao="ritmo"]').click();
    escrever(p, 'Rascunho fictício preservado da missão ' + mod.id);
    p.run('VOFMetodo.fecharApresentacao()');
  }
  assert.equal(resumo(p).xp, 0);
  assert.equal(resumo(p).feitas, 0);
  const recarregada = await abrir({ memoria: p.memoria });
  await recarregada.irPara('#/metodo');
  assert.equal(recarregada.document.querySelectorAll('[data-missao].concluida').length, 0);
  for (const mod of modulos) {
    assert.match(recarregada.document.querySelector('[data-missao="' + mod.id + '"] [data-situacao]').textContent, /Em andamento/);
    await recarregada.irPara('#/metodo/' + mod.id);
    assert.equal(campo(recarregada, 'textarea').value, 'Rascunho fictício preservado da missão ' + mod.id);
    assert.equal(campo(recarregada, '[data-opcao="ritmo"]').getAttribute('aria-pressed'), 'true');
    assert.equal(campo(recarregada, '[data-vof-salvar]').textContent, 'Concluir missão · +30 XP');
    recarregada.run('VOFMetodo.fecharApresentacao()');
  }
  assert.equal(resumo(recarregada).xp, 0);
  assert.equal(resumo(recarregada).conquistas.some(c => c.atingida), false);
  assert.deepEqual(escritasNoServidor(p), []);
  assert.deepEqual(escritasNoServidor(recarregada), []);
});
