// ============================================================================
// app.js: Método V.O.F., o sistema próprio (Venda, Operação e Finanças,
// sustentadas por Pessoas e Gestores).
//
// Quem usa: o Léo (admin) e os facilitadores, com o login da casa (crachá da
// entrada única). Participante de turma NÃO tem conta.
// Papéis: admin faz tudo; facilitador lê tudo, cria e edita turmas, empresas,
// diagnósticos, planos e salas, e não apaga. O servidor confere de novo em
// toda escrita: esconder botão aqui é conforto, não segurança.
//
// O conteúdo do método (metodo.js, window.VOFMetodo) é de outro dono e chega
// pronto. Esta casca só chama: render, PRATICAS, DIMENSOES, pontuar, slides e
// abrirApresentacao. Se metodo.js faltar, cada área diz isso com todas as
// letras em vez de quebrar a tela.
//
// Três regras de tela que já custaram caro nos apps vanilla da casa:
// 1. Estado de interface mora no objeto ESTADO, nunca em variável solta.
// 2. Digitação não se perde por redesenho: todo campo de edição grava no
//    rascunho a cada tecla, e o redesenho relê do rascunho. Enquanto alguém
//    digita ou edita, atualização vinda do servidor não redesenha a tela.
// 3. Alvo de toque: 44 px para navegação, 40 px para controle (styles.css).
// ============================================================================

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const novoId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
};
const doisDigitos = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + doisDigitos(d.getMonth() + 1) + '-' + doisDigitos(d.getDate());
// Data de hoje no fuso do aparelho. toISOString() daria o dia de Greenwich e,
// depois das 21h no Brasil, gravaria o dia seguinte.
const hojeISO = () => ymd(new Date());
const dataValida = iso => typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !isNaN(new Date(iso + 'T12:00:00').getTime());
const fmtData = iso => { if (!dataValida(iso)) return ''; const p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
const somarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
function fmtHora(iso) {
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  const h = doisDigitos(d.getHours()) + ':' + doisDigitos(d.getMinutes());
  return ymd(d) === hojeISO() ? h : fmtData(ymd(d)) + ' às ' + h;
}
const primeiroNome = nome => String(nome || '').trim().split(/\s+/)[0] || '';
const hashTexto = s => { let h = 5381; const t = norm(s); for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h.toString(36); };
const ordenarPorNome = xs => xs.slice().sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
const metodo = () => (typeof window !== 'undefined' && window.VOFMetodo && typeof window.VOFMetodo === 'object') ? window.VOFMetodo : null;

const MOMENTOS = [['linha_de_base', 'Linha de base'], ['dia_30', 'Dia 30'], ['dia_60', 'Dia 60'], ['dia_90', 'Dia 90'], ['outro', 'Outro momento']];
const rotuloMomento = m => (MOMENTOS.find(x => x[0] === m) || [m, m || 'sem momento'])[1];
const STATUS_TURMA = ['planejada', 'em andamento', 'concluída'];
const FASES = [['Dia 0', 0], ['Até dia 30', 30], ['Até dia 60', 60], ['Até dia 90', 90]];
const PAPEIS = { admin: 'Administrador', facilitador: 'Facilitador' };
const AREAS = [
  ['inicio', 'Início'], ['metodo', 'Método'], ['dinamicas', 'Dinâmicas e APN'], ['turmas', 'Turmas e empresas'],
  ['diagnostico', 'Diagnóstico'], ['plano', 'Plano de 90 dias'], ['apostila', 'Apostila'], ['apresentacao', 'Apresentação'],
];

/* ══════════ estado de interface ══════════ */
const ESTADO = {
  sessao: null,
  recadoLogin: '',
  loginUsuario: '',
  rota: { nome: 'inicio', arg: '' },
  sync: { estado: 'nunca', erro: '' },
  metodoNo: null,
  metodoCtl: null,
  apn: { secao: 'dinamicas', pilar: '', busca: '', modulo: '', erro: '' },
  turmas: { status: '' },
  diag: { alvo: '', rascunho: null },
  plano: { rascunhos: {} },
  apostila: { estado: '', url: '', expira: '', erro: '' },
  apres: { slides: null, indice: 0, modo: 'apresentar', escuro: false, barraTimer: null, avisoSala: false },
  sala: { codigo: '', rev: null, emVoo: false, desejado: null, escritoEm: 0, conexao: '', erro: '', ultimo: null },
  poll: null,
  redesenhoPendente: false,
};

const souAdmin = () => !!(ESTADO.sessao && ESTADO.sessao.papel === 'admin');
const podeEditar = () => !!(ESTADO.sessao && (ESTADO.sessao.papel === 'admin' || ESTADO.sessao.papel === 'facilitador'));
const rotuloPapel = p => PAPEIS[p] || (p ? p : 'sem papel');

/* ══════════ avisos, janelas e helpers de formulário ══════════ */
function toast(msg, tipo) {
  const caixa = $('#toasts'); if (!caixa) return;
  const t = document.createElement('div');
  t.className = 'toast' + (tipo ? ' ' + tipo : '');
  t.textContent = msg;
  caixa.appendChild(t);
  setTimeout(() => t.remove(), tipo === 'erro' ? 8000 : 4500);
}
function avisoHTML(texto, tipo) { return '<div class="aviso ' + (tipo || 'azul') + '">' + esc(texto) + '</div>'; }

// Janela sobre a tela. Mora em #overlays, fora de #app: redesenhar a página
// não apaga o que se digita aqui. Formulário não fecha com toque fora nem com
// Esc, para ninguém perder o que escreveu por um toque errado.
function abrirModal(html, rotulo, opcoes) {
  const formulario = !!(opcoes && opcoes.formulario);
  const veu = document.createElement('dialog');
  veu.className = 'veu';
  if (formulario) veu.setAttribute('data-formulario', '');
  veu.innerHTML = '<div class="modal">' + html + '</div>';
  veu.setAttribute('aria-label', rotulo || 'Janela');
  veu.fechar = () => {
    try { if (typeof veu.close === 'function' && veu.open) veu.close(); } catch {}
    veu.remove();
    if (ESTADO.redesenhoPendente) talvezRedesenhar();
  };
  veu.addEventListener('cancel', e => { e.preventDefault(); if (!formulario) veu.fechar(); });
  veu.addEventListener('click', e => {
    if (e.target === veu && !formulario) veu.fechar();
    const f = e.target.closest && e.target.closest('[data-fechar]');
    if (f) veu.fechar();
  });
  $('#overlays').appendChild(veu);
  if (typeof veu.showModal === 'function') { try { veu.showModal(); } catch { veu.setAttribute('open', ''); } }
  else veu.setAttribute('open', '');
  return veu;
}
const campo = (rotulo, controle, dica) => '<div class="campo"><label>' + esc(rotulo) + controle + '</label>' + (dica ? '<p class="dica">' + esc(dica) + '</p>' : '') + '</div>';
const opcoesHTML = (lista, atual) => lista.map(([v, t]) => '<option value="' + esc(v) + '"' + (String(v) === String(atual ?? '') ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
// Marca a opção pelo atributo e pela propriedade: o atributo serve ao HTML
// ainda intocado, a propriedade ao select que a pessoa já mexeu.
function marcarOpcao(sel, valor) {
  $$('option', sel).forEach(o => {
    const sim = o.getAttribute('value') === String(valor);
    if (sim) o.setAttribute('selected', ''); else o.removeAttribute('selected');
    try { if ('selected' in o && typeof o.selected === 'boolean') o.selected = sim; } catch {}
  });
}
function estaDigitando() {
  const a = document.activeElement;
  return !!(a && a.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest && a.closest('#app'));
}
function temJanelaAberta() { return !!$('#overlays dialog'); }

/* ══════════ sessão ══════════ */
// Crachá sem usuário salvo é o caso da ENTRADA ÚNICA (o Painel planta só o
// crachá). O dono sai do próprio crachá. Crachá de outra pessoa que não a
// salva (aparelho dividido): vale o dono do crachá, que é quem o servidor vê.
function sessaoInicial() {
  const salvo = STORE.getUser();
  if (!AUTH.temCracha()) { if (salvo) STORE.setUser(null); return null; }
  const dono = AUTH.dono();
  if (!dono) {
    AUTH.esquecer(); STORE.setUser(null);
    ESTADO.recadoLogin = 'Seu acesso venceu ou não é deste sistema. Entre de novo.';
    return null;
  }
  if (!salvo || salvo.usuario !== dono.usuario || salvo.papel !== dono.papel || salvo.nome !== dono.nome) STORE.setUser(dono);
  return { usuario: dono.usuario, nome: dono.nome, papel: dono.papel };
}
function encerrarSessao(recado) {
  pararPoll();
  sairTelaCheia();
  // A sala do método deixa o fundo inerte: aberta, ela prenderia a tela de login atrás dela.
  try { const m = metodo(); if (m && typeof m.fecharApresentacao === 'function') m.fecharApresentacao(); } catch {}
  AUTH.esquecer(); STORE.setUser(null);
  ESTADO.sessao = null;
  ESTADO.recadoLogin = recado || '';
  ESTADO.metodoNo = null;
  ESTADO.metodoCtl = null;
  ESTADO.diag.rascunho = null;
  ESTADO.plano.rascunhos = {};
  ESTADO.sync = { estado: 'nunca', erro: '' };
  $$('#overlays dialog').forEach(d => d.remove());
  renderApp();
}
function sairDaConta() {
  const fazer = () => { STORE.limparConta(); location.hash = '#/'; encerrarSessao(''); };
  const n = STORE.contarRascunhos();
  if (!n) { fazer(); return; }
  const veu = abrirModal('<h2>Sair</h2><p>Há ' + n + ' rascunho(s) neste aparelho que ainda não foram salvos no servidor. Sair apaga esses rascunhos.</p>' +
    '<div class="acoes"><button type="button" class="botao perigo" data-sim>Sair e apagar</button><button type="button" class="botao fantasma" data-fechar>Continuar aqui</button></div>', 'Sair');
  $('[data-sim]', veu).addEventListener('click', () => { veu.fechar(); fazer(); });
}
function confirmarSessao() {
  const quem = ESTADO.sessao && ESTADO.sessao.usuario;
  STORE.atualizar();
  AUTH.eu().then(r => {
    if (!ESTADO.sessao || ESTADO.sessao.usuario !== quem) return;
    if (r === false) { encerrarSessao('Sua sessão terminou. Entre de novo.'); return; }
    if (!r || !r.usuario) return;
    // O papel que vale é o do CRACHÁ: é ele que o vof-sync confere em cada
    // escrita. Se a gestão mudou o papel, a tela avisa em vez de fingir que
    // já mudou (botão que o servidor recusaria, ou botão que some sem motivo).
    if (r.papel && r.papel !== ESTADO.sessao.papel) toast('Seu papel no V.O.F. mudou para ' + rotuloPapel(r.papel) + '. Saia e entre de novo para valer.');
    if (r.nome && r.nome !== ESTADO.sessao.nome) { ESTADO.sessao = Object.assign({}, ESTADO.sessao, { nome: r.nome }); talvezRedesenhar(); }
  }).catch(() => {});
}

STORE.on('sessao', msg => { if (ESTADO.sessao) encerrarSessao(msg || 'Sua sessão terminou. Entre de novo.'); });
STORE.on('quota', () => toast('A memória deste aparelho está cheia. O que for gravado no servidor fica salvo, mas a cópia local pode não guardar.', 'erro'));
STORE.on('atualizando', () => { ESTADO.sync = { estado: 'atualizando', erro: '' }; pintarFaixa(); });
STORE.on('erroAtualizar', msg => { ESTADO.sync = { estado: 'erro', erro: msg }; pintarFaixa(); talvezRedesenhar(); });
STORE.on('dados', () => { ESTADO.sync = { estado: 'ok', erro: '' }; pintarFaixa(); talvezRedesenhar(); });

// Redesenha só quando ninguém está no meio de uma edição, e só as áreas que
// mostram turmas, empresas, diagnósticos e planos. Dinâmicas (item aberto
// para leitura), apresentação (código digitado), método, palco e controle não
// dependem desses dados e nunca são redesenhados de fora.
// Editor (diagnóstico, plano) só é redesenhado de fora enquanto ainda espera o
// registro chegar (link aberto direto, aparelho sem cópia): sem isto, ficava
// em "Buscando os dados" para sempre, com os dados já na memória.
const AREAS_COM_DADOS = ['inicio', 'turmas', 'diagnostico', 'plano'];
function podeRedesenhar() {
  if (!ESTADO.sessao) return false;
  if (temJanelaAberta() || estaDigitando()) return false;
  const r = ESTADO.rota;
  if (!AREAS_COM_DADOS.includes(r.nome)) return false;
  if (r.arg && !$('#miolo [data-aguardando]')) return false;
  return true;
}
function talvezRedesenhar() {
  if (podeRedesenhar()) { ESTADO.redesenhoPendente = false; renderApp({ manterRolagem: true }); }
  else ESTADO.redesenhoPendente = true;
}

/* ══════════ cabeçalho ══════════ */
function textoFaixa() {
  const em = STORE.atualizadoEm();
  if (ESTADO.sync.estado === 'atualizando') return em ? 'Atualizando. Dados de ' + fmtHora(em) + '.' : 'Buscando os dados no servidor…';
  if (ESTADO.sync.estado === 'erro') return (em ? 'Mostrando os dados de ' + fmtHora(em) + '. ' : 'Ainda sem dados deste aparelho. ') + 'Não consegui atualizar: ' + ESTADO.sync.erro;
  return em ? 'Dados atualizados em ' + fmtHora(em) + '.' : 'Buscando os dados no servidor…';
}
function pintarFaixa() {
  const f = $('#faixa-sync'); if (!f) return;
  $('[data-faixa-texto]', f).textContent = textoFaixa();
  f.classList.toggle('erro', ESTADO.sync.estado === 'erro');
}
function htmlCab(ativa) {
  const s = ESTADO.sessao;
  return '<header class="cab">' +
    '<div class="cab-linha">' +
    '<a class="cab-marca" href="#/"><img src="./icone-192.png" alt="" width="40" height="40"><span><b>Método V.O.F.</b><small>Venda, Operação e Finanças</small></span></a>' +
    '<div class="cab-quem" aria-label="Quem entrou"><b data-quem-nome>' + esc(s.nome) + '</b><small data-quem-papel>' + esc(rotuloPapel(s.papel)) + '</small></div>' +
    '<button type="button" class="botao fantasma-claro cab-sair" data-sair>Sair</button>' +
    '</div>' +
    '<nav class="abas" aria-label="Áreas do sistema">' +
    AREAS.map(([id, nome]) => '<a href="#/' + id + '"' + (id === ativa ? ' class="ativa" aria-current="page"' : '') + '>' + esc(nome) + '</a>').join('') +
    '</nav>' +
    '<div class="faixa-sync" id="faixa-sync" role="status"><span data-faixa-texto>' + esc(textoFaixa()) + '</span><button type="button" class="botao mini fantasma" data-atualizar>Atualizar</button></div>' +
    '</header>';
}
function ligarCab() {
  const sair = $('[data-sair]');
  if (sair) sair.addEventListener('click', sairDaConta);
  // No celular a barra de áreas rola de lado: a aba atual vem para o meio.
  const nav = $('.abas'), ativa = $('.abas .ativa');
  if (nav && ativa && Number.isFinite(ativa.offsetLeft) && Number.isFinite(nav.clientWidth)) nav.scrollLeft = Math.max(0, ativa.offsetLeft - (nav.clientWidth - ativa.clientWidth) / 2);
  const at = $('[data-atualizar]');
  if (at) at.addEventListener('click', () => { STORE.atualizar(); if (ESTADO.rota.nome === 'dinamicas') recarregarConteudo(); });
  pintarFaixa();
}
const pagina = (ativa, miolo, classe) => htmlCab(ativa) + '<main class="miolo' + (classe ? ' ' + classe : '') + '" id="miolo">' + miolo + '</main>';
const tituloArea = (h1, p) => '<div class="titulo-area"><h1>' + esc(h1) + '</h1>' + (p ? '<p>' + esc(p) + '</p>' : '') + '</div>';
// Zero não é resultado: sem nenhuma carga do servidor, lista vazia diz isso.
function vazioHonesto(texto) {
  if (!STORE.atualizadoEm()) return ESTADO.sync.estado === 'erro'
    ? '<p class="vazio">Ainda não há dados neste aparelho: ' + esc(ESTADO.sync.erro) + '</p>'
    : '<p class="vazio">Buscando os dados no servidor…</p>';
  return '<p class="vazio">' + esc(texto) + '</p>';
}

/* ══════════ login ══════════ */
function renderLogin(app) {
  document.body.classList.remove('modo-palco');
  document.title = 'Entrar · Método V.O.F.';
  app.innerHTML =
    '<div class="tela-login"><form class="cartao-login" id="form-login" novalidate>' +
    '<img src="./icone-192.png" alt="" width="84" height="84">' +
    '<h1>Método V.O.F.</h1>' +
    '<p class="sub2">Entre com a sua conta da casa, a mesma do Painel.</p>' +
    (ESTADO.recadoLogin ? '<div class="aviso amarelo" role="alert">' + esc(ESTADO.recadoLogin) + '</div>' : '') +
    '<div class="campo"><label for="lg-u">Usuário</label><input id="lg-u" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" value="' + esc(ESTADO.loginUsuario) + '"></div>' +
    '<div class="campo"><label for="lg-s">Senha</label><input id="lg-s" type="password" autocomplete="current-password"></div>' +
    '<div id="lg-erro" role="alert"></div>' +
    '<button class="botao largo" type="submit" id="lg-entrar">Entrar</button>' +
    '<p class="dica centro">Quem entra pelo Painel já chega aqui com o acesso aberto. Participantes das turmas não têm conta.</p>' +
    '</form></div>';
  const form = $('#form-login');
  $('#lg-u').addEventListener('input', e => { ESTADO.loginUsuario = e.target.value; });
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const u = $('#lg-u').value.trim(), s = $('#lg-s').value;
    const erro = $('#lg-erro');
    if (!u || !s) { erro.innerHTML = avisoHTML('Preencha usuário e senha.', 'vermelho'); return; }
    const bt = $('#lg-entrar'); bt.disabled = true; bt.textContent = 'Entrando…';
    try {
      const r = await AUTH.login(u, s);
      STORE.setUser({ usuario: r.usuario, nome: r.nome || r.usuario, papel: r.papel });
      ESTADO.sessao = { usuario: r.usuario, nome: r.nome || r.usuario, papel: r.papel };
      ESTADO.recadoLogin = ''; ESTADO.loginUsuario = '';
      renderApp();
      confirmarSessao();
    } catch (e) {
      bt.disabled = false; bt.textContent = 'Entrar';
      const msg = e.rede ? 'Sem conexão: o primeiro acesso precisa de internet.'
        : (e.erro || (e.status === 401 ? 'Usuário ou senha incorretos.' : e.message || 'Não consegui entrar.'));
      erro.innerHTML = avisoHTML(msg, 'vermelho');
    }
  });
}

/* ══════════ início ══════════ */
function prazoDaFase(dia0, fase) {
  const f = FASES.find(x => x[0] === fase);
  if (!dataValida(dia0) || !f) return '';
  return somarDias(dia0, f[1]);
}
function proximosMarcos() {
  const turmas = STORE.col('turmas'), hoje = hojeISO(), lista = [];
  STORE.col('planos').forEach(p => {
    const t = turmas.find(x => x.id === p.turmaId);
    if (!t || t.status === 'concluída') return;
    (Array.isArray(p.marcos) ? p.marcos : []).forEach(m => {
      if (!m || m.feito) return;
      const prazo = prazoDaFase(p.dia0, m.fase);
      lista.push({ turma: t, plano: p, marco: m, prazo, atrasado: !!prazo && prazo < hoje });
    });
  });
  return lista.sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'));
}
function nomeAlvo(tipo, id) {
  const r = STORE.um(tipo === 'empresa' ? 'empresas' : 'turmas', id);
  return r ? (r.nome || 'Sem nome') : (tipo === 'empresa' ? 'Empresa removida' : 'Turma removida');
}
const porDataDesc = (a, b) => String(b.data || '').localeCompare(String(a.data || '')) || String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || ''));

// O propósito que abre a tela inicial. Texto aprovado pelo Léo em 26/09/2026;
// cada ideia vem do caderno e da arquitetura do método: o slogan (arquitetura
// p. 4, caderno p. 179), heroísmo e sistema (arquitetura p. 22 e 29), a carta
// de 2030 (caderno p. 15), clareza e reconhecimento (caderno p. 60 e 67), o
// caixa que avisa antes (caderno p. 49 e 54), a promessa possível (caderno
// p. 32), uma restrição por vez em 90 dias (caderno p. 4 e 17), o fechamento
// de toda conversa (caderno p. 86) e as decisões 4D (caderno p. 97).
// Não reescrever sem o Léo: o teste da tela inicial confere palavra por palavra.
const PROPOSITO = Object.freeze({
  titulo: 'Pessoas que performam. Negócios que prosperam.',
  texto: 'Cada turma trabalha para que a empresa deixe de funcionar por heroísmo e passe a funcionar como sistema: o dono com tempo para a própria vida, a equipe que sabe o que se espera dela e é reconhecida, o caixa que avisa antes e o cliente que recebe o combinado. Uma restrição por vez, em ciclos de 90 dias.',
  chamada: 'Comece pelo que já foi combinado: confira os próximos marcos e feche cada decisão com dono, data e dado.',
});
// O título tem duas frases: a segunda ganha a cor do método, em linha própria.
function htmlTituloProposito(t) {
  const s = String(t || ''), i = s.indexOf('. ');
  if (i < 1 || i + 2 >= s.length) return esc(s);
  return esc(s.slice(0, i + 1)) + ' <em>' + esc(s.slice(i + 2)) + '</em>';
}

// Frase do dia: uma das frases dos módulos, escolhida pelo dia do ano no
// horário de São Paulo, qualquer que seja o fuso do aparelho. A mesma frase
// vale o dia inteiro e muda à meia-noite de Brasília para todo mundo.
const FUSO_DA_CASA = 'America/Sao_Paulo';
let formatoDiaDaCasa = null;
function diaDoAnoNaCasa(agora) {
  const d = agora instanceof Date && !isNaN(agora.getTime()) ? agora : new Date();
  let a = NaN, m = NaN, dia = NaN;
  try {
    if (!formatoDiaDaCasa) formatoDiaDaCasa = new Intl.DateTimeFormat('en-US', { timeZone: FUSO_DA_CASA, year: 'numeric', month: 'numeric', day: 'numeric' });
    const partes = formatoDiaDaCasa.formatToParts(d);
    const v = tipo => Number((partes.find(x => x.type === tipo) || {}).value);
    a = v('year'); m = v('month'); dia = v('day');
  } catch {}
  // Navegador sem a tabela de fusos: vale o dia do aparelho, que no Brasil é o mesmo.
  if (![a, m, dia].every(Number.isFinite)) { a = d.getFullYear(); m = d.getMonth() + 1; dia = d.getDate(); }
  return Math.round((Date.UTC(a, m - 1, dia) - Date.UTC(a, 0, 1)) / 86400000) + 1;
}
function modulosComFrase() {
  const m = metodo();
  const lista = m && Array.isArray(m.MODULOS) ? m.MODULOS : [];
  return lista.filter(x => x && typeof x.id === 'string' && x.id && typeof x.frase === 'string' && x.frase.trim());
}
function fraseDoDia(agora) {
  const lista = modulosComFrase();
  if (!lista.length) return null;
  const dia = diaDoAnoNaCasa(agora);
  return { dia, modulo: lista[(dia - 1) % lista.length] };
}
function htmlFraseDoDia(fd) {
  if (!fd) return '';
  const mod = fd.modulo, titulo = String(mod.titulo || 'Módulo do método');
  return '<aside class="frase-dia" aria-labelledby="frase-dia-rotulo">' +
    '<p class="frase-dia-rotulo" id="frase-dia-rotulo">Frase do dia</p>' +
    '<blockquote class="frase-dia-texto" data-frase-dia="' + esc(mod.id) + '"><p>' + esc(mod.frase) + '</p></blockquote>' +
    '<p class="frase-dia-modulo">' + (mod.ordem ? 'Módulo ' + esc(mod.ordem) + ' · ' : '') + esc(titulo) + '</p>' +
    '<a class="frase-dia-link" href="#/metodo/' + encodeURIComponent(mod.id) + '" aria-label="Abrir o módulo ' + esc(titulo) + ' no Método">Abrir o módulo</a>' +
    '</aside>';
}
// A chamada promete "confira os próximos marcos": o botão leva ao cartão.
// Rola sem mexer no endereço (#marcos seria lido como rota e redesenharia a
// tela) e põe o foco no título do cartão, para o teclado e o leitor de tela.
function irParaMarcos() {
  const cartao = $('#cartao-marcos'); if (!cartao) return;
  let suave = true;
  try { suave = !(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch {}
  if (typeof cartao.scrollIntoView === 'function') cartao.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
  const titulo = $('#marcos-titulo');
  if (titulo && typeof titulo.focus === 'function') { try { titulo.focus({ preventScroll: true }); } catch { titulo.focus(); } }
}

function renderInicio(app) {
  const turmas = STORE.col('turmas');
  const andamento = ordenarPorNome(turmas.filter(t => t.status === 'em andamento'));
  const marcos = proximosMarcos().slice(0, 6);
  const recentes = STORE.col('diagnosticos').sort(porDataDesc).slice(0, 5);
  const m = metodo();
  const cartaoTurmas = '<section class="cartao"><h2>Turmas em andamento <span class="contagem">' + andamento.length + '</span></h2>' +
    (andamento.length ? '<ul class="lista-simples">' + andamento.slice(0, 6).map(t =>
      '<li><a href="#/plano/' + encodeURIComponent(t.id) + '"><b>' + esc(t.nome) + '</b><small>Nível ' + esc(t.nivel || 1) + (t.inicio ? ' · início ' + fmtData(t.inicio) : '') + (t.empresaId ? ' · ' + esc(nomeAlvo('empresa', t.empresaId)) : '') + '</small></a></li>').join('') + '</ul>'
      : vazioHonesto('Nenhuma turma em andamento.')) +
    '<a class="link-seta" href="#/turmas">Ver turmas e empresas</a></section>';
  const cartaoMarcos = '<section class="cartao" id="cartao-marcos" aria-labelledby="marcos-titulo"><h2 id="marcos-titulo" tabindex="-1">Próximos marcos</h2>' +
    (marcos.length ? '<ul class="lista-simples">' + marcos.map(x =>
      '<li><a href="#/plano/' + encodeURIComponent(x.turma.id) + '"><b>' + esc(x.marco.acao || 'Ação sem descrição') + '</b><small>' + esc(x.turma.nome) + ' · ' + esc(x.marco.fase || '') +
      (x.prazo ? ' · até ' + fmtData(x.prazo) : ' · sem Dia 0 definido') + '</small>' + (x.atrasado ? '<span class="selo vermelho">atrasado</span>' : '') + '</a></li>').join('') + '</ul>'
      : vazioHonesto('Nenhum marco pendente nas turmas abertas.')) +
    '<a class="link-seta" href="#/plano">Ver planos de 90 dias</a></section>';
  const cartaoDiag = '<section class="cartao"><h2>Diagnósticos recentes</h2>' +
    (recentes.length ? '<ul class="lista-simples">' + recentes.map(d => {
      const res = resultadoDe(d);
      return '<li><a href="#/diagnostico/' + encodeURIComponent(d.id) + '"><b>' + esc(nomeAlvo(d.alvoTipo, d.alvoId)) + '</b><small>' + esc(rotuloMomento(d.momento)) + (d.data ? ' · ' + fmtData(d.data) : '') + (d.avaliador ? ' · ' + esc(d.avaliador) : '') + '</small>' +
        (res ? seloResultado(res) : '') + '</a></li>';
    }).join('') + '</ul>'
      : vazioHonesto('Nenhum diagnóstico salvo ainda.')) +
    '<a class="link-seta" href="#/diagnostico">Ver diagnósticos</a></section>';
  const frase = htmlFraseDoDia(fraseDoDia());
  const ola = primeiroNome(ESTADO.sessao.nome);
  app.innerHTML = pagina('inicio',
    '<section class="proposito' + (frase ? ' com-frase' : '') + '" aria-labelledby="proposito-titulo">' +
    '<div class="proposito-principal">' +
    '<p class="proposito-ola">' + (ola ? 'Olá, ' + esc(ola) + '.' : 'Olá.') + '</p>' +
    '<h1 class="proposito-titulo" id="proposito-titulo">' + htmlTituloProposito(PROPOSITO.titulo) + '</h1>' +
    '<p class="proposito-texto">' + esc(PROPOSITO.texto) + '</p>' +
    '<div class="proposito-chamada"><p>' + esc(PROPOSITO.chamada) + '</p>' +
    '<button type="button" class="botao" data-ir-marcos>Conferir os próximos marcos</button></div>' +
    '</div>' + frase + '</section>' +
    (m ? '' : avisoHTML('O conteúdo do método (metodo.js) não carregou. Turmas, diagnósticos e planos continuam funcionando; recarregue a página para trazer o método.', 'amarelo')) +
    '<div class="acoes inicio-acoes"><a class="botao suave" href="#/apresentacao">Abrir a apresentação</a>' +
    (podeEditar() ? '<a class="botao suave" href="#/diagnostico/novo">Novo diagnóstico</a><button type="button" class="botao suave" data-nova-turma>Nova turma</button>' : '') +
    '</div>' +
    '<div class="resumo-grade">' + cartaoTurmas + cartaoMarcos + cartaoDiag + '</div>');
  ligarCab();
  const nt = $('[data-nova-turma]'); if (nt) nt.addEventListener('click', () => abrirFormTurma(null));
  const im = $('[data-ir-marcos]'); if (im) im.addEventListener('click', irParaMarcos);
}

/* ══════════ método ══════════ */
function abrirComplemento(id) {
  const m = metodo();
  try { if (m && typeof m.fecharApresentacao === 'function') m.fecharApresentacao(); } catch {}
  ESTADO.apn.modulo = String(id || '');
  location.hash = '#/dinamicas/' + encodeURIComponent(ESTADO.apn.modulo);
}
function irParaApostila() { location.hash = '#/apostila'; }
function renderMetodo(app) {
  app.innerHTML = pagina('metodo', '<div id="metodo-alvo"></div>', 'largo');
  ligarCab();
  const alvo = $('#metodo-alvo');
  const m = metodo();
  if (!m || typeof m.render !== 'function') {
    alvo.innerHTML = tituloArea('Método V.O.F.') + avisoHTML('O conteúdo do método não carregou (metodo.js). Recarregue a página; se continuar, avise o Léo.', 'vermelho');
    return;
  }
  // O método é desenhado UMA vez e o mesmo nó volta a cada visita: a aba e a
  // rolagem internas do método sobrevivem à navegação.
  if (!ESTADO.metodoNo) {
    const no = document.createElement('div');
    no.className = 'metodo-raiz';
    try {
      const ctl = m.render(no, { abrirComplemento, abrirApostila: irParaApostila });
      ESTADO.metodoNo = no;
      ESTADO.metodoCtl = ctl && typeof ctl.selecionar === 'function' ? ctl : null;
    } catch (e) {
      alvo.innerHTML = tituloArea('Método V.O.F.') + avisoHTML('Não consegui desenhar o método: ' + (e && e.message ? e.message : 'erro desconhecido'), 'vermelho');
      return;
    }
  }
  alvo.appendChild(ESTADO.metodoNo);
  if (ESTADO.rota.arg) abrirModuloDoMetodo(ESTADO.rota.arg, alvo);
}
// #/metodo/<id> abre o módulo como o cartão dele abre: a aba do nível fica
// selecionada por trás e a sala mostra o módulo. Vem da frase do dia da Início.
function abrirModuloDoMetodo(id, alvo) {
  const m = metodo();
  const mod = (m && Array.isArray(m.MODULOS) ? m.MODULOS : []).find(x => x && x.id === id);
  const lista = m && Array.isArray(m.APRESENTACAO) ? m.APRESENTACAO : [];
  const indice = mod ? lista.findIndex(x => x && x.id === mod.id) : -1;
  if (!mod) {
    alvo.insertAdjacentHTML('afterbegin', avisoHTML('Não encontrei o módulo "' + id + '" no método. Escolha um módulo nas abas abaixo.', 'amarelo'));
    return;
  }
  if (indice < 0 || typeof m.abrirApresentacao !== 'function') {
    alvo.insertAdjacentHTML('afterbegin', avisoHTML('O módulo "' + (mod.titulo || id) + '" existe, mas a sala do método não abriu. Use o cartão dele nas abas abaixo.', 'amarelo'));
    return;
  }
  try { if (ESTADO.metodoCtl) ESTADO.metodoCtl.selecionar(mod.nivel === 2 ? 'nivel2' : 'nivel1'); } catch {}
  // Uma sala já aberta seria só levada ao slide e, logo depois, fechada pela
  // própria troca de endereço: fecha e abre de novo, já no módulo.
  try { if (typeof m.apresentacaoAtual === 'function' && m.apresentacaoAtual() && typeof m.fecharApresentacao === 'function') m.fecharApresentacao(); } catch {}
  try { m.abrirApresentacao(indice); }
  catch (e) { alvo.insertAdjacentHTML('afterbegin', avisoHTML('Não consegui abrir o módulo: ' + (e && e.message ? e.message : 'erro desconhecido'), 'vermelho')); }
}

/* ══════════ dinâmicas e APN ══════════ */
const ROTULOS_APN = {
  objetivo: 'Objetivo', como_conduzir: 'Como conduzir', materiais: 'Materiais', tempo: 'Tempo', tamanho_do_grupo: 'Tamanho do grupo',
  o_que_ensina: 'O que ensina', pergunta_de_fechamento: 'Pergunta de fechamento', explicacao: 'Explicação', como_aplicar: 'Como aplicar',
  script_ou_numero: 'Script ou número', o_que_mostra: 'O que mostra', licao: 'Lição', descricao: 'Descrição', resumo: 'Resumo',
  para_que: 'Para que serve', passos: 'Passos', itens: 'Itens', perguntas: 'Perguntas', exemplos: 'Exemplos', observacao: 'Observação',
  acrescimos: 'O que a imersão acrescenta', nota_de_integracao: 'Como entra no V.O.F.', praticas: 'Práticas', evidencias: 'Evidências',
  dinamicas: 'Dinâmicas', insights: 'Pontos-chave', modulo_vof: 'Módulos do V.O.F.', pergunta: 'Pergunta para o grupo', sintese: 'Síntese',
  tese: 'Tese', entrega: 'Entrega', ferramentas: 'Ferramentas', frase: 'Frase', nivel: 'Nível', grupo: 'Grupo',
};
const CHAVES_TITULO = ['titulo', 'nome', 'tese', 'tema', 'acao', 'pergunta', 'item', 'texto'];
// Metadados de rastreio do conteúdo: servem a quem monta o material, não a quem conduz a turma.
const CHAVES_OCULTAS_APN = new Set(['id', 'ordem', 'ic', 'credito', 'fonte', 'fonte_dos_itens', 'pilar', 'pilares', 'dimensao']);
const humanizar = k => { const t = String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const NOMES_PILAR = { venda: 'Venda', operacao: 'Operação', financas: 'Finanças', pessoas: 'Pessoas', gestores: 'Gestores', dono: 'Dono', estrategia: 'Estratégia', cultura: 'Cultura', fundamento: 'Fundamento' };
const rotuloPilar = p => NOMES_PILAR[norm(p)] || humanizar(p);
const NOMES_FONTE_APN = { apn_integral: 'APN 109, íntegra', apn_estudo: 'APN 109, estudo', apn_curto: 'APN 109, resumo', vof_caderno: 'Caderno V.O.F.', vof_treinamento: 'Treinamento V.O.F.', vof_arquitetura: 'Arquitetura V.O.F.' };
// Fonte vem como texto ou como [{doc, paginas}]: vira "APN 109, estudo p. 27, 50; ...".
function fmtFonteApn(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(fmtFonteApn).filter(Boolean).join('; ');
  if (typeof v === 'object' && v.doc) return (NOMES_FONTE_APN[v.doc] || humanizar(v.doc)) + (v.paginas ? ' p. ' + v.paginas : '');
  return textoDe(v);
}
function listaDe(doc, chaves) {
  if (Array.isArray(doc)) return doc;
  if (!doc || typeof doc !== 'object') return [];
  for (const k of chaves) if (Array.isArray(doc[k])) return doc[k];
  return [];
}
// Cada seção procura a lista em mais de um lugar, na ordem: o primeiro que
// tiver itens vale. Os temas, por exemplo, podem vir no documento do checklist.
const SECOES_APN = [
  { id: 'dinamicas', nome: 'Dinâmicas', de: [['dinamicas', ['itens', 'dinamicas', 'lista']]] },
  { id: 'pontos', nome: 'Pontos-chave', de: [['insights', ['pontos_chave', 'pontosChave', 'insights']]] },
  { id: 'pulos', nome: 'Pulos do gato', de: [['insights', ['pulos_do_gato', 'pulosDoGato', 'pulos']]] },
  { id: 'casos', nome: 'Casos', de: [['insights', ['casos', 'videos_cases', 'videosCases']]] },
  { id: 'temas', nome: 'Temas', de: [['insights', ['temas']], ['checklist', ['temas']], ['temas', ['itens', 'temas', 'lista']]] },
  { id: 'novos', nome: 'Módulos novos', de: [['modulos', ['novos_modulos', 'novosModulos']]] },
];
// As seções conhecidas primeiro; qualquer outra lista que o documento
// "insights" trouxer vira seção também, com o nome da chave. Conteúdo novo
// não some calado por não estar previsto aqui.
function secoesApn(docs) {
  const usadas = new Set(), secoes = [];
  SECOES_APN.forEach(s => {
    let itens = [];
    for (const [nomeDoc, chaves] of s.de) {
      const doc = docs[nomeDoc];
      if (doc && typeof doc === 'object' && !Array.isArray(doc)) chaves.forEach(k => { if (Array.isArray(doc[k])) usadas.add(nomeDoc + '.' + k); });
      if (!itens.length) itens = listaDe(doc, chaves);
    }
    secoes.push({ id: s.id, nome: s.nome, itens });
  });
  const ins = docs.insights;
  if (ins && typeof ins === 'object' && !Array.isArray(ins)) {
    Object.keys(ins).forEach(k => {
      if (Array.isArray(ins[k]) && ins[k].length && !usadas.has('insights.' + k)) secoes.push({ id: 'x-' + k, nome: humanizar(k), itens: ins[k] });
    });
  }
  return secoes;
}
// Índice id -> item, para mostrar pelo título o que um módulo cita só pelo
// código (dinâmicas e pontos-chave ligados a ele).
function indiceApn(secoes) {
  const mapa = new Map();
  secoes.forEach(s => s.itens.forEach(it => { if (it && typeof it === 'object' && typeof it.id === 'string' && !mapa.has(it.id)) mapa.set(it.id, it); }));
  return mapa;
}
const tituloApn = item => {
  if (typeof item === 'string') return item;
  const k = item && typeof item === 'object' ? CHAVES_TITULO.find(c => typeof item[c] === 'string' && item[c].trim()) : null;
  return k ? item[k] : '';
};
function pilaresDo(item) {
  if (!item || typeof item !== 'object') return [];
  const p = item.pilar ?? item.pilares ?? item.dimensao;
  return (Array.isArray(p) ? p : (p ? [p] : [])).map(x => String(x).trim()).filter(Boolean);
}
function textoDe(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(textoDe).join(' ');
  if (typeof v === 'object') return Object.keys(v).map(k => textoDe(v[k])).join(' ');
  return '';
}
function htmlValorApn(v, chave, indice) {
  if (chave === 'modulo_vof') {
    const ids = (Array.isArray(v) ? v : [v]).map(String).filter(Boolean);
    return ids.length ? '<p>' + esc(ids.map(tituloDoModulo).join(' · ')) + '</p>' : '';
  }
  if (Array.isArray(v)) {
    let semDetalhe = 0;
    const itens = v.map(x => {
      if (typeof x === 'string' && indice && indice.has(x)) return tituloApn(indice.get(x)) || x;
      // Código (ex.: "teste-do-guardanapo") de item que ainda não está no banco:
      // não mostra o código cru; conta e diz quantos faltam.
      if (typeof x === 'string' && indice && /^[a-z0-9]+(?:[-:][a-z0-9]+)+$/.test(x)) { semDetalhe++; return ''; }
      if (x && typeof x === 'object') return CHAVES_TITULO.concat(Object.keys(x)).map(k => typeof x[k] === 'string' ? x[k] : '').filter(Boolean).filter((t, i, a) => a.indexOf(t) === i).slice(0, 2).join(': ');
      return String(x ?? '');
    }).filter(Boolean);
    const falta = semDetalhe ? '<p class="dica">' + semDetalhe + (semDetalhe === 1 ? ' item citado ainda não foi carregado.' : ' itens citados ainda não foram carregados.') + '</p>' : '';
    return (itens.length ? '<ul>' + itens.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '') + falta;
  }
  // Objeto (os acréscimos de um módulo, por exemplo): um bloco por campo, em
  // vez de tudo numa linha só.
  if (v && typeof v === 'object') return htmlCamposApn(v, indice, 'apn-sub');
  return '<p class="texto-longo">' + esc(v) + '</p>';
}
function htmlCamposApn(obj, indice, classe, pularTambem) {
  return Object.keys(obj).filter(k => !CHAVES_OCULTAS_APN.has(k) && !(pularTambem && pularTambem.has(k))).map(k => {
    const v = obj[k];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
    const html = htmlValorApn(v, k, indice);
    return html ? '<div class="' + classe + '"><b>' + esc(ROTULOS_APN[k] || humanizar(k)) + '</b>' + html + '</div>' : '';
  }).join('');
}
function htmlItemApn(item, indice) {
  if (typeof item === 'string') item = { titulo: item };
  if (!item || typeof item !== 'object') return '';
  const chaveTitulo = CHAVES_TITULO.find(k => typeof item[k] === 'string' && item[k].trim());
  const titulo = chaveTitulo ? item[chaveTitulo] : 'Sem título';
  const pilares = pilaresDo(item);
  // Tempo e tamanho do grupo vão ao lado do título só quando são curtos ("20 min");
  // texto longo ou "não informado" fica no corpo, onde cabe.
  const curto = x => typeof x === 'string' && x.trim() && x.length <= 24 && !/n[aã]o informad/i.test(x);
  const chavesMeta = ['tempo', 'tamanho_do_grupo'].filter(k => curto(item[k]));
  const meta = chavesMeta.map(k => item[k]);
  const corpo = htmlCamposApn(item, indice, 'apn-campo', new Set([chaveTitulo].concat(chavesMeta)));
  const fonte = fmtFonteApn(item.fonte);
  return '<details class="apn-item" data-pilares="' + esc(pilares.map(norm).join('|')) + '" data-busca="' + esc(norm(textoDe(item))) + '">' +
    '<summary><span class="apn-titulo">' + esc(titulo) + '</span>' +
    '<span class="apn-meta">' + pilares.map(p => '<span class="selo azul">' + esc(rotuloPilar(p)) + '</span>').join('') + meta.map(x => '<small>' + esc(x) + '</small>').join('') + '</span></summary>' +
    '<div class="apn-corpo">' + (corpo || '<p class="dica">Sem detalhes.</p>') + (fonte ? '<p class="fonte">Fonte: ' + esc(fonte) + '</p>' : '') + '</div></details>';
}
function complementoDoModulo(docs, id) {
  const d = docs.modulos;
  if (!d || !id) return null;
  if (!Array.isArray(d) && typeof d === 'object' && d[id] && typeof d[id] === 'object') return d[id];
  const lista = listaDe(d, ['itens', 'modulos', 'lista']);
  return lista.find(x => x && typeof x === 'object' && [x.id, x.moduloId, x.modulo].map(String).includes(String(id))) || null;
}
function tituloDoModulo(id) {
  const m = metodo();
  const mod = m && Array.isArray(m.MODULOS) ? m.MODULOS.find(x => x && x.id === id) : null;
  return mod ? mod.titulo : id;
}
function renderDinamicas(app) {
  ESTADO.apn.modulo = ESTADO.rota.arg || '';
  app.innerHTML = pagina('dinamicas',
    tituloArea('Dinâmicas e APN', 'Complemento da imersão APN 109: dinâmicas para conduzir em sala, pontos-chave, pulos do gato, casos e temas. Material restrito a quem entrou no sistema.') +
    '<div id="apn-corpo"><p class="vazio">Carregando o conteúdo…</p></div>');
  ligarCab();
  const corpo = $('#apn-corpo');
  corpo.addEventListener('click', e => {
    const chip = e.target.closest('[data-pilar]');
    if (chip) { ESTADO.apn.pilar = chip.getAttribute('data-pilar'); $$('[data-pilar]', corpo).forEach(c => c.setAttribute('aria-pressed', String(c === chip))); filtrarApn(); return; }
    const sec = e.target.closest('[data-secao]');
    if (sec) {
      ESTADO.apn.secao = sec.getAttribute('data-secao');
      $$('[data-secao]', corpo).forEach(b => b.setAttribute('aria-pressed', String(b === sec)));
      $$('[data-secao-corpo]', corpo).forEach(x => { x.hidden = x.getAttribute('data-secao-corpo') !== ESTADO.apn.secao; });
      return;
    }
    if (e.target.closest('[data-apn-sem-modulo]')) { ESTADO.apn.modulo = ''; location.hash = '#/dinamicas'; return; }
    if (e.target.closest('[data-apn-tentar]')) { corpo.innerHTML = '<p class="vazio">Carregando o conteúdo…</p>'; recarregarConteudo(); }
  });
  const pronto = STORE.conteudoEmMemoria();
  if (pronto) { pintarApn(pronto.docs); return; }
  recarregarConteudo();
}
function recarregarConteudo() {
  const rota = ESTADO.rota.nome;
  STORE.carregarConteudo(true).then(c => {
    ESTADO.apn.erro = '';
    if (ESTADO.rota.nome === rota && rota === 'dinamicas') pintarApn(c.docs);
  }).catch(e => {
    ESTADO.apn.erro = e.message;
    const alvo = $('#apn-corpo');
    if (alvo && ESTADO.rota.nome === 'dinamicas') alvo.innerHTML = avisoHTML('Não consegui trazer o conteúdo do APN: ' + e.message, 'vermelho') + '<button type="button" class="botao suave" data-apn-tentar>Tentar de novo</button>';
  });
}
function pintarApn(docs) {
  const alvo = $('#apn-corpo'); if (!alvo) return;
  const secoes = secoesApn(docs || {}).filter(s => s.itens.length);
  if (!secoes.length) {
    alvo.innerHTML = avisoHTML('O conteúdo do APN ainda não foi carregado no sistema. Quando o Léo subir o material, ele aparece aqui.', 'amarelo');
    return;
  }
  if (!secoes.some(s => s.id === ESTADO.apn.secao)) ESTADO.apn.secao = secoes[0].id;
  const indice = indiceApn(secoes);
  const pilares = new Map();
  secoes.forEach(s => s.itens.forEach(it => pilaresDo(it).forEach(p => { if (!pilares.has(norm(p))) pilares.set(norm(p), rotuloPilar(p)); })));
  let complemento = '';
  if (ESTADO.apn.modulo) {
    // Aberto, sem sanfona: é o que o facilitador veio buscar a partir da sala.
    const c = complementoDoModulo(docs, ESTADO.apn.modulo);
    const fonteC = c ? fmtFonteApn(c.fonte) : '';
    complemento = '<section class="cartao destaque"><h2>Complemento do módulo: ' + esc(tituloDoModulo(ESTADO.apn.modulo)) + '</h2>' +
      (c ? '<div class="apn-complemento">' + (htmlCamposApn(c, indice, 'apn-campo') || '<p class="dica">Sem detalhes.</p>') + (fonteC ? '<p class="fonte">Fonte: ' + esc(fonteC) + '</p>' : '') + '</div>'
        : '<p class="dica">Este módulo ainda não tem complemento do APN carregado.</p>') +
      '<button type="button" class="botao mini fantasma" data-apn-sem-modulo>Fechar o complemento</button></section>';
  }
  const creditos = ['insights', 'dinamicas', 'modulos', 'checklist'].map(k => docs[k] && typeof docs[k].credito === 'string' ? docs[k].credito.trim() : '').filter((t, i, a) => t && a.findIndex(x => norm(x) === norm(t)) === i);
  alvo.innerHTML = complemento +
    '<div class="apn-filtros">' +
    '<div class="chips" role="group" aria-label="Filtrar por pilar"><button type="button" class="chip" data-pilar="" aria-pressed="' + (!ESTADO.apn.pilar) + '">Todos os pilares</button>' +
    Array.from(pilares.entries()).map(([k, nome]) => '<button type="button" class="chip" data-pilar="' + esc(k) + '" aria-pressed="' + (ESTADO.apn.pilar === k) + '">' + esc(nome) + '</button>').join('') + '</div>' +
    '<label class="busca"><span>Buscar</span><input type="search" data-apn-busca placeholder="Palavra, tema ou dinâmica" value="' + esc(ESTADO.apn.busca) + '"></label>' +
    '</div>' +
    '<div class="abas-internas" role="group" aria-label="Seções">' + secoes.map(s => '<button type="button" data-secao="' + esc(s.id) + '" aria-pressed="' + (s.id === ESTADO.apn.secao) + '">' + esc(s.nome) + ' <small data-conta="' + esc(s.id) + '">' + s.itens.length + '</small></button>').join('') + '</div>' +
    secoes.map(s => '<section class="apn-secao" data-secao-corpo="' + esc(s.id) + '"' + (s.id === ESTADO.apn.secao ? '' : ' hidden') + '>' + s.itens.map(it => htmlItemApn(it, indice)).join('') +
      '<p class="vazio" data-nada hidden>Nada nesta seção com esse filtro.</p></section>').join('') +
    (creditos.length ? '<p class="fonte">' + esc(creditos.join(' · ')) + '</p>' : '');
  // Busca filtra, não redesenha: o que se digita fica no campo.
  const busca = $('[data-apn-busca]', alvo);
  busca.addEventListener('input', () => { ESTADO.apn.busca = busca.value; filtrarApn(); });
  filtrarApn();
}
function filtrarApn() {
  const pilar = ESTADO.apn.pilar, termos = norm(ESTADO.apn.busca).split(/\s+/).filter(Boolean);
  $$('[data-secao-corpo]').forEach(sec => {
    let visiveis = 0;
    $$('.apn-item', sec).forEach(it => {
      const okPilar = !pilar || (it.getAttribute('data-pilares') || '').split('|').includes(pilar);
      const texto = it.getAttribute('data-busca') || '';
      const ok = okPilar && termos.every(t => texto.includes(t));
      it.hidden = !ok; if (ok) visiveis++;
    });
    const nada = $('[data-nada]', sec); if (nada) nada.hidden = visiveis > 0;
    // Compara o atributo em vez de montar seletor: chave de seção com aspas vinda do banco quebrava o querySelector.
    const conta = $$('[data-conta]').find(x => x.getAttribute('data-conta') === sec.getAttribute('data-secao-corpo'));
    if (conta) conta.textContent = String(visiveis);
  });
}

/* ══════════ turmas e empresas ══════════ */
function seloStatus(st) {
  const cls = st === 'em andamento' ? 'verde' : st === 'concluída' ? 'cinza' : 'amarelo';
  return '<span class="selo ' + cls + '">' + esc(st || 'sem status') + '</span>';
}
function linhaTurma(t) {
  const partes = ['Nível ' + (t.nivel || 1), t.inicio ? 'início ' + fmtData(t.inicio) : 'sem data de início'];
  if (t.participantes !== '' && t.participantes != null && Number.isFinite(Number(t.participantes))) partes.push(Number(t.participantes) + ' participante(s)');
  partes.push(t.empresaId ? nomeAlvo('empresa', t.empresaId) : 'turma aberta');
  if (t.facilitador) partes.push(t.facilitador);
  return '<article class="linha" data-status="' + esc(t.status || '') + '">' +
    '<div class="linha-texto"><b>' + esc(t.nome || 'Turma sem nome') + '</b><small>' + partes.map(esc).join(' · ') + '</small></div>' + seloStatus(t.status) +
    '<div class="linha-acoes">' +
    (podeEditar() ? '<button type="button" class="botao mini suave" data-editar-turma="' + esc(t.id) + '">Editar</button>' : '') +
    '<a class="botao mini fantasma" href="#/plano/' + encodeURIComponent(t.id) + '">Plano</a>' +
    '<button type="button" class="botao mini fantasma" data-diag-alvo="turma:' + esc(t.id) + '">Diagnóstico</button>' +
    (souAdmin() ? '<button type="button" class="botao mini perigo" data-apagar-turma="' + esc(t.id) + '">Apagar</button>' : '') +
    '</div></article>';
}
function linhaEmpresa(e) {
  const nTurmas = STORE.col('turmas').filter(t => t.empresaId === e.id).length;
  const partes = [e.segmento, e.cidade, e.contato, nTurmas + ' turma(s)'].filter(x => x !== undefined && x !== null && String(x).trim());
  return '<article class="linha">' +
    '<div class="linha-texto"><b>' + esc(e.nome || 'Empresa sem nome') + '</b><small>' + partes.map(esc).join(' · ') + '</small></div>' +
    '<div class="linha-acoes">' +
    (podeEditar() ? '<button type="button" class="botao mini suave" data-editar-empresa="' + esc(e.id) + '">Editar</button>' : '') +
    '<button type="button" class="botao mini fantasma" data-diag-alvo="empresa:' + esc(e.id) + '">Diagnóstico</button>' +
    (souAdmin() ? '<button type="button" class="botao mini perigo" data-apagar-empresa="' + esc(e.id) + '">Apagar</button>' : '') +
    '</div></article>';
}
function renderTurmas(app) {
  const turmas = ordenarPorNome(STORE.col('turmas')), empresas = ordenarPorNome(STORE.col('empresas'));
  const filtro = ESTADO.turmas.status;
  app.innerHTML = pagina('turmas',
    tituloArea('Turmas e empresas', 'Cada turma tem nível, início e o número de participantes. Nomes de participantes não entram no sistema.') +
    '<section class="cartao"><div class="cartao-topo"><h2>Turmas <span class="contagem">' + turmas.length + '</span></h2>' +
    (podeEditar() ? '<button type="button" class="botao" data-nova-turma>Nova turma</button>' : '') + '</div>' +
    '<div class="chips" role="group" aria-label="Filtrar por status">' + [['', 'Todas']].concat(STATUS_TURMA.map(s => [s, s.charAt(0).toUpperCase() + s.slice(1)])).map(([v, t]) =>
      '<button type="button" class="chip" data-filtro-status="' + esc(v) + '" aria-pressed="' + (filtro === v) + '">' + esc(t) + '</button>').join('') + '</div>' +
    '<div class="lista" id="lista-turmas">' + (turmas.length ? turmas.map(linhaTurma).join('') + '<p class="vazio" data-nada-turma hidden>Nenhuma turma com esse status.</p>' : vazioHonesto('Nenhuma turma cadastrada.')) + '</div></section>' +
    '<section class="cartao"><div class="cartao-topo"><h2>Empresas <span class="contagem">' + empresas.length + '</span></h2>' +
    (podeEditar() ? '<button type="button" class="botao" data-nova-empresa>Nova empresa</button>' : '') + '</div>' +
    '<div class="lista">' + (empresas.length ? empresas.map(linhaEmpresa).join('') : vazioHonesto('Nenhuma empresa cadastrada.')) + '</div></section>');
  ligarCab();
  filtrarTurmas();
  $('#miolo').addEventListener('click', e => {
    const alvo = e.target.closest('button'); if (!alvo) return;
    if (alvo.hasAttribute('data-nova-turma')) abrirFormTurma(null);
    else if (alvo.hasAttribute('data-nova-empresa')) abrirFormEmpresa(null);
    else if (alvo.hasAttribute('data-editar-turma')) abrirFormTurma(STORE.um('turmas', alvo.getAttribute('data-editar-turma')));
    else if (alvo.hasAttribute('data-editar-empresa')) abrirFormEmpresa(STORE.um('empresas', alvo.getAttribute('data-editar-empresa')));
    else if (alvo.hasAttribute('data-apagar-turma')) confirmarApagar('turmas', STORE.um('turmas', alvo.getAttribute('data-apagar-turma')));
    else if (alvo.hasAttribute('data-apagar-empresa')) confirmarApagar('empresas', STORE.um('empresas', alvo.getAttribute('data-apagar-empresa')));
    else if (alvo.hasAttribute('data-diag-alvo')) { ESTADO.diag.alvo = alvo.getAttribute('data-diag-alvo'); location.hash = '#/diagnostico'; }
    else if (alvo.hasAttribute('data-filtro-status')) {
      ESTADO.turmas.status = alvo.getAttribute('data-filtro-status');
      $$('[data-filtro-status]').forEach(b => b.setAttribute('aria-pressed', String(b === alvo)));
      filtrarTurmas();
    }
  });
}
function filtrarTurmas() {
  const f = ESTADO.turmas.status; let n = 0;
  $$('#lista-turmas .linha').forEach(l => { const ok = !f || l.getAttribute('data-status') === f; l.hidden = !ok; if (ok) n++; });
  const nada = $('[data-nada-turma]'); if (nada) nada.hidden = n > 0;
}
function lerCampos(form) {
  const v = {};
  $$('[name]', form).forEach(el => { v[el.getAttribute('name')] = el.type === 'checkbox' ? !!el.checked : String(el.value ?? ''); });
  return v;
}
function abrirFormTurma(turma) {
  if (!podeEditar()) { toast('Seu acesso não permite criar ou editar turmas.', 'erro'); return; }
  const t = turma ? Object.assign({}, turma) : { id: novoId(), nome: '', empresaId: '', nivel: 1, inicio: hojeISO(), facilitador: ESTADO.sessao.nome, participantes: '', status: 'planejada', obs: '' };
  const empresas = ordenarPorNome(STORE.col('empresas'));
  const veu = abrirModal('<h2>' + (turma ? 'Editar turma' : 'Nova turma') + '</h2><form data-form novalidate>' +
    campo('Nome da turma', '<input type="text" name="nome" maxlength="120" required value="' + esc(t.nome) + '">') +
    campo('Empresa', '<select name="empresaId">' + opcoesHTML([['', 'Turma aberta (sem empresa)']].concat(empresas.map(e => [e.id, e.nome || 'Sem nome'])), t.empresaId || '') + '</select>') +
    '<div class="duas">' +
    campo('Nível', '<select name="nivel">' + opcoesHTML([['1', 'Nível 1 · Fundamentos'], ['2', 'Nível 2 · Avançado']], String(t.nivel || 1)) + '</select>') +
    campo('Status', '<select name="status">' + opcoesHTML(STATUS_TURMA.map(s => [s, s]), t.status || 'planejada') + '</select>') +
    '</div><div class="duas">' +
    campo('Início', '<input type="date" name="inicio" value="' + esc(t.inicio || '') + '">') +
    campo('Participantes', '<input type="number" name="participantes" min="0" max="9999" step="1" inputmode="numeric" value="' + esc(t.participantes ?? '') + '">', 'Só o número. Nomes não entram no sistema.') +
    '</div>' +
    campo('Facilitador', '<input type="text" name="facilitador" maxlength="120" value="' + esc(t.facilitador || '') + '">') +
    campo('Observações', '<textarea name="obs" rows="3" maxlength="4000">' + esc(t.obs || '') + '</textarea>', 'Não escreva nomes de participantes.') +
    '<div data-erro role="alert"></div>' +
    '<div class="acoes"><button type="submit" class="botao">Salvar turma</button><button type="button" class="botao fantasma" data-fechar>Cancelar</button></div></form>',
    turma ? 'Editar turma' : 'Nova turma', { formulario: true });
  const form = $('[data-form]', veu);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = lerCampos(form), erro = $('[data-erro]', veu);
    const problemas = [];
    if (!v.nome.trim()) problemas.push('Dê um nome à turma.');
    if (v.inicio && !dataValida(v.inicio)) problemas.push('A data de início não é válida.');
    let participantes = null;
    if (v.participantes.trim() !== '') {
      participantes = Number(v.participantes);
      if (!Number.isInteger(participantes) || participantes < 0 || participantes > 9999) problemas.push('Participantes: um número inteiro de 0 a 9999.');
    }
    if (problemas.length) { erro.innerHTML = avisoHTML(problemas.join(' '), 'vermelho'); return; }
    const reg = Object.assign({}, t, {
      nome: v.nome.trim(), empresaId: v.empresaId || '', nivel: v.nivel === '2' ? 2 : 1, inicio: v.inicio || '',
      facilitador: v.facilitador.trim(), participantes, status: STATUS_TURMA.includes(v.status) ? v.status : 'planejada', obs: v.obs,
    });
    await salvarPeloModal(veu, 'turmas', reg, 'Turma salva.');
  });
}
function abrirFormEmpresa(empresa) {
  if (!podeEditar()) { toast('Seu acesso não permite criar ou editar empresas.', 'erro'); return; }
  const e = empresa ? Object.assign({}, empresa) : { id: novoId(), nome: '', segmento: '', cidade: '', contato: '', obs: '' };
  const veu = abrirModal('<h2>' + (empresa ? 'Editar empresa' : 'Nova empresa') + '</h2><form data-form novalidate>' +
    campo('Nome da empresa', '<input type="text" name="nome" maxlength="160" required value="' + esc(e.nome) + '">') +
    '<div class="duas">' +
    campo('Segmento', '<input type="text" name="segmento" maxlength="120" value="' + esc(e.segmento || '') + '">') +
    campo('Cidade', '<input type="text" name="cidade" maxlength="120" value="' + esc(e.cidade || '') + '">') +
    '</div>' +
    campo('Contato', '<input type="text" name="contato" maxlength="200" value="' + esc(e.contato || '') + '">', 'Quem responde pela empresa no programa.') +
    campo('Observações', '<textarea name="obs" rows="3" maxlength="4000">' + esc(e.obs || '') + '</textarea>') +
    '<div data-erro role="alert"></div>' +
    '<div class="acoes"><button type="submit" class="botao">Salvar empresa</button><button type="button" class="botao fantasma" data-fechar>Cancelar</button></div></form>',
    empresa ? 'Editar empresa' : 'Nova empresa', { formulario: true });
  const form = $('[data-form]', veu);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = lerCampos(form);
    if (!v.nome.trim()) { $('[data-erro]', veu).innerHTML = avisoHTML('Dê um nome à empresa.', 'vermelho'); return; }
    const reg = Object.assign({}, e, { nome: v.nome.trim(), segmento: v.segmento.trim(), cidade: v.cidade.trim(), contato: v.contato.trim(), obs: v.obs });
    await salvarPeloModal(veu, 'empresas', reg, 'Empresa salva.');
  });
}
async function salvarPeloModal(veu, colecao, reg, ok) {
  const bt = $('button[type=submit]', veu), erro = $('[data-erro]', veu);
  bt.disabled = true; const texto = bt.textContent; bt.textContent = 'Salvando…';
  try {
    await STORE.gravar(colecao, reg);
    veu.fechar(); toast(ok, 'sucesso');
    renderApp({ manterRolagem: true });
  } catch (e) {
    bt.disabled = false; bt.textContent = texto;
    erro.innerHTML = avisoHTML(mensagemDeErro(e, 'Não consegui salvar'), 'vermelho');
  }
}
function mensagemDeErro(e, prefixo) {
  if (!e) return prefixo + '.';
  if (e.arquivado) return prefixo + ': este item foi arquivado. Só o admin pode restaurar.';
  if (e.tipo === 'conflito') return prefixo + ': outra pessoa alterou este item antes de você. O que você escreveu continua aqui; toque em Atualizar no topo para ver a versão nova e grave de novo. (' + e.message + ')';
  if (e.tipo === 'permissao') return e.message;
  if (e.tipo === 'rede') return prefixo + '. ' + e.message;
  return prefixo + ': ' + (e.message || 'erro desconhecido');
}
// Quem apaga digita o CÓDIGO do registro, não o nome: com o nome, quem abre
// o item errado passa igualzinho e apaga o certo.
function confirmarApagar(colecao, reg) {
  if (!reg) return;
  if (!souAdmin()) { toast('Só o administrador apaga.', 'erro'); return; }
  const codigo = String(reg.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
  let consequencia = '';
  if (colecao === 'turmas') {
    const nd = STORE.col('diagnosticos').filter(d => d.alvoTipo === 'turma' && d.alvoId === reg.id).length;
    const np = STORE.col('planos').filter(p => p.turmaId === reg.id).length;
    consequencia = nd + ' diagnóstico(s) e ' + np + ' plano(s) desta turma continuam guardados, mas ficam sem turma.';
  } else {
    const nt = STORE.col('turmas').filter(t => t.empresaId === reg.id).length;
    const nd = STORE.col('diagnosticos').filter(d => d.alvoTipo === 'empresa' && d.alvoId === reg.id).length;
    consequencia = nt + ' turma(s) e ' + nd + ' diagnóstico(s) ligados a esta empresa continuam guardados, mas ficam sem empresa.';
  }
  const veu = abrirModal('<h2>Apagar ' + (colecao === 'turmas' ? 'turma' : 'empresa') + '</h2>' +
    '<p><b>' + esc(reg.nome || 'Sem nome') + '</b> · código <b class="codigo">' + esc(codigo) + '</b></p>' +
    '<p class="dica">' + esc(consequencia) + ' O servidor guarda o item apagado e o administrador pode restaurar.</p>' +
    '<form data-form novalidate>' + campo('Para confirmar, digite o código ' + codigo, '<input type="text" name="codigo" autocomplete="off" autocapitalize="characters" spellcheck="false">') +
    '<div data-erro role="alert"></div>' +
    '<div class="acoes"><button type="submit" class="botao perigo">Apagar</button><button type="button" class="botao fantasma" data-fechar>Cancelar</button></div></form>',
    'Confirmar exclusão', { formulario: true });
  const form = $('[data-form]', veu);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const digitado = String($('[name=codigo]', form).value || '').trim().toUpperCase();
    if (digitado !== codigo) { $('[data-erro]', veu).innerHTML = avisoHTML('O código não confere. Nada foi apagado.', 'vermelho'); return; }
    const bt = $('button[type=submit]', veu); bt.disabled = true;
    try { await STORE.apagar(colecao, reg.id); veu.fechar(); toast('Apagado.', 'sucesso'); renderApp({ manterRolagem: true }); }
    catch (e) { bt.disabled = false; $('[data-erro]', veu).innerHTML = avisoHTML(mensagemDeErro(e, 'Não consegui apagar'), 'vermelho'); }
  });
}

/* ══════════ diagnóstico ══════════ */
function praticas() { const m = metodo(); return m && Array.isArray(m.PRATICAS) ? m.PRATICAS.filter(p => p && p.id) : []; }
function dimensoes() {
  const m = metodo();
  if (m && Array.isArray(m.DIMENSOES) && m.DIMENSOES.length) return m.DIMENSOES;
  return [{ id: 'venda', nome: 'Venda' }, { id: 'operacao', nome: 'Operação' }, { id: 'financas', nome: 'Finanças' }, { id: 'pessoas', nome: 'Pessoas' }, { id: 'gestores', nome: 'Gestores' }];
}
// N/A do caderno (p. 31): "inaplicável, justificado antes da pontuação;
// ajustar o denominador e sinalizar comparabilidade limitada. Não excluir uma
// dimensão inteira." Grava-se como a string "na", a única forma que o
// servidor aceita e a que o VOFMetodo.pontuar lê para ajustar o denominador.
const NA = 'na';
const REGRA_NA = 'N/A: inaplicável, justificado antes da pontuação; ajustar o denominador e sinalizar comparabilidade limitada. Não excluir uma dimensão inteira. (Caderno p. 31)';
const ehNota = n => Number.isInteger(n) && n >= 0 && n <= 4;
const temMarca = n => ehNota(n) || n === NA;
// Notas guardadas como {v1:{nota,evidencia}}; aceita também {v1:3} e {v1:'na'}.
function normalizarNotas(notas) {
  const out = {};
  if (!notas || typeof notas !== 'object') return out;
  Object.keys(notas).forEach(k => {
    const v = notas[k];
    if (typeof v === 'number' || v === NA) out[k] = { nota: v, evidencia: '' };
    else if (v && typeof v === 'object') out[k] = { nota: v.nota === NA || Number.isInteger(v.nota) ? v.nota : (v.nota === '' || v.nota == null ? null : Number(v.nota)), evidencia: String(v.evidencia || '') };
  });
  Object.keys(out).forEach(k => { if (!temMarca(out[k].nota)) out[k].nota = null; });
  return out;
}
function notasSimples(notas) {
  const n = normalizarNotas(notas), out = {};
  Object.keys(n).forEach(k => { if (temMarca(n[k].nota)) out[k] = n[k].nota; });
  return out;
}
// Práticas marcadas N/A, por dimensão, na ordem das práticas.
function naPorDimensao(notas) {
  const n = normalizarNotas(notas), out = {};
  dimensoes().forEach(d => { out[d.id] = praticas().filter(p => p.dimensao === d.id && n[p.id] && n[p.id].nota === NA).map(p => p.id); });
  return out;
}
// "Não excluir uma dimensão inteira": dimensão com todas as práticas em N/A.
function dimensoesTodasNA(notas) {
  const n = normalizarNotas(notas);
  return dimensoes().filter(d => {
    const ps = praticas().filter(p => p.dimensao === d.id);
    return ps.length > 0 && ps.every(p => n[p.id] && n[p.id].nota === NA);
  });
}
// "Justificado antes da pontuação": N/A sem nada escrito no campo evidência.
function naSemJustificativa(notas) {
  const n = normalizarNotas(notas);
  return praticas().map(p => p.id).filter(id => n[id] && n[id].nota === NA && !String(n[id].evidencia || '').trim());
}
const codigosPraticas = ids => ids.map(x => String(x).toUpperCase()).join(', ');
// A régua é a do caderno (VOFMetodo.pontuar): dimensão com prática sem nota
// fica EM ABERTO (null) e o geral só fecha com as cinco. Em aberto nunca vira
// zero na tela: zero é nota confirmada, não falta de nota.
const numOuNulo = x => (typeof x === 'number' && Number.isFinite(x)) ? x : null;
function fmtPontos(x) {
  if (x === null || x === undefined) return 'em aberto';
  const v = Math.round(x * 10) / 10;
  return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
}
function resultadoDe(diag) {
  const m = metodo();
  if (!m || typeof m.pontuar !== 'function' || !diag) return null;
  try {
    const r = m.pontuar(notasSimples(diag.notas));
    if (!r || typeof r !== 'object') return null;
    const na = naPorDimensao(diag.notas);
    const out = {
      faltando: Array.isArray(r.faltando) ? r.faltando : [], geral: numOuNulo(r.geral),
      nucleo: numOuNulo(r.nucleo), sustentacao: numOuNulo(r.sustentacao), cobertura: numOuNulo(r.cobertura),
      faixa: r.faixa && typeof r.faixa === 'object' ? r.faixa : null, abaixoDe40: Array.isArray(r.abaixoDe40) ? r.abaixoDe40 : [],
      na, inaplicaveis: [].concat(...Object.values(na)),
      semJustificativa: naSemJustificativa(diag.notas), todasNA: dimensoesTodasNA(diag.notas),
    };
    dimensoes().forEach(d => { out[d.id] = numOuNulo(r[d.id]); });
    return out;
  } catch { return null; }
}
const seloResultado = r => r.geral === null ? '<span class="selo amarelo">incompleto</span>' : '<span class="selo azul">' + fmtPontos(r.geral) + '</span>';
const splitAlvo = v => { const i = String(v || '').indexOf(':'); return i < 0 ? ['', ''] : [v.slice(0, i), v.slice(i + 1)]; };
function opcoesAlvo(atual) {
  const turmas = ordenarPorNome(STORE.col('turmas')), empresas = ordenarPorNome(STORE.col('empresas'));
  return '<option value=""' + (atual ? '' : ' selected') + '>Escolha a turma ou a empresa</option>' +
    (turmas.length ? '<optgroup label="Turmas">' + turmas.map(t => '<option value="turma:' + esc(t.id) + '"' + (atual === 'turma:' + t.id ? ' selected' : '') + '>' + esc(t.nome || 'Sem nome') + '</option>').join('') + '</optgroup>' : '') +
    (empresas.length ? '<optgroup label="Empresas">' + empresas.map(e => '<option value="empresa:' + esc(e.id) + '"' + (atual === 'empresa:' + e.id ? ' selected' : '') + '>' + esc(e.nome || 'Sem nome') + '</option>').join('') + '</optgroup>' : '');
}
function diagnosticosDoAlvo(alvo) {
  const [tipo, id] = splitAlvo(alvo);
  return STORE.col('diagnosticos').filter(d => d.alvoTipo === tipo && d.alvoId === id)
    .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')) || String(a.atualizadoEm || '').localeCompare(String(b.atualizadoEm || '')));
}
// Linha de base: a primeira marcada como linha de base. Último: o mais recente
// que não é ela. É o par que mostra se os 90 dias mexeram no número.
// N/A (caderno p. 31): a dimensão é calculada com o denominador ajustado e a
// linha diz "comparabilidade limitada" quando qualquer um dos dois momentos
// tem N/A nela. O geral herda o aviso de qualquer dimensão.
function comparacaoHTML(alvo) {
  const lista = diagnosticosDoAlvo(alvo);
  const base = lista.find(d => d.momento === 'linha_de_base');
  if (!base) return '<p class="dica">Ainda não há linha de base para comparar. Comece pelo diagnóstico da linha de base.</p>';
  const ultimo = lista.filter(d => d.id !== base.id).slice(-1)[0];
  if (!ultimo) return '<p class="dica">Só existe a linha de base. A comparação aparece quando houver o diagnóstico do dia 30, 60 ou 90.</p>';
  const rb = resultadoDe(base), ru = resultadoDe(ultimo);
  if (!rb || !ru) return avisoHTML('A régua de pontuação do método não carregou; não dá para comparar agora.', 'amarelo');
  const limitada = id => !!((rb.na[id] || []).length || (ru.na[id] || []).length);
  const algumaLimitada = dimensoes().some(d => limitada(d.id));
  const linha = (nome, a, b, lim) => {
    const cab = '<tr' + (lim ? ' class="limitada"' : '') + '><th scope="row">' + esc(nome) + (lim ? ' <small class="comparabilidade">comparabilidade limitada</small>' : '') + '</th><td>' + fmtPontos(a) + '</td><td>' + fmtPontos(b) + '</td>';
    if (a === null || b === null) return cab + '<td class="dica">sem comparação</td></tr>';
    const d = Math.round((b - a) * 10) / 10;
    return cab + '<td class="' + (d > 0 ? 'sobe' : d < 0 ? 'desce' : '') + '">' + (d > 0 ? '+' : '') + fmtPontos(d) + '</td></tr>';
  };
  const ondeNA = (rotulo, r) => r.inaplicaveis.length ? rotulo + ': N/A em ' + codigosPraticas(r.inaplicaveis) + '.' : '';
  return '<div class="rolagem-x"><table class="comparacao"><thead><tr><th scope="col">Dimensão</th><th scope="col">Linha de base<br><small>' + esc(fmtData(base.data)) + '</small></th><th scope="col">' + esc(rotuloMomento(ultimo.momento)) + '<br><small>' + esc(fmtData(ultimo.data)) + '</small></th><th scope="col">Diferença</th></tr></thead><tbody>' +
    dimensoes().map(d => linha(d.nome, rb[d.id], ru[d.id], limitada(d.id))).join('') + linha('Geral', rb.geral, ru.geral, algumaLimitada) + '</tbody></table></div>' +
    (algumaLimitada ? '<p class="aviso amarelo" data-comparabilidade>Comparabilidade limitada: prática marcada N/A ajusta o denominador (100 × soma ÷ (4 × aplicáveis)). ' +
      esc([ondeNA('Linha de base', rb), ondeNA(rotuloMomento(ultimo.momento), ru)].filter(Boolean).join(' ')) + ' Caderno p. 31.</p>' : '') +
    ((rb.faltando.length || ru.faltando.length) ? '<p class="dica">Um dos dois diagnósticos tem prática sem nota: a dimensão incompleta fica sem comparação.</p>' : '');
}
function renderDiagnostico(app) {
  if (ESTADO.rota.arg) { renderDiagEditor(app); return; }
  const ps = praticas();
  app.innerHTML = pagina('diagnostico',
    tituloArea('Diagnóstico', 'As 25 práticas do Nível 1, pontuadas de 0 a 4 com evidência. Compare a linha de base com o dia 90.') +
    (ps.length ? '' : avisoHTML('As práticas do diagnóstico não carregaram (metodo.js). Os diagnósticos salvos continuam guardados.', 'amarelo')) +
    '<section class="cartao"><div class="campo"><label>Turma ou empresa<select data-diag-alvo-sel>' + opcoesAlvo(ESTADO.diag.alvo) + '</select></label></div>' +
    '<div id="diag-painel"></div></section>');
  ligarCab();
  const sel = $('[data-diag-alvo-sel]');
  sel.addEventListener('change', () => { ESTADO.diag.alvo = sel.value; pintarPainelDiag(); });
  pintarPainelDiag();
}
function pintarPainelDiag() {
  const alvo = ESTADO.diag.alvo, painel = $('#diag-painel'); if (!painel) return;
  const novo = podeEditar() && praticas().length ? '<a class="botao" href="#/diagnostico/novo">Novo diagnóstico' + (alvo ? ' para ' + esc(nomeAlvo(splitAlvo(alvo)[0], splitAlvo(alvo)[1])) : '') + '</a>' : '';
  if (!alvo) {
    const recentes = STORE.col('diagnosticos').sort(porDataDesc).slice(0, 12);
    painel.innerHTML = '<div class="acoes">' + novo + '</div><h2>Diagnósticos recentes</h2>' +
      (recentes.length ? '<div class="lista">' + recentes.map(linhaDiag).join('') + '</div>' : vazioHonesto('Nenhum diagnóstico salvo ainda.'));
    return;
  }
  const lista = diagnosticosDoAlvo(alvo);
  painel.innerHTML = '<div class="acoes">' + novo + '</div>' +
    '<h2>Linha de base e último momento</h2>' + comparacaoHTML(alvo) +
    '<h2>Todos os diagnósticos de ' + esc(nomeAlvo(splitAlvo(alvo)[0], splitAlvo(alvo)[1])) + '</h2>' +
    (lista.length ? '<div class="lista">' + lista.slice().reverse().map(linhaDiag).join('') + '</div>' : vazioHonesto('Nenhum diagnóstico para esta escolha.'));
}
function linhaDiag(d) {
  const r = resultadoDe(d);
  return '<a class="linha linha-link" href="#/diagnostico/' + encodeURIComponent(d.id) + '"><div class="linha-texto"><b>' + esc(nomeAlvo(d.alvoTipo, d.alvoId)) + ' · ' + esc(rotuloMomento(d.momento)) + '</b>' +
    '<small>' + [fmtData(d.data), d.avaliador].filter(Boolean).map(esc).join(' · ') + '</small></div>' +
    (r ? (r.geral === null ? '<span class="nota-geral parcial">…<small>incompleto</small></span>' : '<span class="nota-geral">' + fmtPontos(r.geral) + '<small>geral</small></span>') : '') + '</a>';
}
function rascunhoDiag(arg) {
  const chave = 'diag_' + arg;
  // Rascunho com alteração é sagrado; rascunho intocado é refeito, para
  // refletir a escolha nova e a versão mais recente do servidor.
  const mem = ESTADO.diag.rascunho;
  if (mem && mem._chave === chave && mem._alteradoEm) return mem;
  let r = STORE.rascunho(chave);
  if (r && typeof r === 'object' && r._alteradoEm) r._restaurado = true;
  else if (arg === 'novo') {
    const [tipo, id] = splitAlvo(ESTADO.diag.alvo);
    r = { id: novoId(), alvoTipo: tipo || '', alvoId: id || '', momento: STORE.col('diagnosticos').some(d => d.alvoTipo === tipo && d.alvoId === id && d.momento === 'linha_de_base') ? 'dia_90' : 'linha_de_base', data: hojeISO(), avaliador: ESTADO.sessao.nome, notas: {}, obs: '' };
  } else {
    const reg = STORE.um('diagnosticos', arg);
    if (!reg) return null;
    r = JSON.parse(JSON.stringify(reg));
  }
  r.notas = normalizarNotas(r.notas);
  r._chave = chave;
  ESTADO.diag.rascunho = r;
  return r;
}
function guardarRascunhoDiag() {
  const r = ESTADO.diag.rascunho; if (!r) return;
  r._alteradoEm = new Date().toISOString();
  STORE.rascunho(r._chave, r);
}
function htmlPratica(p, nota) {
  const n = nota || { nota: null, evidencia: '' };
  const niveis = Array.isArray(p.niveis) ? p.niveis : [];
  return '<article class="pratica" data-pratica="' + esc(p.id) + '">' +
    '<h3><span class="pratica-id">' + esc(String(p.id).toUpperCase()) + '</span> ' + esc(p.titulo || '') + '</h3>' +
    (p.pergunta ? '<p class="pratica-pergunta">' + esc(p.pergunta) + '</p>' : '') +
    (p.descricao ? '<p class="pratica-descricao">' + esc(p.descricao) + '</p>' : '') +
    (p.evidencia ? '<p class="dica">Onde olhar: ' + esc(p.evidencia) + '</p>' : '') +
    '<div class="regua" role="radiogroup" aria-label="Nota de ' + esc(p.id) + '">' +
    [0, 1, 2, 3, 4].map(i => {
      const txt = String(niveis[i] || '').replace(/^\s*\d\s*[:.)]\s*/, '');
      const corte = txt.indexOf('. ');
      const nome = corte > 0 ? txt.slice(0, corte) : txt, resto = corte > 0 ? txt.slice(corte + 2) : '';
      return '<label class="nivel"><input type="radio" name="nota-' + esc(p.id) + '" value="' + i + '"' + (n.nota === i ? ' checked' : '') + '><span><b>' + i + '</b>' + (nome ? ' <strong>' + esc(nome) + '</strong>' : '') + (resto ? '<small>' + esc(resto) + '</small>' : '') + '</span></label>';
    }).join('') +
    // N/A tem o mesmo alvo de toque das notas 0 a 4: a mesma classe .nivel.
    '<label class="nivel nivel-na"><input type="radio" name="nota-' + esc(p.id) + '" value="' + NA + '"' + (n.nota === NA ? ' checked' : '') + '><span><b>N/A</b> <strong>Não se aplica</strong><small>Inaplicável aqui. Escreva a justificativa no campo Evidência; a dimensão é calculada só com as práticas aplicáveis.</small></span></label>' +
    '</div>' +
    '<button type="button" class="botao mini fantasma" data-limpar="' + esc(p.id) + '"' + (temMarca(n.nota) ? '' : ' hidden') + '>Tirar a nota (fica ND)</button>' +
    '<label class="evidencia">Evidência<input type="text" data-evidencia="' + esc(p.id) + '" maxlength="600" placeholder="' + (n.nota === NA ? 'Por que esta prática não se aplica' : 'O que mostra que a prática acontece') + '" value="' + esc(n.evidencia) + '"></label>' +
    (p.fonte ? '<p class="fonte">' + esc(p.fonte) + '</p>' : '') + '</article>';
}
function htmlResultado(r) {
  if (!r) return '<p class="dica">A régua de pontuação do método não carregou.</p>';
  const total = praticas().length || 25;
  const nNA = r.inaplicaveis.length, aplicaveis = total - nNA;
  const m = metodo();
  const baixo = new Set(r.abaixoDe40);
  return '<div class="resultado-geral' + (r.geral === null ? ' aberto' : '') + '"><span>Geral</span><b data-geral>' + fmtPontos(r.geral) + '</b>' + (r.geral === null ? '' : '<small>de 100</small>') + '</div>' +
    (r.faixa && r.faixa.nome ? '<p class="faixa"><b>' + esc(r.faixa.nome) + '.</b> ' + esc(r.faixa.leitura || '') + '</p>' : '') +
    dimensoes().map(d => {
      const v = r[d.id];
      return '<div class="barra-dim' + (baixo.has(d.id) ? ' baixo' : '') + '"><span>' + esc(d.nome) + '</span><div class="barra"><i style="width:' + (v === null ? 0 : Math.max(0, Math.min(100, v))) + '%"></i></div><b>' + (v === null ? '<small>aberto</small>' : fmtPontos(v)) + '</b></div>';
    }).join('') +
    ((r.nucleo !== null || r.sustentacao !== null) ? '<p class="dica">Núcleo (V, O, F): ' + fmtPontos(r.nucleo) + ' · Sustentação (P, G): ' + fmtPontos(r.sustentacao) + '</p>' : '') +
    (baixo.size ? '<p class="aviso vermelho">Abaixo de 40: ' + esc(dimensoes().filter(d => baixo.has(d.id)).map(d => d.nome).join(', ')) + '.</p>' : '') +
    (r.faltando.length ? '<p class="aviso amarelo">' + r.faltando.length + ' de ' + (nNA ? aplicaveis + ' práticas aplicáveis' : total + ' práticas') + ' sem nota (ND). Dimensão com prática sem nota fica em aberto; o geral só fecha com ' + (nNA ? 'todas as aplicáveis' : 'as ' + total) + '.</p>'
      : '<p class="aviso verde">As ' + (nNA ? aplicaveis + ' práticas aplicáveis' : total + ' práticas') + ' estão pontuadas.</p>') +
    (nNA ? '<p class="aviso azul" data-aviso-na>N/A em ' + esc(codigosPraticas(r.inaplicaveis)) + ': a dimensão usa 100 × soma ÷ (4 × aplicáveis) e a comparabilidade fica limitada (caderno p. 31).</p>' : '') +
    (r.semJustificativa.length ? '<p class="aviso vermelho" data-na-sem-justificativa>N/A sem justificativa: ' + esc(codigosPraticas(r.semJustificativa)) + '. O caderno pede a justificativa antes da pontuação; escreva no campo Evidência.</p>' : '') +
    (r.todasNA.length ? '<p class="aviso vermelho" data-dimensao-toda-na>' + esc(r.todasNA.map(d => d.nome).join(', ')) + ': todas as práticas em N/A. O caderno não permite excluir uma dimensão inteira; pontue ao menos uma prática dela.</p>' : '') +
    (m && m.AVISO_INDICE && m.AVISO_INDICE.texto ? '<p class="fonte">' + esc(m.AVISO_INDICE.texto) + '</p>' : '');
}
function renderDiagEditor(app) {
  const arg = ESTADO.rota.arg;
  const ps = praticas();
  if (!ps.length) {
    app.innerHTML = pagina('diagnostico', tituloArea('Diagnóstico') + avisoHTML('As práticas do diagnóstico não carregaram (metodo.js). Recarregue a página.', 'vermelho') + '<a class="botao fantasma" href="#/diagnostico">Voltar</a>');
    ligarCab(); return;
  }
  if (arg === 'novo' && !podeEditar()) { location.hash = '#/diagnostico'; return; }
  const r = rascunhoDiag(arg);
  if (!r) {
    app.innerHTML = pagina('diagnostico', tituloArea('Diagnóstico') + '<div data-aguardando>' + vazioHonesto('Este diagnóstico não existe mais ou ainda não chegou a este aparelho.') + '</div><a class="botao fantasma" href="#/diagnostico">Voltar</a>');
    ligarCab(); return;
  }
  const existente = arg !== 'novo';
  const edita = podeEditar();
  const alvoAtual = r.alvoTipo && r.alvoId ? r.alvoTipo + ':' + r.alvoId : '';
  const blocos = dimensoes().map(d => {
    const lista = ps.filter(p => p.dimensao === d.id);
    if (!lista.length) return '';
    return '<fieldset class="diag-dim"><legend>' + esc(d.nome) + '</legend>' + lista.map(p => htmlPratica(p, r.notas[p.id])).join('') + '</fieldset>';
  }).join('');
  const semDimensao = ps.filter(p => !dimensoes().some(d => d.id === p.dimensao));
  app.innerHTML = pagina('diagnostico',
    '<div class="titulo-area"><a class="voltar" href="#/diagnostico">Diagnósticos</a><h1>' + (existente ? 'Diagnóstico' : 'Novo diagnóstico') + '</h1></div>' +
    (r._alteradoEm ? '<div class="aviso amarelo">Rascunho guardado neste aparelho em ' + esc(fmtHora(r._alteradoEm)) + ', ainda não salvo no servidor. <button type="button" class="botao mini fantasma" data-descartar>Descartar o rascunho</button></div>' : '') +
    (edita ? '' : avisoHTML('Seu acesso é só de leitura.', 'azul')) +
    (metodo() && metodo().REGUA ? '<details class="cartao regua-ajuda"><summary>Como dar a nota</summary><p>' + esc(metodo().REGUA.comoEscolher || metodo().REGUA.curta || '') + '</p>' + (metodo().REGUA.nd ? '<p>' + esc(metodo().REGUA.nd) + ' Deixe sem nota.</p>' : '') + '<p>' + esc(REGRA_NA) + '</p>' + (metodo().REGUA.fonte ? '<p class="fonte">' + esc(metodo().REGUA.fonte) + '</p>' : '') + '</details>' : '') +
    '<form class="diag-form" data-diag-form novalidate><div class="diag-grade"><div class="diag-principal">' +
    '<section class="cartao"><div class="duas">' +
    campo('Turma ou empresa', '<select data-campo="alvo">' + opcoesAlvo(alvoAtual) + '</select>') +
    campo('Momento', '<select data-campo="momento">' + opcoesHTML(MOMENTOS, r.momento) + '</select>') +
    '</div><div class="duas">' +
    campo('Data', '<input type="date" data-campo="data" value="' + esc(r.data || '') + '">') +
    campo('Avaliador', '<input type="text" data-campo="avaliador" maxlength="120" value="' + esc(r.avaliador || '') + '">') +
    '</div></section>' +
    blocos + (semDimensao.length ? '<fieldset class="diag-dim"><legend>Outras práticas</legend>' + semDimensao.map(p => htmlPratica(p, r.notas[p.id])).join('') + '</fieldset>' : '') +
    '<section class="cartao">' + campo('Observações', '<textarea data-campo="obs" rows="3" maxlength="4000">' + esc(r.obs || '') + '</textarea>') + '</section>' +
    '</div><aside class="diag-lado"><section class="cartao resultado" aria-live="polite"><h2>Resultado</h2><div id="diag-resultado">' + htmlResultado(resultadoDe(r)) + '</div>' +
    '<div data-erro role="alert"></div>' +
    (edita ? '<div class="acoes"><button type="submit" class="botao largo">Salvar diagnóstico</button></div>' : '') +
    (edita && existente && souAdmin() ? '<button type="button" class="botao mini perigo" data-apagar-diag>Apagar este diagnóstico</button>' : '') +
    '</section></aside></div></form>');
  ligarCab();
  const form = $('[data-diag-form]');
  if (!edita) $$('input, select, textarea', form).forEach(el => { el.disabled = true; });
  const atualizarResultado = () => { const alvo = $('#diag-resultado'); if (alvo) alvo.innerHTML = htmlResultado(resultadoDe(ESTADO.diag.rascunho)); };
  let tempo = null;
  form.addEventListener('input', ev => {
    const el = ev.target, rr = ESTADO.diag.rascunho; if (!rr) return;
    if (el.hasAttribute('data-evidencia')) {
      const id = el.getAttribute('data-evidencia');
      const antes = rr.notas[id] && rr.notas[id].nota === NA && !String(rr.notas[id].evidencia || '').trim();
      rr.notas[id] = Object.assign({ nota: null, evidencia: '' }, rr.notas[id], { evidencia: el.value });
      // O aviso de N/A sem justificativa acompanha a digitação.
      if (rr.notas[id].nota === NA && antes !== !String(el.value || '').trim()) atualizarResultado();
    } else if (el.hasAttribute('data-campo')) aplicarCampoDiag(rr, el);
    else return;
    // A marca de "alterado" é imediata; só a cópia no aparelho espera a pausa
    // da digitação. Se a marca esperasse, um redesenho nesse intervalo tomaria
    // o rascunho por intocado e apagaria o que se digitou.
    rr._alteradoEm = new Date().toISOString();
    clearTimeout(tempo); tempo = setTimeout(guardarRascunhoDiag, 300);
  });
  form.addEventListener('change', ev => {
    const el = ev.target, rr = ESTADO.diag.rascunho; if (!rr) return;
    const m = /^nota-(.+)$/.exec(el.getAttribute('name') || '');
    if (m && el.checked) {
      rr.notas[m[1]] = Object.assign({ nota: null, evidencia: '' }, rr.notas[m[1]], { nota: el.value === NA ? NA : Number(el.value) });
      const limpar = $('[data-limpar="' + m[1] + '"]', form); if (limpar) limpar.hidden = false;
      const ev = $('[data-evidencia="' + m[1] + '"]', form);
      if (ev) ev.setAttribute('placeholder', el.value === NA ? 'Por que esta prática não se aplica' : 'O que mostra que a prática acontece');
      atualizarResultado();
    } else if (el.hasAttribute('data-campo')) aplicarCampoDiag(rr, el);
    guardarRascunhoDiag();
  });
  form.addEventListener('click', ev => {
    const b = ev.target.closest('[data-limpar]'); if (!b) return;
    const id = b.getAttribute('data-limpar'), rr = ESTADO.diag.rascunho; if (!rr) return;
    rr.notas[id] = Object.assign({ nota: null, evidencia: '' }, rr.notas[id], { nota: null });
    $$('input[name="nota-' + id + '"]', form).forEach(x => { x.checked = false; x.removeAttribute('checked'); });
    b.hidden = true; atualizarResultado(); guardarRascunhoDiag();
  });
  form.addEventListener('submit', ev => { ev.preventDefault(); salvarDiag(); });
  const desc = $('[data-descartar]');
  if (desc) desc.addEventListener('click', () => {
    STORE.rascunho(r._chave, null); ESTADO.diag.rascunho = null; renderApp();
  });
  const ap = $('[data-apagar-diag]');
  if (ap) ap.addEventListener('click', () => confirmarApagarDiag(STORE.um('diagnosticos', arg)));
}
function aplicarCampoDiag(rr, el) {
  const c = el.getAttribute('data-campo');
  if (c === 'alvo') { const [t, i] = splitAlvo(el.value); rr.alvoTipo = t; rr.alvoId = i; }
  else rr[c] = el.value;
}
async function salvarDiag() {
  const r = ESTADO.diag.rascunho; if (!r) return;
  const erro = $('[data-erro]'), bt = $('[data-diag-form] button[type=submit]');
  const problemas = [];
  if (!r.alvoTipo || !r.alvoId) problemas.push('Escolha a turma ou a empresa.');
  if (!MOMENTOS.some(m => m[0] === r.momento)) problemas.push('Escolha o momento.');
  if (!dataValida(r.data)) problemas.push('Informe a data do diagnóstico.');
  const semJust = naSemJustificativa(r.notas);
  if (semJust.length) problemas.push('N/A precisa de justificativa antes da pontuação (caderno p. 31): escreva no campo Evidência de ' + codigosPraticas(semJust) + '.');
  const todasNA = dimensoesTodasNA(r.notas);
  if (todasNA.length) problemas.push('O caderno não permite excluir uma dimensão inteira (p. 31): ' + todasNA.map(d => d.nome).join(', ') + ' está com todas as práticas em N/A.');
  if (problemas.length) { erro.innerHTML = avisoHTML(problemas.join(' '), 'vermelho'); return; }
  const notas = {};
  Object.keys(r.notas).forEach(k => { const n = r.notas[k]; if (temMarca(n.nota) || String(n.evidencia || '').trim()) notas[k] = { nota: temMarca(n.nota) ? n.nota : null, evidencia: String(n.evidencia || '').trim() }; });
  const reg = { id: r.id, alvoTipo: r.alvoTipo, alvoId: r.alvoId, momento: r.momento, data: r.data, avaliador: String(r.avaliador || '').trim(), notas, obs: r.obs || '' };
  if (Number.isSafeInteger(r._rev)) reg._rev = r._rev;
  if (bt) { bt.disabled = true; bt.textContent = 'Salvando…'; }
  try {
    await STORE.gravar('diagnosticos', reg);
    STORE.rascunho(r._chave, null);
    ESTADO.diag.rascunho = null;
    ESTADO.diag.alvo = r.alvoTipo + ':' + r.alvoId;
    toast('Diagnóstico salvo.', 'sucesso');
    location.hash = '#/diagnostico';
  } catch (e) {
    if (bt) { bt.disabled = false; bt.textContent = 'Salvar diagnóstico'; }
    erro.innerHTML = avisoHTML(mensagemDeErro(e, 'Não consegui salvar. O rascunho continua guardado neste aparelho'), 'vermelho');
  }
}
function confirmarApagarDiag(d) {
  if (!d) return;
  const veu = abrirModal('<h2>Apagar diagnóstico</h2><p>' + esc(nomeAlvo(d.alvoTipo, d.alvoId)) + ' · ' + esc(rotuloMomento(d.momento)) + ' · ' + esc(fmtData(d.data)) + '</p>' +
    '<p class="dica">O servidor guarda o item apagado e o administrador pode restaurar.</p><div data-erro role="alert"></div>' +
    '<div class="acoes"><button type="button" class="botao perigo" data-sim>Apagar</button><button type="button" class="botao fantasma" data-fechar>Cancelar</button></div>', 'Confirmar exclusão');
  $('[data-sim]', veu).addEventListener('click', async () => {
    try { await STORE.apagar('diagnosticos', d.id); STORE.rascunho('diag_' + d.id, null); ESTADO.diag.rascunho = null; veu.fechar(); toast('Diagnóstico apagado.', 'sucesso'); location.hash = '#/diagnostico'; }
    catch (e) { $('[data-erro]', veu).innerHTML = avisoHTML(mensagemDeErro(e, 'Não consegui apagar'), 'vermelho'); }
  });
}

/* ══════════ plano de 90 dias ══════════ */
const idPlano = turmaId => 'plano-' + turmaId;
function planoDaTurma(turmaId) {
  const ps = STORE.col('planos');
  return ps.find(p => p.id === idPlano(turmaId)) || ps.find(p => p.turmaId === turmaId) || null;
}
// O plano tem código fixo ("plano-<turmaId>"). Arquivado, ele não aceita
// gravação nenhuma: a vof_gravar recusa upsert em item arquivado, com qualquer
// revisão. A tela diz isso em vez de oferecer um plano em branco que o
// servidor recusaria. Plano vivo da turma com outro código continua valendo.
const planoArquivado = turmaId => !planoDaTurma(turmaId) && STORE.arquivado('planos', idPlano(turmaId));
const AVISO_PLANO_ARQUIVADO = 'Este plano foi arquivado. Só o admin pode restaurar.';
function resumoPlano(p) {
  const marcos = Array.isArray(p && p.marcos) ? p.marcos.filter(m => m && String(m.acao || '').trim()) : [];
  return { feitos: marcos.filter(m => m.feito).length, total: marcos.length };
}
function renderPlano(app) {
  if (ESTADO.rota.arg) { renderPlanoEditor(app); return; }
  const turmas = ordenarPorNome(STORE.col('turmas'));
  app.innerHTML = pagina('plano',
    tituloArea('Plano de 90 dias', 'Uma restrição por turma: meta, indicador, responsável e os marcos do Dia 0 ao dia 90, com evidência.') +
    '<section class="cartao"><div class="lista">' + (turmas.length ? turmas.map(t => {
      const p = planoDaTurma(t.id), r = resumoPlano(p);
      return '<a class="linha linha-link" href="#/plano/' + encodeURIComponent(t.id) + '"><div class="linha-texto"><b>' + esc(t.nome || 'Turma sem nome') + '</b><small>' +
        (p ? esc(p.restricao ? 'Restrição: ' + p.restricao : 'Restrição ainda não escrita') + ' · ' + r.feitos + ' de ' + r.total + ' marcos feitos' + (p.dia0 ? ' · Dia 0 em ' + esc(fmtData(p.dia0)) : '') : planoArquivado(t.id) ? 'Plano arquivado. Só o admin pode restaurar.' : 'Sem plano ainda') +
        '</small></div>' + seloStatus(t.status) + '</a>';
    }).join('') : vazioHonesto('Cadastre uma turma para montar o plano.')) + '</div></section>');
  ligarCab();
}
function rascunhoPlano(turmaId) {
  const mem = ESTADO.plano.rascunhos[turmaId];
  if (mem && mem._alteradoEm) return mem;
  let r = STORE.rascunho('plano_' + turmaId);
  if (r && typeof r === 'object' && r._alteradoEm) r._restaurado = true;
  else {
    const p = planoDaTurma(turmaId);
    if (p) r = JSON.parse(JSON.stringify(p));
    else {
      const t = STORE.um('turmas', turmaId);
      r = { id: idPlano(turmaId), turmaId, restricao: '', meta: '', indicador: '', responsavel: '', dia0: (t && dataValida(t.inicio)) ? t.inicio : hojeISO(),
        marcos: FASES.map(f => ({ id: novoId(), fase: f[0], acao: '', evidencia: '', feito: false, data: '' })), checklist: {}, _novo: true };
    }
  }
  if (!Array.isArray(r.marcos)) r.marcos = [];
  r.marcos.forEach(m => { if (!m.id) m.id = novoId(); });
  if (!r.checklist || typeof r.checklist !== 'object' || Array.isArray(r.checklist)) r.checklist = {};
  ESTADO.plano.rascunhos[turmaId] = r;
  return r;
}
function guardarRascunhoPlano(turmaId) {
  const r = ESTADO.plano.rascunhos[turmaId]; if (!r) return;
  r._alteradoEm = new Date().toISOString();
  STORE.rascunho('plano_' + turmaId, r);
}
function itensChecklist(doc) {
  if (!doc) return [];
  const out = [];
  const pegarTexto = it => typeof it === 'string' ? it : CHAVES_TITULO.map(k => it && typeof it[k] === 'string' ? it[k] : '').find(Boolean) || '';
  const add = (it, grupo) => {
    const texto = pegarTexto(it); if (!texto) return;
    const id = (it && typeof it === 'object' && it.id) ? String(it.id) : 'c' + hashTexto(texto);
    out.push({ id, texto, grupo: (it && typeof it === 'object' && (it.fase || it.grupo)) || grupo || '', detalhe: it && typeof it === 'object' ? (it.detalhe || it.descricao || it.evidencia || '') : '' });
  };
  const grupos = doc && typeof doc === 'object' && !Array.isArray(doc) ? (doc.grupos || doc.fases) : null;
  if (Array.isArray(grupos)) grupos.forEach(g => listaDe(g, ['itens', 'lista']).forEach(it => add(it, g.titulo || g.fase || g.nome || '')));
  listaDe(doc, ['itens', 'checklist', 'lista']).forEach(it => add(it, ''));
  return out;
}
function htmlMarcos(r) {
  return FASES.map(([fase]) => {
    const prazo = prazoDaFase(r.dia0, fase);
    const doFase = r.marcos.filter(m => m.fase === fase);
    return '<section class="fase" data-fase="' + esc(fase) + '"><div class="fase-topo"><h3>' + esc(fase) + '</h3><small>' + (prazo ? 'prazo ' + esc(fmtData(prazo)) : 'defina o Dia 0') + '</small></div>' +
      (doFase.length ? doFase.map(m => {
        const atrasado = !m.feito && prazo && prazo < hojeISO() && String(m.acao || '').trim();
        return '<div class="marco' + (m.feito ? ' feito' : '') + '" data-marco="' + esc(m.id) + '">' +
          '<label class="marco-check"><input type="checkbox" data-m="feito"' + (m.feito ? ' checked' : '') + '><span class="sr">Feito</span></label>' +
          '<div class="marco-campos">' +
          '<label>Ação<input type="text" data-m="acao" maxlength="400" value="' + esc(m.acao || '') + '"></label>' +
          '<div class="duas"><label>Evidência<input type="text" data-m="evidencia" maxlength="600" value="' + esc(m.evidencia || '') + '"></label>' +
          '<label>Feito em<input type="date" data-m="data" value="' + esc(m.data || '') + '"></label></div>' +
          (atrasado ? '<span class="selo vermelho">atrasado</span>' : '') +
          '</div><button type="button" class="botao mini fantasma" data-remover-marco="' + esc(m.id) + '" aria-label="Remover esta ação">Remover</button></div>';
      }).join('') : '<p class="dica">Nenhuma ação nesta fase.</p>') +
      '<button type="button" class="botao mini suave" data-novo-marco="' + esc(fase) + '">Adicionar ação</button></section>';
  }).join('');
}
function htmlChecklist(r) {
  const c = STORE.conteudoEmMemoria();
  if (!c) return '<p class="vazio" data-checklist-carregando>Carregando o checklist…</p>';
  const itens = itensChecklist(c.docs.checklist);
  if (!itens.length) return '<p class="dica">O checklist do APN ainda não foi carregado no sistema.</p>';
  let grupo = null;
  return itens.map(it => {
    const v = r.checklist[it.id] || {};
    const cab = it.grupo && it.grupo !== grupo ? '<h3 class="check-grupo">' + esc(it.grupo) + '</h3>' : '';
    grupo = it.grupo || grupo;
    return cab + '<div class="check-item' + (v.feito ? ' feito' : '') + '" data-check="' + esc(it.id) + '">' +
      '<label class="check-linha"><input type="checkbox" data-c="feito"' + (v.feito ? ' checked' : '') + '><span>' + esc(it.texto) + (it.detalhe ? '<small>' + esc(it.detalhe) + '</small>' : '') + '</span></label>' +
      '<div class="duas"><label>Evidência<input type="text" data-c="evidencia" maxlength="600" value="' + esc(v.evidencia || '') + '"></label><label>Data<input type="date" data-c="data" value="' + esc(v.data || '') + '"></label></div></div>';
  }).join('');
}
function renderPlanoEditor(app) {
  const turmaId = ESTADO.rota.arg;
  const turma = STORE.um('turmas', turmaId);
  if (!turma) {
    app.innerHTML = pagina('plano', tituloArea('Plano de 90 dias') + '<div data-aguardando>' + vazioHonesto('Esta turma não existe mais ou ainda não chegou a este aparelho.') + '</div><a class="botao fantasma" href="#/plano">Voltar</a>');
    ligarCab(); return;
  }
  if (planoArquivado(turmaId)) { renderPlanoArquivado(app, turma); return; }
  const r = rascunhoPlano(turmaId);
  const edita = podeEditar();
  app.innerHTML = pagina('plano',
    '<div class="titulo-area"><a class="voltar" href="#/plano">Planos</a><h1>Plano de 90 dias</h1><p>' + esc(turma.nome) + ' · Nível ' + esc(turma.nivel || 1) + '</p></div>' +
    (r._alteradoEm ? '<div class="aviso amarelo">Rascunho guardado neste aparelho em ' + esc(fmtHora(r._alteradoEm)) + ', ainda não salvo no servidor. <button type="button" class="botao mini fantasma" data-descartar>Descartar o rascunho</button></div>' : '') +
    (edita ? '' : avisoHTML('Seu acesso é só de leitura.', 'azul')) +
    '<form data-plano-form novalidate>' +
    '<section class="cartao"><h2>A restrição e a meta</h2>' +
    campo('Restrição escolhida', '<textarea data-p="restricao" rows="2" maxlength="2000">' + esc(r.restricao || '') + '</textarea>', 'Uma restrição por vez: o ponto que mais trava o resultado agora.') +
    '<div class="duas">' + campo('Meta', '<input type="text" data-p="meta" maxlength="400" value="' + esc(r.meta || '') + '">') + campo('Indicador', '<input type="text" data-p="indicador" maxlength="400" value="' + esc(r.indicador || '') + '">') + '</div>' +
    '<div class="duas">' + campo('Responsável', '<input type="text" data-p="responsavel" maxlength="160" value="' + esc(r.responsavel || '') + '">') + campo('Dia 0', '<input type="date" data-p="dia0" value="' + esc(r.dia0 || '') + '">') + '</div>' +
    '</section>' +
    '<section class="cartao"><h2>Marcos</h2><div id="plano-marcos">' + htmlMarcos(r) + '</div></section>' +
    '<section class="cartao"><h2>Checklist do APN</h2><div id="plano-checklist">' + htmlChecklist(r) + '</div></section>' +
    '<div data-erro role="alert"></div>' +
    (edita ? '<div class="acoes barra-salvar"><button type="submit" class="botao">Salvar plano</button></div>' : '') +
    '</form>');
  ligarCab();
  const form = $('[data-plano-form]');
  if (!edita) $$('input, select, textarea, button[data-novo-marco], button[data-remover-marco]', form).forEach(el => { el.disabled = true; });
  if (!STORE.conteudoEmMemoria()) {
    STORE.carregarConteudo().then(() => {
      const alvo = $('#plano-checklist');
      if (alvo && ESTADO.rota.nome === 'plano' && ESTADO.rota.arg === turmaId) alvo.innerHTML = htmlChecklist(ESTADO.plano.rascunhos[turmaId] || r);
      if (!edita) $$('#plano-checklist input').forEach(el => { el.disabled = true; });
    }).catch(e => { const alvo = $('#plano-checklist'); if (alvo) alvo.innerHTML = avisoHTML('Não consegui trazer o checklist: ' + e.message, 'amarelo'); });
  }
  let tempo = null;
  const guardar = () => {
    const rr = ESTADO.plano.rascunhos[turmaId]; if (rr) rr._alteradoEm = new Date().toISOString();
    clearTimeout(tempo); tempo = setTimeout(() => guardarRascunhoPlano(turmaId), 300);
  };
  const lerEvento = ev => {
    const el = ev.target, rr = ESTADO.plano.rascunhos[turmaId]; if (!rr) return false;
    if (el.hasAttribute('data-p')) {
      rr[el.getAttribute('data-p')] = el.value;
      if (el.getAttribute('data-p') === 'dia0' && ev.type === 'change') repintarMarcos(turmaId);
      return true;
    }
    const caixaM = el.closest('[data-marco]');
    if (caixaM && el.hasAttribute('data-m')) {
      const m = rr.marcos.find(x => x.id === caixaM.getAttribute('data-marco')); if (!m) return false;
      const k = el.getAttribute('data-m');
      if (k === 'feito') {
        m.feito = !!el.checked;
        if (m.feito && !m.data) { m.data = hojeISO(); const d = $('[data-m=data]', caixaM); if (d) d.value = m.data; }
        caixaM.classList.toggle('feito', m.feito);
      } else m[k] = el.value;
      return true;
    }
    const caixaC = el.closest('[data-check]');
    if (caixaC && el.hasAttribute('data-c')) {
      const id = caixaC.getAttribute('data-check');
      const v = rr.checklist[id] = Object.assign({ feito: false, data: '', evidencia: '' }, rr.checklist[id]);
      const k = el.getAttribute('data-c');
      if (k === 'feito') {
        v.feito = !!el.checked;
        if (v.feito && !v.data) { v.data = hojeISO(); const d = $('[data-c=data]', caixaC); if (d) d.value = v.data; }
        caixaC.classList.toggle('feito', v.feito);
      } else v[k] = el.value;
      return true;
    }
    return false;
  };
  form.addEventListener('input', ev => { if (lerEvento(ev)) guardar(); });
  form.addEventListener('change', ev => { if (lerEvento(ev)) guardar(); });
  form.addEventListener('click', ev => {
    const novo = ev.target.closest('[data-novo-marco]');
    const rem = ev.target.closest('[data-remover-marco]');
    const rr = ESTADO.plano.rascunhos[turmaId]; if (!rr || (!novo && !rem)) return;
    if (novo) rr.marcos.push({ id: novoId(), fase: novo.getAttribute('data-novo-marco'), acao: '', evidencia: '', feito: false, data: '' });
    if (rem) rr.marcos = rr.marcos.filter(m => m.id !== rem.getAttribute('data-remover-marco'));
    repintarMarcos(turmaId); guardarRascunhoPlano(turmaId);
    if (novo) { const ultimo = $$('[data-fase="' + novo.getAttribute('data-novo-marco') + '"] [data-m=acao]').pop(); if (ultimo && ultimo.focus) ultimo.focus(); }
  });
  form.addEventListener('submit', ev => { ev.preventDefault(); salvarPlano(turmaId); });
  const desc = $('[data-descartar]');
  if (desc) desc.addEventListener('click', () => { STORE.rascunho('plano_' + turmaId, null); delete ESTADO.plano.rascunhos[turmaId]; renderApp(); });
}
// Plano arquivado: nada para editar. O papel vem do crachá (souAdmin); o
// facilitador não vê o botão, e o servidor recusaria o restore dele (403) de
// qualquer jeito. data-aguardando deixa a atualização vinda do servidor
// redesenhar a tela: se o admin restaurar de outro aparelho, o plano aparece.
function renderPlanoArquivado(app, turma) {
  const rasc = STORE.rascunho('plano_' + turma.id);
  app.innerHTML = pagina('plano',
    '<div class="titulo-area"><a class="voltar" href="#/plano">Planos</a><h1>Plano de 90 dias</h1><p>' + esc(turma.nome) + ' · Nível ' + esc(turma.nivel || 1) + '</p></div>' +
    '<section class="cartao" data-plano-arquivado data-aguardando>' + avisoHTML(AVISO_PLANO_ARQUIVADO, 'amarelo') +
    (rasc && rasc._alteradoEm ? '<p class="dica">O rascunho deste plano continua guardado neste aparelho.</p>' : '') +
    '<div data-erro role="alert"></div>' +
    (souAdmin() ? '<div class="acoes"><button type="button" class="botao" data-restaurar-plano>Restaurar</button></div>' : '') +
    '</section>');
  ligarCab();
  const bt = $('[data-restaurar-plano]');
  if (!bt) return;
  bt.addEventListener('click', async () => {
    bt.disabled = true; bt.textContent = 'Restaurando…';
    try {
      await STORE.restaurar('planos', idPlano(turma.id));
      toast('Plano restaurado.', 'sucesso');
      renderApp({ manterRolagem: true });
    } catch (e) {
      bt.disabled = false; bt.textContent = 'Restaurar';
      const erro = $('[data-plano-arquivado] [data-erro]');
      if (erro) erro.innerHTML = avisoHTML(mensagemDeErro(e, 'Não consegui restaurar'), 'vermelho');
    }
  });
}
// Redesenha só a lista de marcos, a partir do rascunho: o que foi digitado
// nos outros campos continua onde está.
function repintarMarcos(turmaId) {
  const alvo = $('#plano-marcos'), rr = ESTADO.plano.rascunhos[turmaId];
  if (alvo && rr) alvo.innerHTML = htmlMarcos(rr);
}
async function salvarPlano(turmaId) {
  const r = ESTADO.plano.rascunhos[turmaId]; if (!r) return;
  const erro = $('[data-erro]'), bt = $('[data-plano-form] button[type=submit]');
  if (r.dia0 && !dataValida(r.dia0)) { erro.innerHTML = avisoHTML('O Dia 0 não é uma data válida.', 'vermelho'); return; }
  const reg = {
    id: r.id || idPlano(turmaId), turmaId, restricao: String(r.restricao || '').trim(), meta: String(r.meta || '').trim(), indicador: String(r.indicador || '').trim(),
    responsavel: String(r.responsavel || '').trim(), dia0: r.dia0 || '',
    marcos: r.marcos.map(m => ({ id: m.id, fase: m.fase, acao: String(m.acao || '').trim(), evidencia: String(m.evidencia || '').trim(), feito: !!m.feito, data: m.data || '' })),
    checklist: r.checklist,
  };
  if (Number.isSafeInteger(r._rev)) reg._rev = r._rev;
  if (bt) { bt.disabled = true; bt.textContent = 'Salvando…'; }
  try {
    await STORE.gravar('planos', reg, { idFixo: !!r._novo });
    STORE.rascunho('plano_' + turmaId, null);
    delete ESTADO.plano.rascunhos[turmaId];
    toast('Plano salvo.', 'sucesso');
    renderApp({ manterRolagem: true });
  } catch (e) {
    if (e && e.arquivado) {
      // Arquivado enquanto a tela estava aberta: o rascunho fica guardado e a
      // tela passa a dizer a verdade (só o admin restaura).
      if (r._alteradoEm) guardarRascunhoPlano(turmaId);
      delete ESTADO.plano.rascunhos[turmaId];
      toast(AVISO_PLANO_ARQUIVADO, 'erro');
      renderApp({ manterRolagem: true });
      return;
    }
    if (bt) { bt.disabled = false; bt.textContent = 'Salvar plano'; }
    erro.innerHTML = avisoHTML(mensagemDeErro(e, 'Não consegui salvar. O rascunho continua guardado neste aparelho'), 'vermelho');
  }
}

/* ══════════ apostila ══════════ */
function renderApostila(app) {
  const a = ESTADO.apostila;
  app.innerHTML = pagina('apostila',
    tituloArea('Apostila', 'A apostila completa do Método V.O.F. fica num cofre privado. O botão gera um link que vale por 10 minutos, só para quem entrou no sistema.') +
    '<section class="cartao"><button type="button" class="botao" data-apostila>Baixar a apostila</button><div id="apostila-status" role="status">' + htmlStatusApostila(a) + '</div></section>');
  ligarCab();
  $('[data-apostila]').addEventListener('click', pedirApostila);
}
function htmlStatusApostila(a) {
  if (a.estado === 'gerando') return '<p class="vazio">Gerando o link…</p>';
  if (a.estado === 'erro') return avisoHTML('Não consegui gerar o link da apostila: ' + a.erro, 'vermelho');
  if (a.estado === 'pronto') {
    const exp = a.expira ? new Date(typeof a.expira === 'number' && a.expira < 1e12 ? a.expira * 1000 : a.expira) : null;
    const quando = exp && !isNaN(exp.getTime()) ? ' Vale até ' + doisDigitos(exp.getHours()) + ':' + doisDigitos(exp.getMinutes()) + '.' : ' Vale por 10 minutos.';
    return '<p class="aviso verde">Link pronto.' + esc(quando) + ' Se a apostila não abriu sozinha, use o botão abaixo.</p><a class="botao suave" href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">Abrir a apostila</a>';
  }
  return '';
}
async function pedirApostila() {
  const a = ESTADO.apostila, bt = $('[data-apostila]');
  a.estado = 'gerando'; a.erro = ''; a.url = '';
  const pintar = () => { const s = $('#apostila-status'); if (s) s.innerHTML = htmlStatusApostila(a); };
  pintar(); if (bt) bt.disabled = true;
  try {
    const r = await STORE.urlArquivo('apostila');
    a.estado = 'pronto'; a.url = r.url; a.expira = r.expira || '';
    try { if (typeof window.open === 'function') window.open(r.url, '_blank', 'noopener'); } catch {}
  } catch (e) {
    a.estado = 'erro'; a.erro = e.message || 'erro desconhecido';
  } finally { if (bt) bt.disabled = false; pintar(); }
}

/* ══════════ apresentação ══════════ */
function obterSlides(forcar) {
  if (ESTADO.apres.slides && !forcar) return ESTADO.apres.slides;
  const m = metodo();
  let lista = [];
  try { lista = m && typeof m.slides === 'function' ? m.slides() : []; } catch { lista = []; }
  ESTADO.apres.slides = (Array.isArray(lista) ? lista : []).filter(s => s && typeof s === 'object').map((s, i) => ({
    indice: i, titulo: String(s.titulo || 'Slide ' + (i + 1)), tese: String(s.tese || ''), frase: String(s.frase || ''),
    perguntas: Array.isArray(s.perguntas) ? s.perguntas.map(String) : [], evidencias: Array.isArray(s.evidencias) ? s.evidencias.map(String) : [],
    ferramentas: Array.isArray(s.ferramentas) ? s.ferramentas.map(String) : [], fonte: String(s.fonte || ''),
    visualHTML: typeof s.visualHTML === 'string' ? s.visualHTML : '',
  }));
  return ESTADO.apres.slides;
}
const limitarIndice = (n, total) => Math.max(0, Math.min(total - 1, Number.isInteger(n) ? n : 0));
const opcoesSlides = (slides, atual) => slides.map((s, i) => '<option value="' + i + '"' + (i === atual ? ' selected' : '') + '>' + doisDigitos(i + 1) + ' · ' + esc(s.titulo) + '</option>').join('');
function lembrarIndice() { try { localStorage.setItem('vof_apres_indice', String(ESTADO.apres.indice)); } catch {} }
function indiceLembrado() { try { const n = Number(localStorage.getItem('vof_apres_indice')); return Number.isInteger(n) ? n : 0; } catch { return 0; } }

function renderApresentacao(app) {
  const slides = obterSlides(true);
  ESTADO.apres.indice = limitarIndice(ESTADO.apres.indice || indiceLembrado(), slides.length || 1);
  app.innerHTML = pagina('apresentacao',
    tituloArea('Apresentação', 'Projete os slides do método em tela cheia. Passe com o teclado, com o passador ou pelo celular.') +
    (slides.length ? '' : avisoHTML('Os slides do método não carregaram (metodo.js). Recarregue a página.', 'vermelho')) +
    '<div class="resumo-grade">' +
    '<section class="cartao"><h2>Projetar nesta tela</h2>' +
    (slides.length ? campo('Começar em', '<select data-ap-inicio>' + opcoesSlides(slides, ESTADO.apres.indice) + '</select>') +
      '<div class="chips" role="group" aria-label="Modo">' + [['apresentar', 'Apresentar'], ['aplicar', 'Aplicar']].map(([v, t]) => '<button type="button" class="chip" data-ap-modo="' + v + '" aria-pressed="' + (ESTADO.apres.modo === v) + '">' + t + '</button>').join('') + '</div>' +
      '<div class="acoes"><button type="button" class="botao" data-ap-projetar>Projetar</button>' + (podeEditar() ? '<button type="button" class="botao suave" data-ap-sala>Projetar e controlar pelo celular</button>' : '') + '</div>' +
      '<p class="dica">Avançar: seta para a direita, Espaço ou PageDown. Voltar: seta para a esquerda ou PageUp. Home e End vão ao início e ao fim. F liga a tela cheia e B escurece a tela.</p>' : '') +
    '</section>' +
    '<section class="cartao"><h2>Controlar pelo celular</h2>' +
    '<p>Na tela que projeta, toque em "Projetar e controlar pelo celular". Aparece um código de 6 letras e números: digite aqui.</p>' +
    '<form data-ap-controle novalidate class="linha-form"><label class="sr" for="ap-codigo">Código da sala</label><input id="ap-codigo" type="text" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Código" data-ap-codigo>' +
    '<button type="submit" class="botao">Conectar</button></form><div data-ap-erro role="alert"></div></section>' +
    '<section class="cartao"><h2>Versão com prática</h2><p>A apresentação do método com os exercícios de aplicação e a jornada de missões.</p>' +
    '<button type="button" class="botao suave" data-ap-metodo' + (metodo() && typeof metodo().abrirApresentacao === 'function' ? '' : ' disabled') + '>Abrir a versão com prática</button></section>' +
    '</div>');
  ligarCab();
  const sel = $('[data-ap-inicio]');
  if (sel) sel.addEventListener('change', () => { ESTADO.apres.indice = limitarIndice(Number(sel.value), slides.length); lembrarIndice(); });
  $$('[data-ap-modo]').forEach(b => b.addEventListener('click', () => {
    ESTADO.apres.modo = b.getAttribute('data-ap-modo');
    $$('[data-ap-modo]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  }));
  const proj = $('[data-ap-projetar]');
  // Tela cheia precisa de um toque de verdade: é pedida AQUI, no clique, antes de trocar de tela.
  if (proj) proj.addEventListener('click', () => { entrarTelaCheia(); location.hash = '#/palco'; });
  const sala = $('[data-ap-sala]');
  if (sala) sala.addEventListener('click', () => { entrarTelaCheia(); criarSala(sala); });
  $('[data-ap-controle]').addEventListener('submit', ev => {
    ev.preventDefault();
    const cod = normalizarCodigo($('[data-ap-codigo]').value);
    if (cod.length !== 6) { $('[data-ap-erro]').innerHTML = avisoHTML('O código tem 6 letras e números.', 'vermelho'); return; }
    location.hash = '#/controle/' + cod;
  });
  const mt = $('[data-ap-metodo]');
  if (mt) mt.addEventListener('click', () => {
    // As funções da casca vão junto: sem elas, quem nunca abriu a aba Método
    // ficava sem o botão do complemento e sem a apostila dentro da sala.
    try { metodo().abrirApresentacao(ESTADO.apres.indice, ESTADO.apres.modo, { abrirComplemento, abrirApostila: irParaApostila }); }
    catch (e) { toast('Não consegui abrir a versão com prática: ' + e.message, 'erro'); }
  });
}
const normalizarCodigo = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
function gerarCodigo() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = new Uint8Array(6); crypto.getRandomValues(b);
  return Array.from(b, x => alfabeto[x % alfabeto.length]).join('');
}
async function criarSala(botao) {
  if (botao) botao.disabled = true;
  try {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const codigo = gerarCodigo();
      const atual = await STORE.lerSala(codigo);
      if (atual.registro) continue;
      const reg = { id: codigo, slide: ESTADO.apres.indice, modo: ESTADO.apres.modo, atualizadoPor: ESTADO.sessao.usuario, atualizadoEm: new Date().toISOString() };
      const r = await STORE.gravarSala(reg, atual.revision);
      prepararSala(codigo); ESTADO.sala.rev = r.revision; ESTADO.sala.ultimo = { slide: reg.slide, modo: reg.modo };
      ESTADO.apres.avisoSala = true;
      location.hash = '#/palco/' + codigo;
      return;
    }
    toast('Não achei um código de sala livre. Tente de novo.', 'erro');
  } catch (e) {
    toast(mensagemDeErro(e, 'Não consegui criar a sala'), 'erro');
  } finally { if (botao) botao.disabled = false; }
}
function prepararSala(codigo) {
  if (ESTADO.sala.codigo === codigo) return;
  ESTADO.sala = { codigo, rev: null, emVoo: false, desejado: null, escritoEm: 0, conexao: '', erro: '', ultimo: null };
}

// ---------- tela cheia
function entrarTelaCheia() {
  const el = document.documentElement;
  const f = el && (el.requestFullscreen || el.webkitRequestFullscreen);
  if (!f) return false;
  try { const p = f.call(el); if (p && typeof p.catch === 'function') p.catch(() => {}); return true; } catch { return false; }
}
function sairTelaCheia() {
  const d = document;
  if (!(d.fullscreenElement || d.webkitFullscreenElement)) return;
  const f = d.exitFullscreen || d.webkitExitFullscreen;
  try { const p = f && f.call(d); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch {}
}
function alternarTelaCheia() {
  if (document.fullscreenElement || document.webkitFullscreenElement) sairTelaCheia();
  else if (!entrarTelaCheia()) toast('Este aparelho não abre tela cheia pelo navegador. A apresentação já ocupa a janela inteira.');
}

// ---------- palco (a tela projetada)
function htmlSlide(s, modo, total) {
  const lista = (xs, ordenada) => xs.length ? (ordenada ? '<ol>' : '<ul>') + xs.map(x => '<li>' + esc(x) + '</li>').join('') + (ordenada ? '</ol>' : '</ul>') : '';
  const numero = '<p class="slide-num">' + doisDigitos(s.indice + 1) + ' de ' + total + '</p>';
  if (modo === 'aplicar') {
    const temPerg = s.perguntas.length, temEv = s.evidencias.length, temFe = s.ferramentas.length;
    return '<article class="slide slide-aplicar">' + numero + '<h1 class="slide-titulo">' + esc(s.titulo) + '</h1>' +
      (temPerg ? '<section class="slide-perguntas"><h2>Perguntas para o grupo</h2>' + lista(s.perguntas, true) + '</section>' : '') +
      ((temEv || temFe) ? '<div class="slide-colunas">' + (temEv ? '<section><h2>Evidências</h2>' + lista(s.evidencias) + '</section>' : '') + (temFe ? '<section><h2>Ferramentas</h2>' + lista(s.ferramentas) + '</section>' : '') + '</div>' : '') +
      (!temPerg && !temEv && !temFe ? (s.tese ? '<p class="slide-tese">' + esc(s.tese) + '</p>' : '') : '') +
      (s.fonte ? '<p class="slide-fonte">' + esc(s.fonte) + '</p>' : '') + '</article>';
  }
  return '<article class="slide slide-apresentar">' + numero + '<h1 class="slide-titulo">' + esc(s.titulo) + '</h1>' +
    (s.tese ? '<p class="slide-tese">' + esc(s.tese) + '</p>' : '') +
    (s.visualHTML ? '<div class="slide-visual">' + s.visualHTML + '</div>' : '') +
    (s.frase ? '<blockquote class="slide-frase">' + esc(s.frase) + '</blockquote>' : '') +
    (s.fonte ? '<p class="slide-fonte">' + esc(s.fonte) + '</p>' : '') + '</article>';
}
function renderPalco(app) {
  const slides = obterSlides();
  const codigo = normalizarCodigo(ESTADO.rota.arg);
  document.body.classList.add('modo-palco');
  if (!slides.length) {
    app.innerHTML = '<div class="palco"><div class="palco-slide">' + avisoHTML('Os slides do método não carregaram (metodo.js).', 'vermelho') + '<a class="botao" href="#/apresentacao">Voltar</a></div></div>';
    return;
  }
  if (codigo) prepararSala(codigo);
  ESTADO.apres.indice = limitarIndice(ESTADO.apres.indice, slides.length);
  app.innerHTML = '<div class="palco" id="palco">' +
    '<div class="palco-slide" id="palco-slide" aria-live="polite"></div>' +
    '<div class="palco-progresso" aria-hidden="true"><i id="palco-prog"></i></div>' +
    (codigo ? '<div class="palco-sala" id="palco-sala">Sala <b>' + esc(codigo) + '</b> <span data-conexao></span></div>' : '') +
    '<div class="palco-escuro" id="palco-escuro"' + (ESTADO.apres.escuro ? '' : ' hidden') + '></div>' +
    '<nav class="palco-barra" id="palco-barra" aria-label="Controles da apresentação">' +
    '<button type="button" class="botao fantasma-claro" data-p="sair">Sair</button>' +
    '<button type="button" class="botao fantasma-claro" data-p="ant" aria-label="Slide anterior">Anterior</button>' +
    '<span class="palco-cont" id="palco-cont"></span>' +
    '<button type="button" class="botao" data-p="prox" aria-label="Próximo slide">Próximo</button>' +
    '<label class="palco-ir"><span class="sr">Ir para o slide</span><select data-p-ir>' + opcoesSlides(slides, ESTADO.apres.indice) + '</select></label>' +
    '<span class="chips" role="group" aria-label="Modo">' + [['apresentar', 'Apresentar'], ['aplicar', 'Aplicar']].map(([v, t]) => '<button type="button" class="chip" data-p-modo="' + v + '" aria-pressed="' + (ESTADO.apres.modo === v) + '">' + t + '</button>').join('') + '</span>' +
    '<button type="button" class="botao fantasma-claro" data-p="tela">Tela cheia</button>' +
    (!codigo && podeEditar() ? '<button type="button" class="botao fantasma-claro" data-p="sala">Controlar pelo celular</button>' : '') +
    '</nav></div>';
  pintarSlide();
  const palco = $('#palco');
  palco.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) { if (ev.target.closest('#palco-escuro')) alternarEscuro(false); return; }
    const acao = b.getAttribute('data-p');
    if (acao === 'sair') { sairTelaCheia(); location.hash = '#/apresentacao'; }
    else if (acao === 'ant') irPara(ESTADO.apres.indice - 1);
    else if (acao === 'prox') irPara(ESTADO.apres.indice + 1);
    else if (acao === 'tela') alternarTelaCheia();
    else if (acao === 'sala') criarSala(b);
    else if (b.hasAttribute('data-p-modo')) trocarModo(b.getAttribute('data-p-modo'));
    // Tira o foco do botão: o Espaço do passador não pode "clicar" de novo nele.
    if (typeof b.blur === 'function') b.blur();
  });
  $('[data-p-ir]').addEventListener('change', ev => { irPara(Number(ev.target.value)); if (typeof ev.target.blur === 'function') ev.target.blur(); });
  palco.addEventListener('mousemove', mostrarBarra);
  mostrarBarra();
  if (codigo) {
    if (ESTADO.apres.avisoSala) { ESTADO.apres.avisoSala = false; mostrarCodigoSala(codigo); }
    iniciarPoll(codigo, aoLerSalaNoPalco);
  }
}
function mostrarCodigoSala(codigo) {
  const endereco = String(location.origin || '') + String(location.pathname || '') + '#/controle/' + codigo;
  abrirModal('<h2>Sala criada</h2><p class="codigo-grande">' + esc(codigo) + '</p>' +
    '<p>No celular, entre no Método V.O.F., toque em Apresentação e digite este código. Ou abra no celular:</p><p class="endereco">' + esc(endereco) + '</p>' +
    '<div class="acoes"><button type="button" class="botao" data-fechar>Entendi</button></div>', 'Código da sala');
}
function mostrarBarra() {
  const barra = $('#palco-barra'); if (!barra) return;
  barra.classList.add('visivel');
  clearTimeout(ESTADO.apres.barraTimer);
  ESTADO.apres.barraTimer = setTimeout(() => { const b = $('#palco-barra'); if (b) b.classList.remove('visivel'); }, 3000);
}
function pintarSlide() {
  const slides = obterSlides(), alvo = $('#palco-slide'); if (!alvo || !slides.length) return;
  const i = ESTADO.apres.indice = limitarIndice(ESTADO.apres.indice, slides.length);
  alvo.innerHTML = htmlSlide(slides[i], ESTADO.apres.modo, slides.length);
  const cont = $('#palco-cont'); if (cont) cont.textContent = (i + 1) + ' / ' + slides.length;
  const prog = $('#palco-prog'); if (prog) prog.style.width = ((i + 1) / slides.length * 100) + '%';
  const ant = $('[data-p=ant]'), prox = $('[data-p=prox]');
  if (ant) ant.disabled = i === 0;
  if (prox) prox.disabled = i === slides.length - 1;
  const sel = $('[data-p-ir]'); if (sel) marcarOpcao(sel, String(i));
  $$('[data-p-modo]').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-p-modo') === ESTADO.apres.modo)));
  const palco = $('#palco'); if (palco) palco.setAttribute('data-modo', ESTADO.apres.modo);
  document.title = doisDigitos(i + 1) + ' · ' + slides[i].titulo;
  lembrarIndice();
}
// A sala que ESTA tela de palco acompanha (vazio no palco sem sala).
function salaDoPalco() {
  const c = ESTADO.sala.codigo;
  return ESTADO.rota.nome === 'palco' && c && normalizarCodigo(ESTADO.rota.arg) === c ? c : '';
}
function irPara(n, deFora) {
  const slides = obterSlides(); if (!slides.length) return;
  const novo = limitarIndice(n, slides.length);
  if (novo === ESTADO.apres.indice && !deFora) return;
  ESTADO.apres.indice = novo;
  pintarSlide();
  if (!deFora && salaDoPalco()) escreverSala(novo, ESTADO.apres.modo);
}
function trocarModo(modo, deFora) {
  if (modo !== 'apresentar' && modo !== 'aplicar') return;
  if (modo === ESTADO.apres.modo && !deFora) return;
  ESTADO.apres.modo = modo;
  pintarSlide();
  if (!deFora && salaDoPalco()) escreverSala(ESTADO.apres.indice, modo);
}
function alternarEscuro(forcar) {
  ESTADO.apres.escuro = typeof forcar === 'boolean' ? forcar : !ESTADO.apres.escuro;
  const e = $('#palco-escuro'); if (e) e.hidden = !ESTADO.apres.escuro;
}
// Teclado e passador. Passador comum manda PageDown/PageUp (ou setas); o
// botão de tela preta manda "." ou "B". Campo de texto e seletor ficam com as
// próprias teclas; atalho com Ctrl, Alt ou Cmd é do navegador.
function teclaGlobal(ev) {
  if (!ESTADO.sessao || ESTADO.rota.nome !== 'palco') return;
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (temJanelaAberta()) return;
  const alvo = ev.target, tag = alvo && alvo.tagName ? alvo.tagName : '';
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (alvo && alvo.isContentEditable)) return;
  if ((tag === 'BUTTON' || tag === 'A') && (ev.key === ' ' || ev.key === 'Enter')) return;
  const k = ev.key;
  let feito = true;
  if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !ev.shiftKey) || k === 'n' || k === 'N') irPara(ESTADO.apres.indice + 1);
  else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && ev.shiftKey) || k === 'Backspace' || k === 'p' || k === 'P') irPara(ESTADO.apres.indice - 1);
  else if (k === 'Home') irPara(0);
  else if (k === 'End') irPara(obterSlides().length - 1);
  else if (k === 'f' || k === 'F') alternarTelaCheia();
  else if (k === 'b' || k === 'B' || k === '.') alternarEscuro();
  else if (k === 'Escape' && ESTADO.apres.escuro) alternarEscuro(false);
  else feito = false;
  if (feito) { if (typeof ev.preventDefault === 'function') ev.preventDefault(); mostrarBarra(); }
}

// ---------- sala: consulta a cada 1,5 s e escrita em fila
function pararPoll() {
  if (ESTADO.poll) { clearTimeout(ESTADO.poll.timer); ESTADO.poll = null; }
}
function iniciarPoll(codigo, aoReceber) {
  const chave = ESTADO.rota.nome + '/' + codigo;
  if (ESTADO.poll && ESTADO.poll.chave === chave) { ESTADO.poll.aoReceber = aoReceber; return; }
  pararPoll();
  const p = ESTADO.poll = { chave, timer: null, emVoo: false, aoReceber };
  const passo = async () => {
    if (ESTADO.poll !== p) return;
    const oculto = typeof document.visibilityState === 'string' && document.visibilityState === 'hidden';
    if (!p.emVoo && !oculto) {
      p.emVoo = true;
      const pedidoEm = Date.now();
      try {
        const r = await STORE.lerSala(codigo);
        if (ESTADO.poll !== p) return;
        marcarConexao('ok');
        // Resposta que saiu antes da nossa última escrita chega velha: ignora.
        if (pedidoEm >= ESTADO.sala.escritoEm) p.aoReceber(r);
      } catch (e) {
        if (ESTADO.poll !== p) return;
        marcarConexao('erro', e.message);
      } finally { p.emVoo = false; }
    }
    if (ESTADO.poll === p) p.timer = setTimeout(passo, 1500);
  };
  passo();
}
function marcarConexao(estado, erro) {
  ESTADO.sala.conexao = estado; ESTADO.sala.erro = erro || '';
  $$('[data-conexao]').forEach(el => {
    el.textContent = estado === 'ok' ? 'conectada' : estado === 'sumiu' ? 'sala não encontrada' : 'sem conexão';
    el.className = 'conexao ' + (estado === 'ok' ? 'ok' : 'erro');
    el.title = erro || '';
  });
}
function aoLerSalaNoPalco(r) {
  if (!r.registro) { marcarConexao('sumiu', 'Esta sala não existe mais.'); return; }
  ESTADO.sala.rev = r.revision;
  if (ESTADO.sala.emVoo || ESTADO.sala.desejado) return;
  const s = r.registro;
  ESTADO.sala.ultimo = { slide: s.slide, modo: s.modo };
  if (s.modo && s.modo !== ESTADO.apres.modo) trocarModo(s.modo, true);
  if (Number.isInteger(s.slide) && s.slide !== ESTADO.apres.indice) irPara(s.slide, true);
}
// Uma escrita por vez. Toques rápidos viram "o último desejado"; conflito
// (outra tela gravou) relê a revisão e grava de novo o que se quis.
function escreverSala(slide, modo) {
  const sala = ESTADO.sala; if (!sala.codigo) return;
  sala.desejado = { slide, modo };
  if (sala.emVoo) return;
  const codigo = sala.codigo;
  sala.emVoo = true;
  (async () => {
    let conflitos = 0;
    try {
      while (sala.desejado && ESTADO.sala === sala) {
        const alvo = sala.desejado; sala.desejado = null;
        const reg = { id: codigo, slide: alvo.slide, modo: alvo.modo, atualizadoPor: ESTADO.sessao ? ESTADO.sessao.usuario : '', atualizadoEm: new Date().toISOString() };
        try {
          const r = await STORE.gravarSala(reg, sala.rev);
          sala.rev = r.revision; sala.ultimo = { slide: alvo.slide, modo: alvo.modo }; sala.escritoEm = Date.now();
          marcarConexao('ok');
        } catch (e) {
          if (e.tipo === 'conflito' && conflitos < 3) {
            conflitos++;
            const g = await STORE.lerSala(codigo);
            sala.rev = g.revision;
            if (!sala.desejado) sala.desejado = alvo;
          } else throw e;
        }
      }
    } catch (e) {
      marcarConexao('erro', e.message);
      if (e.tipo !== 'sessao') toast(mensagemDeErro(e, 'Não consegui avisar a sala'), 'erro');
    } finally { sala.emVoo = false; }
  })();
}

// ---------- controle (o celular do facilitador)
function renderControle(app) {
  const codigo = normalizarCodigo(ESTADO.rota.arg);
  if (codigo.length !== 6) { location.hash = '#/apresentacao'; return; }
  const slides = obterSlides();
  prepararSala(codigo);
  app.innerHTML = '<main class="controle" id="controle">' +
    '<header class="controle-topo"><a class="botao fantasma-claro" href="#/apresentacao">Sair do controle</a><span>Sala <b>' + esc(codigo) + '</b> <span data-conexao class="conexao">conectando…</span></span></header>' +
    (slides.length ? '' : avisoHTML('Os slides do método não carregaram neste celular (metodo.js). Os botões ainda passam os slides da tela.', 'amarelo')) +
    '<section class="controle-atual" id="controle-atual"></section>' +
    '<div class="controle-botoes"><button type="button" class="botao fantasma controle-ant" data-c="ant">Anterior</button><button type="button" class="botao controle-prox" data-c="prox">Próximo</button></div>' +
    (slides.length ? '<label class="campo">Ir para<select data-c-ir>' + opcoesSlides(slides, 0) + '</select></label>' : '') +
    '<div class="chips" role="group" aria-label="Modo">' + [['apresentar', 'Apresentar'], ['aplicar', 'Aplicar']].map(([v, t]) => '<button type="button" class="chip" data-c-modo="' + v + '" aria-pressed="false">' + t + '</button>').join('') + '</div>' +
    '<details class="controle-notas"><summary>Notas do slide</summary><div id="controle-notas"></div></details>' +
    '</main>';
  pintarControle();
  const raiz = $('#controle');
  raiz.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    const atual = atualDoControle();
    const total = slides.length || Infinity;
    if (b.getAttribute('data-c') === 'prox') moverControle(Math.min(total - 1, atual.slide + 1), atual.modo);
    else if (b.getAttribute('data-c') === 'ant') moverControle(Math.max(0, atual.slide - 1), atual.modo);
    else if (b.hasAttribute('data-c-modo')) moverControle(atual.slide, b.getAttribute('data-c-modo'));
  });
  const ir = $('[data-c-ir]');
  if (ir) ir.addEventListener('change', () => { const a = atualDoControle(); moverControle(Number(ir.value), a.modo); });
  iniciarPoll(codigo, r => {
    // Sala que não existe: os botões travam, para o celular não criar uma
    // sala nova que nenhuma tela acompanha.
    if (!r.registro) {
      ESTADO.sala.sumiu = true;
      marcarConexao('sumiu', 'Esta sala não existe mais.');
      const a = $('#controle-atual'); if (a) a.innerHTML = avisoHTML('Esta sala não existe. Confira o código na tela que projeta.', 'vermelho');
      $$('#controle [data-c], #controle [data-c-modo], #controle [data-c-ir]').forEach(b => { b.disabled = true; });
      return;
    }
    if (ESTADO.sala.sumiu) { ESTADO.sala.sumiu = false; $$('#controle [data-c-modo], #controle [data-c-ir]').forEach(b => { b.disabled = false; }); }
    ESTADO.sala.rev = r.revision;
    if (ESTADO.sala.emVoo || ESTADO.sala.desejado) return;
    ESTADO.sala.ultimo = { slide: Number.isInteger(r.registro.slide) ? r.registro.slide : 0, modo: r.registro.modo === 'aplicar' ? 'aplicar' : 'apresentar' };
    pintarControle();
  });
}
function atualDoControle() {
  const u = ESTADO.sala.desejado || ESTADO.sala.ultimo || { slide: 0, modo: 'apresentar' };
  return { slide: Number.isInteger(u.slide) ? u.slide : 0, modo: u.modo === 'aplicar' ? 'aplicar' : 'apresentar' };
}
function moverControle(slide, modo) {
  if (!Number.isInteger(slide) || slide < 0 || ESTADO.sala.sumiu) return;
  ESTADO.sala.ultimo = { slide, modo };
  escreverSala(slide, modo);
  pintarControle();
}
function pintarControle() {
  const slides = obterSlides(), a = atualDoControle();
  const alvo = $('#controle-atual'); if (!alvo) return;
  const s = slides[a.slide];
  alvo.innerHTML = '<small>Slide ' + (a.slide + 1) + (slides.length ? ' de ' + slides.length : '') + ' · ' + (a.modo === 'aplicar' ? 'Aplicar' : 'Apresentar') + '</small><b>' + esc(s ? s.titulo : 'Slide ' + (a.slide + 1)) + '</b>';
  const ant = $('[data-c=ant]'), prox = $('[data-c=prox]');
  if (ant) ant.disabled = a.slide <= 0;
  if (prox) prox.disabled = slides.length ? a.slide >= slides.length - 1 : false;
  $$('[data-c-modo]').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-c-modo') === a.modo)));
  const ir = $('[data-c-ir]'); if (ir) marcarOpcao(ir, String(a.slide));
  const notas = $('#controle-notas');
  if (notas) notas.innerHTML = s ? ((s.tese ? '<p><b>Tese.</b> ' + esc(s.tese) + '</p>' : '') + (s.frase ? '<p><b>Frase.</b> ' + esc(s.frase) + '</p>' : '') +
    (s.perguntas.length ? '<p><b>Perguntas.</b></p><ol>' + s.perguntas.map(p => '<li>' + esc(p) + '</li>').join('') + '</ol>' : '') + (s.fonte ? '<p class="fonte">' + esc(s.fonte) + '</p>' : '')) : '';
}

/* ══════════ rotas ══════════ */
function lerRota() {
  const h = String(location.hash || '').replace(/^#\/?/, '');
  const i = h.indexOf('/');
  const nome = i < 0 ? h : h.slice(0, i), resto = i < 0 ? '' : h.slice(i + 1);
  let arg = '';
  try { arg = decodeURIComponent(resto); } catch { arg = ''; }
  ESTADO.rota = { nome: nome || 'inicio', arg };
}
const ROTAS = {
  inicio: renderInicio, metodo: renderMetodo, dinamicas: renderDinamicas, turmas: renderTurmas, diagnostico: renderDiagnostico,
  plano: renderPlano, apostila: renderApostila, apresentacao: renderApresentacao, palco: renderPalco, controle: renderControle,
};
const TITULOS = { inicio: 'Início', metodo: 'Método', dinamicas: 'Dinâmicas e APN', turmas: 'Turmas e empresas', diagnostico: 'Diagnóstico', plano: 'Plano de 90 dias', apostila: 'Apostila', apresentacao: 'Apresentação', controle: 'Controle da sala' };
function renderApp(opcoes) {
  const app = $('#app'); if (!app) return;
  const antes = ESTADO.rota.nome + '/' + ESTADO.rota.arg;
  lerRota();
  if (!ESTADO.sessao) { pararPoll(); renderLogin(app); return; }
  const agora = ESTADO.rota.nome + '/' + ESTADO.rota.arg;
  if (ESTADO.poll && ESTADO.poll.chave !== ESTADO.rota.nome + '/' + normalizarCodigo(ESTADO.rota.arg)) pararPoll();
  if (ESTADO.rota.nome !== 'palco') { document.body.classList.remove('modo-palco'); if (antes.indexOf('palco/') === 0) sairTelaCheia(); }
  // Janela de aviso é da tela que a abriu: trocar de área fecha. Formulário
  // fica (pode ter digitação); ele só fecha pelos próprios botões.
  if (antes.split('/')[0] !== ESTADO.rota.nome) $$('#overlays dialog:not([data-formulario])').forEach(d => d.remove());
  // hasOwnProperty: "#/__proto__" ou "#/constructor" acham propriedade de todo objeto e quebravam a tela.
  if (!Object.prototype.hasOwnProperty.call(ROTAS, ESTADO.rota.nome)) ESTADO.rota = { nome: 'inicio', arg: '' };
  document.title = (TITULOS[ESTADO.rota.nome] ? TITULOS[ESTADO.rota.nome] + ' · ' : '') + 'Método V.O.F.';
  ESTADO.redesenhoPendente = false;
  const rolagem = typeof window.scrollY === 'number' ? window.scrollY : 0;
  ROTAS[ESTADO.rota.nome](app);
  if (typeof window.scrollTo === 'function') window.scrollTo(0, (opcoes && opcoes.manterRolagem && antes === agora) ? rolagem : 0);
}

(function boot() {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) { try { navigator.serviceWorker.register('./sw.js').catch(() => {}); } catch {} }
  ESTADO.sessao = sessaoInicial();
  // Recarregar a página no meio da aula (F5, projetor que reinicia) volta ao
  // slide em que estava, não ao primeiro.
  ESTADO.apres.indice = indiceLembrado();
  window.addEventListener('hashchange', () => renderApp());
  document.addEventListener('keydown', teclaGlobal);
  document.addEventListener('fullscreenchange', () => { const b = $('[data-p=tela]'); if (b) b.textContent = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia'; });
  renderApp();
  if (ESTADO.sessao) confirmarSessao();
  setInterval(() => { if (ESTADO.sessao && document.visibilityState !== 'hidden' && !['palco', 'controle'].includes(ESTADO.rota.nome)) STORE.atualizar(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (ESTADO.sessao && document.visibilityState === 'visible') STORE.atualizar(); });
})();
