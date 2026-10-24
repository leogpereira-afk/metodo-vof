import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montar, crachaFalso, servidorFalso, assentar } from './helpers/casca.mjs';

async function abrir(memoria = new Map()) {
  const p = montar({ cracha: crachaFalso(), servidor: servidorFalso(), metodo: 'real', memoria });
  await assentar();
  return p;
}
const resumo = p => JSON.parse(p.run('JSON.stringify(VOFMetodo.jornada.resumo())'));

test('Início: exibe progresso real local sem concluir missão ao visitar ou abrir', async () => {
  const p = await abrir();
  assert.ok(p.document.querySelector('#inicio-jornada'));
  assert.equal(resumo(p).feitas, 0);
  assert.equal(resumo(p).xp, 0);
  assert.match(p.document.querySelector('#inicio-jornada').textContent, /0 XP/);
  assert.match(p.texto(), /XP e respostas de aprendizagem ficam neste navegador/);
  const botao = p.document.querySelector('[data-inicio-missao]');
  const id = botao.getAttribute('data-inicio-missao');
  assert.equal(id, resumo(p).proximo.id);
  botao.click();
  assert.equal(p.run('VOFMetodo.apresentacaoAtual().estado().id'), id);
  assert.equal(p.run('VOFMetodo.apresentacaoAtual().estado().modo'), 'aplicar');
  assert.equal(resumo(p).xp, 0);
  assert.equal(resumo(p).feitas, 0);
});

test('Início: concluir missão atualiza painel sem fechar a sala nem duplicar pontos', async () => {
  const p = await abrir();
  p.document.querySelector('[data-inicio-missao]').click();
  const modal = p.document.querySelector('.modal-vof');
  const opcao = modal.querySelector('[data-vof-opcoes] button');
  const escrita = modal.querySelector('.vof-challenge textarea');
  const salvar = modal.querySelector('[data-vof-salvar]');
  opcao.click();
  escrita.value = 'A equipe fictícia registrará o combinado e a evidência de entrega.';
  p.evento(escrita, 'input');
  salvar.click();
  const depois = resumo(p);
  assert.equal(depois.feitas, 1);
  assert.ok(depois.xp > 0);
  assert.match(p.document.querySelector('#inicio-jornada').textContent, new RegExp(depois.xp + ' XP'));
  assert.equal(p.document.querySelector('.modal-vof'), modal, 'a sala continua aberta');
  assert.equal(p.document.querySelector('[data-inicio-missao]').getAttribute('data-inicio-missao'), depois.proximo.id);
  salvar.click();
  assert.equal(resumo(p).xp, depois.xp);
  p.run('VOFMetodo.fecharApresentacao()');
  await p.irPara('#/turmas');
  await p.irPara('#/');
  assert.equal(resumo(p).feitas, 1);
});

test('Início: cinco áreas com imagem e destino válido, sem inventar dados de turma', async () => {
  const p = await abrir();
  const areas = [...p.document.querySelectorAll('.area-humana')];
  assert.equal(areas.length, 5);
  for (const link of areas) {
    assert.ok(link.querySelector('img[alt=""]'));
    const id = link.getAttribute('href').split('/').at(-1);
    assert.equal(p.run('VOFMetodo.MODULOS.some(m => m.id === ' + JSON.stringify(id) + ')'), true);
  }
  assert.equal(p.document.querySelectorAll('.abas a .icone-area').length, 8);
  assert.equal(p.document.querySelectorAll('.caminho-jornada [aria-current]').length, 0, 'a Início não inventa uma etapa concluída');
  await p.irPara('#/diagnostico');
  assert.equal(p.document.querySelectorAll('.caminho-jornada [aria-current="step"]').length, 1);
  assert.match(p.document.querySelector('.caminho-jornada [aria-current="step"]').textContent, /Diagnosticar/);
  assert.equal(resumo(p).xp, 0);
});

test('Início: jornada concluída oferece revisão, preservando XP e respostas', async () => {
  const p = await abrir();
  p.run(`localStorage.setItem(VOFMetodo.jornada.CHAVE, JSON.stringify({ xp: 540, respostas: Object.fromEntries(VOFMetodo.MODULOS.map(m => [m.id, { concluida: true, texto: 'Evidência fictícia', opcao: 'evidencia' }])) }));`);
  p.run('window.dispatchEvent(new CustomEvent("vof-jornada-atualizada"))');
  assert.match(p.document.querySelector('#inicio-jornada').textContent, /Você completou as missões/);
  assert.equal(p.document.querySelector('[data-inicio-missao]'), null);
  assert.match(p.document.querySelector('#inicio-jornada a').textContent, /Revisar o que aprendi/);
  assert.equal(resumo(p).xp, 540);
});

test('concluir pela Home devolve foco ao CTA atualizado e atualiza o Método reutilizado', async () => {
  const p = await abrir();
  await p.irPara('#/metodo');
  await p.irPara('#/');
  const botao = p.document.querySelector('[data-inicio-missao]');
  botao.focus(); botao.click();
  p.document.querySelector('.vof-challenge-option').click();
  const area = p.document.querySelector('.vof-challenge textarea');
  area.value = 'Registro fictício para validar progresso entre telas'; p.evento(area, 'input');
  p.document.querySelector('[data-vof-salvar]').click();
  p.run('VOFMetodo.fecharApresentacao()');
  assert.equal(p.document.activeElement.id, 'inicio-jornada-acao');
  assert.match(p.document.activeElement.textContent, /Continuar/);
  await p.irPara('#/metodo');
  assert.match(p.document.querySelector('[data-vof-journey-status]').textContent, /^1 de 18/);
});

test('Home mantém comparação e foco durante sincronização e atualiza o resumo ao lado', async () => {
  const p = montar({ cracha: crachaFalso(), servidor: servidorFalso({ jornada: true }), metodo: 'real', jornada: true, content: true });
  await assentar(); await p.run('VOFJornada.conectar()');
  p.run(`window.__progressoHome = { xp: 0, respostas: {} };
    window.__statusHome = 'Compare as versões.';
    window.VOFJornada = {
      ...VOFJornada,
      estado: () => window.__progressoHome,
      status: () => ({estado: 'conflito', mensagem: window.__statusHome, legadoDisponivel: false}),
      conflitosDetalhes: () => [{id: 'arquitetura', servidorPendente: true,
        local: {texto: 'Meu rascunho fictício.'}, servidor: {texto: 'Outro rascunho fictício.'}}],
      resolverConflito: async (id, versao) => { window.__escolhaHome = {id, versao}; }
    };
    window.dispatchEvent(new CustomEvent('vof-jornada-atualizada'));
  `);
  const painel = p.document.querySelector('#inicio-jornada [data-vof-sync-panel]');
  const comparacao = painel.querySelector('.vof-sync-conflict');
  comparacao.setAttribute('open', '');
  const botao = comparacao.querySelector('[data-versao="local"]'); botao.focus();
  p.run(`window.__progressoHome = {xp: 30, respostas: {operacao: {concluida: true, texto: 'Registro fictício da operação.'}}};
    window.__statusHome = 'Dados atualizados. Compare as versões.';
    window.dispatchEvent(new CustomEvent('vof-jornada-atualizada', {detail: {sincronizacao: true}}));
    window.dispatchEvent(new CustomEvent('vof-jornada-sync'));
  `);
  assert.equal(p.document.querySelector('#inicio-jornada [data-vof-sync-panel]') === painel, true, 'preserva o painel montado');
  assert.equal(painel.querySelector('.vof-sync-conflict') === comparacao, true, 'preserva a comparação sem mudança');
  assert.equal(comparacao.hasAttribute('open'), true);
  assert.equal(p.document.activeElement === botao, true);
  assert.equal(botao.isConnected, true);
  assert.match(p.document.querySelector('#inicio-jornada').textContent, /30 XP/);
  assert.match(painel.querySelector('[data-sync-status]').textContent, /Dados atualizados/);
  botao.click(); await assentar();
  assert.equal(p.run('JSON.stringify(window.__escolhaHome)'), JSON.stringify({id: 'arquitetura', versao: 'local'}));
});
