// Editor aberto é uma cópia com identidade e base próprias. Nenhum dado real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montar, crachaFalso, servidorFalso, assentar } from './helpers/casca.mjs';
import { validarJornada } from '../supabase/functions/vof-sync/jornada.mjs';

const USUARIO = 'zz_aluno_editor';
const ORIGINAL = 'Resposta original fictícia: combinar promessa, entrega e caixa com o time.';
const REMOTA = 'Resposta remota fictícia: revisar a passagem entre as áreas e confirmar o acordo.';
const json = (p, expr) => JSON.parse(p.run('JSON.stringify(' + expr + ')'));
async function abrir(servidor, { usuario = USUARIO, memoria = new Map() } = {}) {
  const p = montar({ cracha: crachaFalso({ sub: usuario }), servidor, metodo: 'real', jornada: true, content: true, memoria });
  const proto = Object.getPrototypeOf(p.document.createElement('select'));
  const d = Object.getOwnPropertyDescriptor(proto, 'value');
  if (d?.get && !d.set) Object.defineProperty(proto, 'value', { ...d, set(v) {
    this.querySelectorAll('option').forEach(o => o.getAttribute('value') === String(v) ? o.setAttribute('selected', '') : o.removeAttribute('selected'));
  } });
  await assentar(); await p.run('VOFJornada.conectar()'); return p;
}
function abrirMissao(p, id = 'arquitetura') { p.run('VOFMetodo.abrirApresentacao(VOFMetodo.APRESENTACAO.findIndex(m => m.id === ' + JSON.stringify(id) + '),"aplicar")'); }
const campo = p => p.document.querySelector('.vof-challenge textarea[aria-label="Evidência escrita da missão"]');
const avisoResposta = p => p.document.querySelector('.vof-challenge > .vof-editor-conflict');
const avisoPratica = p => p.document.querySelector('.vof-practice > .vof-editor-conflict');
const salvarResposta = p => p.document.querySelector('[data-vof-salvar]');
function digitar(p, texto) { campo(p).value = texto; p.evento(campo(p), 'input'); }
function concluir(p, texto = ORIGINAL) {
  p.document.querySelector('[data-opcao="evidencia"]').click(); digitar(p, texto); salvarResposta(p).click();
}
function pratica(p, texto, prazo = '2026-11-15') {
  const c = p.document.querySelector('.vof-practice'); c.open = true;
  const data = c.querySelector('[data-pratica-prazo]'); data.value = prazo; p.evento(data, 'input');
  const resultado = c.querySelector('[data-pratica-resultado]'); resultado.value = texto; p.evento(resultado, 'input');
  c.querySelector('[data-pratica-salvar]').click();
}
async function par() {
  const servidor = servidorFalso({ jornada: true }), a = await abrir(servidor);
  abrirMissao(a); concluir(a); await a.run('VOFJornada.sincronizar()');
  const b = await abrir(servidor); abrirMissao(b);
  return { servidor, a, b };
}

test('resposta remota não é apagada por campo obsoleto: comparar, carregar e preservar a nova versão', async () => {
  const { servidor, a, b } = await par();
  digitar(b, REMOTA); salvarResposta(b).click(); await b.run('VOFJornada.sincronizar()');
  await a.run('VOFJornada.sincronizar()');
  assert.equal(campo(a).value, ORIGINAL, 'a cópia em edição não desaparece');
  assert.equal(avisoResposta(a).hidden, false);
  assert.match(avisoResposta(a).textContent, /Resposta original fictícia/);
  assert.match(avisoResposta(a).textContent, /Resposta remota fictícia/);
  assert.equal(salvarResposta(a).disabled, true);
  const edicao = ORIGINAL + ' Texto ainda sendo elaborado.';
  digitar(a, edicao); await a.run('VOFJornada.sincronizar()');
  assert.equal(campo(a).value, edicao);
  assert.equal(servidor.jornadas.get(USUARIO).arquitetura.registro.texto, REMOTA);
  avisoResposta(a).querySelector('[data-editor-versao="atual"]').click();
  assert.equal(campo(a).value, REMOTA);
  assert.equal(avisoResposta(a).hidden, true);
  assert.equal(salvarResposta(a).disabled, false);
  a.run('VOFMetodo.fecharApresentacao()'); abrirMissao(a);
  assert.equal(campo(a).value, REMOTA);
});

test('manter a edição requer escolha explícita e salva sobre a base remota conferida', async () => {
  const { servidor, a, b } = await par();
  digitar(b, REMOTA); await b.run('VOFJornada.sincronizar()'); await a.run('VOFJornada.sincronizar()');
  const edicao = 'Minha edição fictícia após comparar as duas versões e integrar a informação.';
  digitar(a, edicao); assert.equal(avisoResposta(a).hidden, false);
  avisoResposta(a).querySelector('[data-editor-versao="local"]').click();
  assert.equal(campo(a).value, edicao); assert.equal(avisoResposta(a).hidden, true);
  assert.equal(servidor.jornadas.get(USUARIO).arquitetura.registro.texto, REMOTA, 'escolha não envia antes do salvar');
  salvarResposta(a).click(); await a.run('VOFJornada.sincronizar()');
  assert.equal(servidor.jornadas.get(USUARIO).arquitetura.registro.texto, edicao);
  assert.equal(a.run('VOFJornada.estado().xp'), 30);
  assert.equal(a.run('VOFJornada.status().conflitos.length'), 0);
});

test('ACK do próprio envio e nova consulta idêntica não bloqueiam o editor nem recriam feedback ao digitar', async () => {
  const { a } = await par();
  assert.equal(avisoResposta(a).hidden, true);
  const feedback = a.document.querySelector('.vof-learning-feedback p');
  digitar(a, ORIGINAL + ' Acrescentei uma evidência.');
  assert.equal(a.document.querySelector('.vof-learning-feedback p'), feedback, 'a região viva não é recriada a cada tecla');
  await a.run('VOFJornada.sincronizar()'); await a.run('VOFJornada.sincronizar()');
  assert.equal(avisoResposta(a).hidden, true);
  assert.equal(avisoPratica(a).hidden, true);
  assert.equal(salvarResposta(a).disabled, false);
});

test('aplicação remota não é sobrescrita pelo formulário anterior; texto em andamento permanece até escolha', async () => {
  const { servidor, a, b } = await par();
  const resultado = a.document.querySelector('[data-pratica-resultado]');
  resultado.value = 'Relato em elaboração no aparelho A, ainda não salvo.'; a.evento(resultado, 'input');
  pratica(b, 'Relato remoto com a passagem conferida e uma próxima verificação.', '2026-12-03');
  await b.run('VOFJornada.sincronizar()'); await a.run('VOFJornada.sincronizar()');
  assert.equal(avisoPratica(a).hidden, false);
  assert.equal(resultado.value, 'Relato em elaboração no aparelho A, ainda não salvo.');
  assert.equal(a.document.querySelector('[data-pratica-salvar]').disabled, true);
  a.document.querySelector('[data-pratica-salvar]').click(); await a.run('VOFJornada.sincronizar()');
  assert.equal(servidor.jornadas.get(USUARIO).arquitetura.registro.pratica.prazo, '2026-12-03');
  avisoPratica(a).querySelector('[data-editor-versao="atual"]').click();
  assert.equal(resultado.value, servidor.jornadas.get(USUARIO).arquitetura.registro.pratica.resultado);
  assert.equal(a.document.querySelector('[data-pratica-prazo]').value, '2026-12-03');
  assert.equal(avisoPratica(a).hidden, true);
  assert.equal(avisoResposta(a).hidden, true, 'mudar aplicação não cria conflito na resposta educativa');
});

test('troca de conta fecha editor e handlers antigos não gravam texto na nova identidade', async () => {
  const { a } = await par();
  const antigoCampo = campo(a), antigoSalvar = salvarResposta(a), antigoSalvarPratica = a.document.querySelector('[data-pratica-salvar]');
  a.run('STORE.setUser({usuario:"zz_outro_editor",nome:"Outro aluno fictício",papel:"facilitador"})');
  assert.equal(a.document.querySelector('.modal-vof'), null);
  assert.equal(a.run('VOFJornada.estado().xp'), 0);
  antigoCampo.value = 'Texto anterior que não pode entrar na conta nova'; a.evento(antigoCampo, 'input');
  antigoSalvar.click(); antigoSalvarPratica.click();
  assert.deepEqual(json(a, 'VOFJornada.estado().respostas'), {});
});

test('trecho curto de missão concluída fica apenas no campo e não trava outras missões', async () => {
  const servidor = servidorFalso({ jornada: true });
  const fetchOriginal = servidor.fetch;
  servidor.fetch = async (url, init) => {
    const body = JSON.parse(init?.body || '{}');
    if (body.action === 'jornadaSalvar') validarJornada(body);
    return fetchOriginal(url, init);
  };
  const a = await abrir(servidor); abrirMissao(a); concluir(a); await a.run('VOFJornada.sincronizar()');
  digitar(a, 'curto');
  assert.equal(campo(a).value, 'curto');
  assert.equal(salvarResposta(a).disabled, true);
  assert.match(a.document.querySelector('[data-vof-status]').textContent, /Trecho em edição, ainda não salvo/);
  assert.equal(a.run('VOFJornada.estado().respostas.arquitetura.texto'), ORIGINAL);
  await a.run('VOFJornada.sincronizar()');
  assert.equal(campo(a).value, 'curto', 'ACK não destrói o trecho em edição');
  assert.equal(servidor.jornadas.get(USUARIO).arquitetura.registro.texto, ORIGINAL);
  assert.equal(a.run('VOFJornada.status().pendentes'), 0);
  digitar(a, 'Resposta agora completa, com evidência fictícia e próximo passo definido.');
  await a.run('VOFJornada.sincronizar()');
  assert.match(servidor.jornadas.get(USUARIO).arquitetura.registro.texto, /Resposta agora completa/);
  abrirMissao(a, 'operacao'); concluir(a, 'Outra missão fictícia para verificar a passagem e o critério de aceite.');
  assert.equal(await a.run('VOFJornada.sincronizar()'), true);
  assert.equal(a.run('VOFJornada.estado().xp'), 60);
  assert.ok(servidor.jornadas.get(USUARIO).operacao);
});

test('sincronização externa atualiza painel do Método sem depender de navegação e mantém recado correto', async () => {
  const { a, b } = await par();
  a.run('VOFMetodo.fecharApresentacao()'); await a.irPara('#/metodo');
  abrirMissao(b, 'operacao'); concluir(b, 'Registro fictício da operação para conferir avanço em outra janela.');
  await b.run('VOFJornada.sincronizar()'); await a.run('VOFJornada.sincronizar()');
  assert.match(a.document.querySelector('[data-vof-journey-status]').textContent, /^2 de 18/);
  assert.match(a.document.querySelector('[data-sync-status]').textContent, /sincronizada com sua conta/);
  abrirMissao(a);
  assert.match(a.document.querySelector('.vof-local-note').textContent, /Confira o estado do salvamento/);
});

for (const pendente of [false, true]) test(`comparação identifica a origem ${pendente ? 'de outro rascunho ainda pendente' : 'confirmada na conta'}`, async () => {
  const p = await abrir(servidorFalso({ jornada: true }));
  p.run(`window.VOFJornada = {
    ...window.VOFJornada,
    status: () => ({ estado: 'conflito', mensagem: 'Compare as versões.', legadoDisponivel: false }),
    conflitosDetalhes: () => [{ id: 'arquitetura', servidorPendente: ${pendente},
      local: { opcao: 'evidencia', texto: 'Meu rascunho fictício preservado.' },
      servidor: { opcao: 'entrega', texto: 'Outra versão fictícia preservada.' }
    }],
    resolverConflito: async (id, versao) => { window.__escolhaOrigem = { id, versao }; }
  }; window.__comparacaoOrigem = VOFMetodo.jornada.sincronizacaoUI();`);
  const painel = p.run('window.__comparacaoOrigem');
  const titulos = [...painel.querySelectorAll('.vof-sync-comparison b')].map(n => n.textContent);
  const botao = painel.querySelector('[data-versao="servidor"]');
  if (pendente) {
    assert.match(painel.textContent, /outra janela|outro rascunho/i);
    assert.match(painel.textContent, /ainda não foi sincronizad[ao]/);
    assert.deepEqual(titulos, ['Neste aparelho', 'Outro rascunho · pendente']);
    assert.equal(botao.textContent, 'Usar outro rascunho');
    assert.doesNotMatch(painel.textContent, /salva na conta|Na conta/);
  } else {
    assert.deepEqual(titulos, ['Neste aparelho', 'Na conta']);
    assert.equal(botao.textContent, 'Usar resposta salva na conta');
    assert.match(painel.textContent, /outro aparelho/);
  }
  assert.match(painel.textContent, /Meu rascunho fictício preservado/);
  assert.match(painel.textContent, /Outra versão fictícia preservada/);
  botao.click(); await assentar();
  assert.deepEqual(json(p, 'window.__escolhaOrigem'), { id: 'arquitetura', versao: 'servidor' });
});
