// Trocar a própria senha no Método V.O.F.
//
// O dono tentou trocar a senha e não achou onde: o POPs tinha a tela, o V.O.F.
// não. Aqui a casca ganha a rota #/senha, o link no topo e a senha provisória
// obrigatória (como o POPs), e a tela explica o caso da ENTRADA ÚNICA (crachá
// plantado pelo Painel, sem senha digitada aqui).
//
// A equipe-auth é FALSA e imita as regras da ação trocarMinhaSenha de verdade:
// crachá do V.O.F. no Authorization (sis "vof"), senha nova de ao menos 6
// caracteres, senha atual conferida só quando a senha NÃO é provisória, e a
// troca apaga a marca de provisória. Nada daqui chama o servidor de verdade.
//
// Os casos ruins vêm primeiro. Nomes e senhas daqui são inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montar, crachaFalso, servidorFalso, assentar, ler } from './helpers/casca.mjs';

const TRAVESSAO = String.fromCharCode(8212), MEIA_RISCA = String.fromCharCode(8211);
const RECADO_PAINEL = 'Você entrou pelo Painel. A senha que você usa é a do Painel: troque em Painel, no seu nome, Minha conta. A senha própria do V.O.F. só serve para entrar direto por este endereço.';
const DADOS = () => ({ turmas: [{ id: 't-teste', nome: 'Turma Fictícia', nivel: 1, status: 'em andamento', inicio: '2026-09-01', participantes: 5, empresaId: '', facilitador: '', obs: '' }], empresas: [], planos: [], diagnosticos: [] });

// A equipe-auth falsa. Guarda o que recebeu e decide pelas regras dela.
function comEquipe(servidor, opcoes = {}) {
  const estado = {
    senha: opcoes.senha ?? 'provisoria1',
    trocarSenha: opcoes.trocarSenha ?? true,
    contaExiste: opcoes.contaExiste !== false,
    logins: [], trocas: [],
    // segurar: a resposta da troca espera estado.soltar() (envio em voo).
    soltar: null,
  };
  const original = servidor.fetch;
  const resp = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(JSON.stringify(corpo)) });
  const carga = token => { try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString()); } catch { return null; } };
  servidor.fetch = async (url, init) => {
    if (!String(url).endsWith('/equipe-auth')) return original(url, init);
    const corpo = JSON.parse(init && init.body ? init.body : '{}');
    const auth = (init && init.headers && (init.headers.Authorization || init.headers.authorization)) || '';
    if (corpo.acao === 'login') {
      estado.logins.push(corpo);
      if (corpo.sistema !== 'vof' || corpo.usuario !== 'zz_facilitadora' || corpo.senha !== estado.senha) return resp(401, { erro: 'Usuário ou senha incorretos.' });
      return resp(200, { token: crachaFalso({ exp: Math.floor(Date.now() / 1000) + 7200 }), usuario: 'zz_facilitadora', nome: 'Facilitadora de Teste', papel: 'facilitador', trocarSenha: estado.trocarSenha, dias: 30 });
    }
    if (corpo.acao === 'trocarMinhaSenha') {
      estado.trocas.push(Object.assign({}, corpo, { auth, url: String(url), cabecalhos: JSON.stringify((init && init.headers) || {}) }));
      if (opcoes.segurar) await new Promise(r => { estado.soltar = r; });
      const f = opcoes.falha;
      if (f === 'rede') throw new TypeError('Failed to fetch');
      if (f) return resp(f.status, f.corpo);
      const c = carga(auth.replace(/^Bearer\s+/i, ''));
      if (!c || c.sis !== corpo.sistema) return resp(401, { erro: 'Sessão inválida ou expirada.' });
      const nova = String(corpo.novaSenha ?? '');
      if (nova.length < 6) return resp(400, { erro: 'A senha nova precisa de ao menos 6 caracteres.' });
      if (!estado.contaExiste) return resp(404, { erro: 'Conta não encontrada.' });
      if (!estado.trocarSenha && String(corpo.senhaAtual ?? '') !== estado.senha) return resp(401, { erro: 'Senha atual incorreta.' });
      estado.senha = nova; estado.trocarSenha = false;
      return resp(200, opcoes.avisos ? { ok: true, avisos: opcoes.avisos } : { ok: true });
    }
    return original(url, init);
  };
  return estado;
}

// Abre SEM crachá e entra pelo login daqui.
async function entrarPeloLogin(opcoes = {}) {
  const servidor = servidorFalso({ dados: DADOS() });
  const equipe = comEquipe(servidor, opcoes);
  const p = montar({ servidor, hash: opcoes.hash || '#/', memoria: opcoes.memoria });
  await assentar();
  const u = p.document.querySelector('#lg-u');
  u.value = 'zz_facilitadora'; p.evento(u, 'input');
  p.document.querySelector('#lg-s').value = equipe.senha;
  p.evento(p.document.querySelector('#form-login'), 'submit');
  await assentar();
  return { p, equipe };
}
// Abre com o crachá plantado pelo Painel (entrada única).
async function abrirPeloPainel(opcoes = {}) {
  const servidor = servidorFalso({ dados: DADOS() });
  const equipe = comEquipe(servidor, Object.assign({ trocarSenha: false, senha: 'senhaDoPainel1' }, opcoes));
  const p = montar({ cracha: crachaFalso(), servidor, hash: opcoes.hash || '#/senha', usuarioSalvo: opcoes.usuarioSalvo });
  await assentar();
  return { p, equipe };
}
// Recarrega a página no mesmo aparelho (mesma memória, servidor novo).
async function recarregar(p, hash, opcoes = {}) {
  const servidor = servidorFalso({ dados: DADOS() });
  const equipe = comEquipe(servidor, opcoes);
  const q = montar({ servidor, hash, memoria: p.memoria });
  await assentar();
  return { p: q, equipe };
}
async function preencher(p, atual, nova, repetir = nova) {
  p.document.querySelector('#sn-atual').value = atual;
  p.document.querySelector('#sn-nova').value = nova;
  p.document.querySelector('#sn-rep').value = repetir;
  p.evento(p.document.querySelector('#form-senha'), 'submit');
  await assentar();
}
const salvo = p => JSON.parse(p.memoria.get('vof_user') || 'null');
const erroNaTela = p => (p.document.querySelector('#sn-erro') || { textContent: '' }).textContent;

/* ───────────── senha provisória: nada abre antes da troca ───────────── */
test('senha provisória: o login leva a #/senha e NENHUMA outra área abre, nem recarregando', async () => {
  const { p } = await entrarPeloLogin({ trocarSenha: true });
  assert.equal(p.sandbox.location.hash, '#/senha');
  assert.ok(p.document.querySelector('#form-senha'), 'o formulário de troca apareceu');
  assert.match(p.texto(), /provisória/, 'o recado diz que a senha é provisória');
  assert.equal(p.document.querySelector('.abas'), null, 'sem a barra de áreas');
  assert.equal(salvo(p).trocarSenha, true, 'a marca ficou guardada');
  const areas = ['#/', '#/inicio', '#/metodo', '#/dinamicas', '#/turmas', '#/diagnostico/novo', '#/plano', '#/apostila', '#/apresentacao', '#/palco/ABC123', '#/controle/ABC123', '#/qualquer'];
  for (const h of areas) {
    await p.irPara(h);
    assert.equal(p.sandbox.location.hash, '#/senha', h + ' voltou para a troca');
    assert.ok(p.document.querySelector('#form-senha'), h + ': formulário');
    assert.equal(p.document.querySelector('.abas'), null, h + ': sem áreas');
    assert.equal(p.document.querySelector('#miolo'), null, h + ': nenhum miolo de área');
    assert.equal(p.document.body.classList.contains('modo-palco'), false, h + ': o palco não abriu');
  }
  assert.equal(p.servidor.doSync().filter(c => c.colecao === 'salas').length, 0, 'palco e controle não chegaram a pedir a sala');
  // F5 no meio: continua preso na troca.
  const { p: q } = await recarregar(p, '#/turmas');
  assert.equal(q.sandbox.location.hash, '#/senha');
  assert.ok(q.document.querySelector('#form-senha'));
  assert.equal(q.document.querySelector('.abas'), null);
});

test('senha provisória: dá para sair (sem senha nenhuma a pessoa não fica presa)', async () => {
  const { p } = await entrarPeloLogin({ trocarSenha: true });
  const sair = p.document.querySelector('#app [data-sair]');
  assert.ok(sair, 'há um botão Sair na tela de troca');
  sair.click();
  await assentar();
  assert.ok(p.document.querySelector('#lg-u'), 'voltou ao login');
  assert.equal(p.memoria.has('vof_cracha'), false);
});

/* ───────────── o que NÃO pode ser enviado ───────────── */
test('senhas novas diferentes, curtas, iguais à atual ou sem a atual NÃO são enviadas', async () => {
  const { p, equipe } = await entrarPeloLogin({ trocarSenha: true });
  await preencher(p, 'provisoria1', 'novaSenha1', 'novaSenha2');
  assert.match(erroNaTela(p), /não são iguais/);
  await preencher(p, 'provisoria1', '12345');
  assert.match(erroNaTela(p), /ao menos 6 caracteres/);
  await preencher(p, 'provisoria1', 'provisoria1');
  assert.match(erroNaTela(p), /diferente da atual/);
  await preencher(p, '', 'novaSenha1');
  assert.match(erroNaTela(p), /senha atual/i);
  assert.equal(equipe.trocas.length, 0, 'nada chegou à equipe-auth');
  assert.equal(p.sandbox.location.hash, '#/senha');
  // Exatamente 6 caracteres já vale (a régua é a da equipe-auth).
  await preencher(p, 'provisoria1', '123456');
  assert.equal(equipe.trocas.length, 1);
});

/* ───────────── ataque e pressa: o que a troca NÃO pode fazer ───────────── */
const SENHAS_DE_TESTE = ['provisoria1', 'certa123', 'errada99', 'novaSenha1', 'minhaSenha9', 'outraSenha2', 'jaTrocada1'];
// Tudo que o aparelho guarda ou mostra fora do formulário: memória, ESTADO, endereço e título.
const rastro = p => JSON.stringify([...p.memoria.entries()]) + p.run('JSON.stringify(ESTADO)') + p.sandbox.location.href + p.document.title;
const camposVazios = (p, onde) => {
  for (const id of ['sn-atual', 'sn-nova', 'sn-rep']) {
    const i = p.document.querySelector('#' + id);
    if (i) assert.equal(i.value, '', id + ' limpo ' + onde);
  }
};

test('sessão que vence no meio da troca (401 que não é a senha atual) leva ao login com recado', async () => {
  const { p, equipe } = await entrarPeloLogin({ trocarSenha: true, falha: { status: 401, corpo: { erro: 'Sessão inválida ou expirada.' } } });
  await preencher(p, 'provisoria1', 'novaSenha1');
  assert.equal(equipe.trocas.length, 1);
  assert.equal(p.document.querySelector('#form-senha'), null, 'o formulário saiu da tela');
  assert.ok(p.document.querySelector('#lg-u'), 'voltou ao login');
  assert.match(p.texto(), /sessão terminou/i, 'o login diz por quê');
  assert.match(p.texto(), /senha não mudou/i, 'e que a senha continua a mesma');
  assert.equal(p.memoria.has('vof_cracha'), false, 'o crachá recusado saiu do aparelho');
  assert.equal(p.memoria.has('vof_user'), false);
  // 401 do gateway, sem a causa da equipe-auth: também é sessão.
  const b = await entrarPeloLogin({ trocarSenha: false, senha: 'certa123', falha: { status: 401, corpo: { message: 'Invalid JWT' } } });
  await b.p.irPara('#/senha');
  await preencher(b.p, 'certa123', 'novaSenha1');
  assert.ok(b.p.document.querySelector('#lg-u'), '401 sem causa também volta ao login');
  // Senha atual errada também é 401, e NÃO derruba a sessão.
  const c = await entrarPeloLogin({ trocarSenha: false, senha: 'certa123' });
  await c.p.irPara('#/senha');
  await preencher(c.p, 'errada99', 'novaSenha1');
  assert.ok(c.p.document.querySelector('#form-senha'), 'senha atual errada fica na troca');
  assert.ok(c.p.memoria.has('vof_cracha'));
  assert.equal(c.p.document.activeElement, c.p.document.querySelector('#sn-atual'), 'o foco volta para a senha atual');
});

test('as senhas não ficam em lugar nenhum: campos limpos depois do erro e do sucesso, nada em ESTADO, no aparelho ou na URL', async () => {
  const { p, equipe } = await entrarPeloLogin({ trocarSenha: false, senha: 'certa123' });
  await p.irPara('#/senha');
  // Erro do servidor: os três campos esvaziam.
  await preencher(p, 'errada99', 'novaSenha1');
  assert.match(erroNaTela(p), /Senha atual incorreta\./);
  camposVazios(p, 'depois do erro');
  // Erro da própria tela (as duas novas diferentes): as novas esvaziam.
  await preencher(p, 'certa123', 'novaSenha1', 'novaSenha2');
  assert.equal(p.document.querySelector('#sn-nova').value, '');
  assert.equal(p.document.querySelector('#sn-rep').value, '');
  // Sucesso.
  await preencher(p, 'certa123', 'minhaSenha9');
  camposVazios(p, 'depois do sucesso');
  assert.equal(equipe.senha, 'minhaSenha9');
  const r = rastro(p);
  for (const s of SENHAS_DE_TESTE) assert.equal(r.includes(s), false, s + ' ficou guardada fora do formulário');
  // A senha só vai no corpo do POST: nunca no endereço nem no cabeçalho.
  assert.equal(equipe.trocas.length, 2);
  for (const t of equipe.trocas) {
    assert.match(t.url, /\/equipe-auth$/);
    for (const s of SENHAS_DE_TESTE) {
      assert.equal(t.url.includes(s), false, 'senha na URL');
      assert.equal(t.cabecalhos.includes(s), false, 'senha no cabeçalho');
    }
  }
});

test('o botão não envia duas vezes, nem com a tela redesenhada no meio da espera', async () => {
  const { p, equipe } = await entrarPeloLogin({ trocarSenha: true, segurar: true });
  p.document.querySelector('#sn-atual').value = 'provisoria1';
  p.document.querySelector('#sn-nova').value = 'minhaSenha9';
  p.document.querySelector('#sn-rep').value = 'minhaSenha9';
  const form = p.document.querySelector('#form-senha');
  p.evento(form, 'submit'); p.evento(form, 'submit');
  await assentar();
  assert.equal(equipe.trocas.length, 1, 'dois toques, um envio');
  const bt = p.document.querySelector('#sn-salvar');
  assert.equal(bt.disabled, true);
  assert.match(bt.textContent, /Salvando/);
  // Trocar o hash na mão no meio da espera redesenha a troca: o botão novo continua travado.
  await p.irPara('#/turmas');
  assert.equal(p.sandbox.location.hash, '#/senha');
  const bt2 = p.document.querySelector('#sn-salvar');
  assert.notEqual(bt2, bt, 'a tela foi redesenhada');
  assert.equal(bt2.disabled, true, 'o botão novo sabe que há um envio em voo');
  await preencher(p, 'provisoria1', 'outraSenha2');
  assert.equal(equipe.trocas.length, 1, 'a tela redesenhada não abriu um segundo envio');
  // A resposta chega depois do redesenho e ainda leva adiante.
  equipe.soltar();
  await assentar();
  assert.equal(equipe.senha, 'minhaSenha9');
  assert.equal(p.sandbox.location.hash, '#/');
  assert.ok(p.document.querySelector('.abas'), 'as áreas abriram');
  assert.notEqual(salvo(p).trocarSenha, true);
  for (const s of SENHAS_DE_TESTE) assert.equal(rastro(p).includes(s), false, s);
});

test('resposta que chega com a pessoa em outra área vira aviso, sem puxar a tela de volta', async () => {
  const a = await entrarPeloLogin({ trocarSenha: false, senha: 'certa123', segurar: true });
  await a.p.irPara('#/senha');
  await preencher(a.p, 'errada99', 'novaSenha1');
  await a.p.irPara('#/turmas');
  a.equipe.soltar();
  await assentar();
  assert.equal(a.p.sandbox.location.hash, '#/turmas', 'ficou onde estava');
  assert.match(a.p.document.querySelector('#toasts').textContent, /Senha atual incorreta/);
  const b = await entrarPeloLogin({ trocarSenha: false, senha: 'certa123', segurar: true });
  await b.p.irPara('#/senha');
  await preencher(b.p, 'certa123', 'novaSenha1');
  await b.p.irPara('#/turmas');
  b.equipe.soltar();
  await assentar();
  assert.equal(b.p.sandbox.location.hash, '#/turmas');
  assert.match(b.p.document.querySelector('#toasts').textContent, /Senha trocada/);
  // Voltou para a troca depois: o botão está solto de novo.
  await b.p.irPara('#/senha');
  assert.equal(b.p.document.querySelector('#sn-salvar').disabled, false);
});

test('senha provisória que já foi trocada em outro lugar: o erro diz para usar a senha nova', async () => {
  const { p, equipe } = await entrarPeloLogin({ trocarSenha: true });
  // A pessoa trocou em outro sistema depois de entrar aqui: a equipe-auth agora confere a atual.
  equipe.trocarSenha = false; equipe.senha = 'jaTrocada1';
  await preencher(p, 'provisoria1', 'minhaSenha9');
  assert.match(erroNaTela(p), /Senha atual incorreta\./);
  assert.match(erroNaTela(p), /já trocou/);
  await preencher(p, 'jaTrocada1', 'minhaSenha9');
  assert.equal(p.sandbox.location.hash, '#/');
});

/* ───────────── o erro da equipe-auth aparece com a causa ───────────── */
test('erro da equipe-auth aparece com a causa, a sessão continua e a provisória segue obrigatória', async () => {
  const { p, equipe } = await entrarPeloLogin({ trocarSenha: true, falha: { status: 500, corpo: { erro: 'Falha ao gravar no banco.' } } });
  await preencher(p, 'provisoria1', 'novaSenha1');
  assert.equal(equipe.trocas.length, 1);
  assert.match(erroNaTela(p), /Falha ao gravar no banco\./);
  assert.ok(p.memoria.has('vof_cracha'), 'erro do servidor não derruba a sessão');
  assert.equal(p.sandbox.location.hash, '#/senha');
  assert.equal(salvo(p).trocarSenha, true, 'a marca continua: a senha não mudou');
  assert.equal(p.document.querySelector('#sn-salvar').disabled, false, 'o botão volta para tentar de novo');
  camposVazios(p, 'depois do erro do servidor');
  await p.irPara('#/turmas');
  assert.equal(p.sandbox.location.hash, '#/senha');
});

test('senha atual errada, conta sem senha aqui e falta de rede: cada um com a sua causa', async () => {
  // Senha atual errada (senha não provisória: a equipe-auth confere).
  const a = await entrarPeloLogin({ trocarSenha: false, senha: 'certa123' });
  await a.p.irPara('#/senha');
  await preencher(a.p, 'errada99', 'novaSenha1');
  assert.match(erroNaTela(a.p), /Senha atual incorreta\./);
  assert.equal(a.equipe.senha, 'certa123');
  // Conta que não existe na equipe-auth (acesso só pela entrada única).
  const b = await abrirPeloPainel({ contaExiste: false });
  await preencher(b.p, 'qualquer1', 'novaSenha1');
  assert.match(erroNaTela(b.p), /Conta não encontrada\./);
  assert.match(erroNaTela(b.p), /Minha conta/);
  // Sem rede: não finge que trocou nem que nada mudou.
  const c = await entrarPeloLogin({ trocarSenha: false, senha: 'certa123', falha: 'rede' });
  await c.p.irPara('#/senha');
  await preencher(c.p, 'certa123', 'novaSenha1');
  assert.match(erroNaTela(c.p), /Sem resposta do servidor/);
});

test('recado do servidor na troca não vira código (erro e avisos)', async () => {
  const carga = '<img src=x onerror=alert(1)>';
  const a = await entrarPeloLogin({ trocarSenha: true, falha: { status: 400, corpo: { erro: carga } } });
  await preencher(a.p, 'provisoria1', 'novaSenha1');
  assert.ok(erroNaTela(a.p).includes(carga), 'o texto aparece como texto');
  assert.equal(a.p.document.querySelector('#app img[src=x]'), null);
  const b = await entrarPeloLogin({ trocarSenha: true, avisos: [carga] });
  await preencher(b.p, 'provisoria1', 'novaSenha1');
  assert.ok(b.p.texto().includes(carga));
  assert.equal(b.p.document.querySelector('#app img[src=x]'), null);
});

/* ───────────── a troca bem sucedida ───────────── */
test('troca bem sucedida: manda o crachá do V.O.F., limpa a marca e libera as áreas', async () => {
  const { p, equipe } = await entrarPeloLogin({ trocarSenha: true });
  await preencher(p, 'provisoria1', 'minhaSenha9');
  assert.equal(equipe.trocas.length, 1);
  const t = equipe.trocas[0];
  assert.equal(t.sistema, 'vof');
  assert.equal(t.senhaAtual, 'provisoria1');
  assert.equal(t.novaSenha, 'minhaSenha9');
  assert.equal(t.auth, 'Bearer ' + p.memoria.get('vof_cracha'), 'o crachá do V.O.F. vai no Authorization');
  assert.equal(p.sandbox.location.hash, '#/');
  assert.ok(p.document.querySelector('.abas'), 'as áreas voltaram');
  assert.equal(p.document.querySelector('#form-senha'), null);
  assert.notEqual(salvo(p).trocarSenha, true, 'a marca saiu do aparelho');
  assert.match(p.document.querySelector('#toasts').textContent, /Senha trocada/);
  await p.irPara('#/turmas');
  assert.equal(p.sandbox.location.hash, '#/turmas');
  assert.match(p.texto(), /Turma Fictícia/);
  const { p: q } = await recarregar(p, '#/turmas');
  assert.equal(q.sandbox.location.hash, '#/turmas', 'recarregar não volta para a troca');
  assert.ok(q.document.querySelector('.abas'));
});

test('troca com avisos: diz onde a senha nova não chegou e deixa seguir', async () => {
  const { p } = await entrarPeloLogin({ trocarSenha: true, avisos: ['painel: tabela ocupada'] });
  await preencher(p, 'provisoria1', 'minhaSenha9');
  assert.match(p.texto(), /painel: tabela ocupada/);
  assert.notEqual(salvo(p).trocarSenha, true);
  const seguir = p.document.querySelector('#app a[href="#/"][data-seguir]');
  assert.ok(seguir, 'há um caminho para seguir');
  await p.irPara('#/turmas');
  assert.equal(p.sandbox.location.hash, '#/turmas');
});

/* ───────────── o link no topo ───────────── */
test('o link "Trocar minha senha" fica no topo, entre o nome e o Sair, e abre a troca', async () => {
  const { p } = await entrarPeloLogin({ trocarSenha: false });
  const linha = p.document.querySelector('.cab-linha');
  const filhos = [...linha.children].map(el => el.getAttribute('data-trocar-senha') !== null ? 'senha' : el.hasAttribute('data-sair') ? 'sair' : el.className);
  assert.deepEqual(filhos, ['cab-marca', 'cab-quem', 'senha', 'sair']);
  const link = linha.querySelector('[data-trocar-senha]');
  assert.equal(link.tagName, 'A');
  assert.equal(link.getAttribute('href'), '#/senha');
  assert.equal(link.getAttribute('aria-label'), 'Trocar minha senha');
  assert.match(link.textContent, /Trocar minha senha/);
  assert.ok(link.classList.contains('botao'), 'alvo de navegação da casa');
  await p.irPara('#/senha');
  assert.ok(p.document.querySelector('#form-senha'));
  assert.ok(p.document.querySelector('.abas'), 'fora da provisória, a troca abre dentro do app');
  assert.equal(p.document.querySelector('[data-trocar-senha]').getAttribute('aria-current'), 'page');
  assert.equal(p.document.querySelector('[data-recado-painel]'), null, 'quem entrou por aqui não recebe o recado do Painel');
});

test('alvos de toque: o link é navegação (44 px) e nenhuma regra dele desce disso', () => {
  const css = ler('styles.css');
  const botao = /\.botao\s*\{([^}]*)\}/.exec(css)[1];
  assert.ok(Number(/min-height:\s*(\d+)px/.exec(botao)[1]) >= 44);
  const regras = [...css.matchAll(/([^{}]*\.cab-senha[^{}]*)\{([^}]*)\}/g)];
  assert.ok(regras.length > 0, 'há regra para o link');
  for (const [, sel, corpo] of regras) {
    const m = /min-height:\s*(\d+)px/.exec(corpo);
    if (m) assert.ok(Number(m[1]) >= 44, sel.trim() + ' baixa o alvo');
    assert.doesNotMatch(corpo, /(^|[^-])height:\s*([0-3]?\d)px/, sel.trim() + ' fixa altura pequena');
  }
});

/* ───────────── o formulário ───────────── */
test('formulário: três senhas com type e autocomplete certos, cada uma com rótulo', async () => {
  const { p } = await entrarPeloLogin({ trocarSenha: true });
  const form = p.document.querySelector('#form-senha');
  for (const i of form.querySelectorAll('input')) assert.ok(i.getAttribute('type'), 'input sem type: ' + i.outerHTML);
  const esperado = { 'sn-atual': 'current-password', 'sn-nova': 'new-password', 'sn-rep': 'new-password' };
  for (const [id, ac] of Object.entries(esperado)) {
    const i = form.querySelector('#' + id);
    assert.equal(i.getAttribute('type'), 'password', id);
    assert.equal(i.getAttribute('autocomplete'), ac, id);
    assert.ok(form.querySelector('label[for="' + id + '"]'), 'rótulo de ' + id);
  }
  const u = form.querySelector('input[autocomplete="username"]');
  assert.ok(u, 'o gerenciador de senhas sabe de quem é a senha');
  assert.equal(u.getAttribute('type'), 'text');
  assert.equal(u.getAttribute('value'), 'zz_facilitadora');
  assert.equal(form.querySelector('#sn-nova').getAttribute('minlength'), '6', 'o mínimo é o da equipe-auth');
});

/* ───────────── entrada única ───────────── */
test('entrada única: crachá plantado pelo Painel mostra o recado e o formulário mesmo assim', async () => {
  const { p, equipe } = await abrirPeloPainel();
  assert.equal(p.sandbox.location.hash, '#/senha', 'não é obrigatório: é a pessoa que abre');
  const recado = p.document.querySelector('[data-recado-painel]');
  assert.ok(recado, 'o recado apareceu');
  assert.ok(recado.textContent.includes(RECADO_PAINEL), recado.textContent);
  assert.match(recado.textContent, /também no Painel/, 'diz que a troca daqui vale no Painel');
  assert.ok(p.document.querySelector('#form-senha'), 'o formulário aparece mesmo assim');
  await preencher(p, 'senhaDoPainel1', 'novaSenha1');
  assert.equal(equipe.trocas.length, 1);
  assert.equal(equipe.senha, 'novaSenha1');
});

test('entrada única: o Painel plantar um crachá novo depois do login daqui também conta', async () => {
  const { p } = await entrarPeloLogin({ trocarSenha: false });
  assert.equal(salvo(p).via, 'login');
  await p.irPara('#/senha');
  assert.equal(p.document.querySelector('[data-recado-painel]'), null);
  // A pessoa entra no Painel: ele grava o crachá dele por cima do nosso.
  p.memoria.set('vof_cracha', crachaFalso({ exp: Math.floor(Date.now() / 1000) + 99999 }));
  const { p: q } = await recarregar(p, '#/senha');
  assert.ok(q.document.querySelector('[data-recado-painel]'), 'crachá que o login daqui não recebeu é da entrada única');
  // Usuário salvo antes desta versão, sem a marca do login: não dá para dizer que entrou por aqui.
  const r = await abrirPeloPainel({ usuarioSalvo: { usuario: 'zz_facilitadora', nome: 'Facilitadora de Teste', papel: 'facilitador' } });
  assert.ok(r.p.document.querySelector('[data-recado-painel]'));
});

test('entrada única NÃO herda senha provisória de um login antigo', async () => {
  const { p } = await entrarPeloLogin({ trocarSenha: true });
  assert.equal(p.sandbox.location.hash, '#/senha');
  p.memoria.set('vof_cracha', crachaFalso({ exp: Math.floor(Date.now() / 1000) + 99999 }));
  const { p: q } = await recarregar(p, '#/turmas');
  assert.equal(q.sandbox.location.hash, '#/turmas', 'crachá do Painel não carrega a marca do login anterior');
});

/* ───────────── texto e CSP ───────────── */
test('telas de senha sem travessão, sem script e sem on*', async () => {
  const telas = [];
  const a = await entrarPeloLogin({ trocarSenha: true }); telas.push(['provisória', a.p]);
  const b = await abrirPeloPainel(); telas.push(['entrada única', b.p]);
  const c = await entrarPeloLogin({ trocarSenha: false }); await c.p.irPara('#/senha'); telas.push(['normal', c.p]);
  for (const [nome, p] of telas) {
    const app = p.document.querySelector('#app');
    const t = app.textContent + ' ' + p.document.title;
    assert.equal(t.indexOf(TRAVESSAO), -1, nome);
    assert.equal(t.indexOf(MEIA_RISCA), -1, nome);
    assert.equal(app.querySelectorAll('script').length, 0, nome);
    for (const el of app.querySelectorAll('*')) for (const at of el.getAttributeNames()) assert.ok(!/^on/i.test(at), nome + ': ' + at + ' em <' + el.tagName + '>');
  }
  for (const f of ['tests/senha.test.mjs', 'app.js', 'auth.js', 'store.js', 'styles.css']) {
    const t = ler(f);
    assert.equal(t.indexOf(TRAVESSAO), -1, f);
    assert.equal(t.indexOf(MEIA_RISCA), -1, f);
  }
});

test('auth.js: trocarMinhaSenha no formato do POPs, com o crachá', () => {
  const fonte = ler('auth.js');
  assert.match(fonte, /trocarMinhaSenha\(senhaAtual, novaSenha\) \{\s*return chamar\('trocarMinhaSenha', \{ senhaAtual, novaSenha \}, true\);/);
});
