// ============================================================================
// store.js: a única porta do app para o servidor (apiFn) e a memória local.
//
// apiFn é o PONTO ÚNICO DE SAÍDA. Toda chamada leva o crachá no cabeçalho
// Authorization e todo erro sai daqui já classificado, para a tela não
// adivinhar:
//   401  sessao     o crachá não vale mais: a tela volta ao login ("Entre de novo").
//   403  permissao  entrou, mas o papel não permite a ação ("Seu acesso não permite").
//   409  conflito   outra pessoa gravou antes: nada é sobrescrito calado.
//                   Item arquivado também volta 409; aí o erro leva
//                   arquivado: true e só o admin restaura (restaurar()).
//   rede            sem internet ou servidor mudo. NUNCA vira 401: cair a
//                   conexão não é perder o acesso, e tratar como 401 jogaria
//                   a pessoa para fora no meio da turma.
//
// Memória local: turmas, empresas, diagnósticos e planos ficam guardados por
// conta (chave vof_cache_v1_<usuario>) para a tela abrir na hora e ler sem
// sinal. O conteúdo do APN 109 NÃO vai para o localStorage: é material pago de
// terceiros e é grande; os sistemas da casa dividem os mesmos 5 MB do endereço.
// Ele fica só na memória da aba. Salas também não: vivem de consulta.
//
// Gravação é direta no servidor, com revisão otimista (expectedRevision). Se a
// rede falhar, nada é gravado e o rascunho da tela continua guardado (quem
// guarda o rascunho é o app, em rascunho()).
// ============================================================================
const STORE = (() => {
  const K_USER = 'vof_user';
  const COLECOES = ['turmas', 'empresas', 'diagnosticos', 'planos', 'salas', 'conteudo'];
  const GUARDADAS = ['turmas', 'empresas', 'diagnosticos', 'planos'];
  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const novoId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16); crypto.getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  };
  const chaveCache = usuario => 'vof_cache_v1_' + encodeURIComponent(norm(usuario));
  const chaveRascunho = (usuario, nome) => 'vof_rascunho_v1_' + encodeURIComponent(norm(usuario)) + '_' + encodeURIComponent(nome);

  const ouvintes = {};
  const avisar = (ev, dado) => (ouvintes[ev] || []).slice().forEach(f => { try { f(dado); } catch (e) { if (typeof console !== 'undefined') console.error(e); } });

  let epoch = 0;            // muda a cada troca de conta: resposta atrasada da conta anterior é descartada
  let mem = null;           // espelho em memória do cache da conta atual
  let atualizando = null;   // promessa da atualização em curso (uma de cada vez)
  let conteudo = null;      // { docs, em } do APN, só em memória
  let carregandoConteudo = null;
  let avisouQuota = false;

  // JSON nunca traz função: uma chave "toString" ou "valueOf" num objeto só
  // pode ser dado, e dado com esse nome quebra a conversão para texto
  // (String({"toString": 1}) lança TypeError). A porta aceita qualquer tipo em
  // turma.nome, marco.acao, diagnóstico.avaliador e afins; um crachá de
  // facilitador que gravasse isso direto na porta derrubava o desenho de
  // Início, Turmas, Diagnóstico e Plano para todo mundo, admin incluído, até o
  // registro sair do banco. Tira as duas chaves de qualquer nível, sem
  // recursão (dado muito fundo não estoura a pilha), antes de o dado chegar à
  // memória ou à tela: resposta do servidor, cópia local e rascunhos.
  function desarmar(dado) {
    const pilha = [dado];
    while (pilha.length) {
      const v = pilha.pop();
      if (!v || typeof v !== 'object') continue;
      for (const k of Object.keys(v)) {
        if (k === 'toString' || k === 'valueOf') delete v[k];
        else if (v[k] && typeof v[k] === 'object') pilha.push(v[k]);
      }
    }
    return dado;
  }
  function lerLS(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function lerJSON(k) { try { return desarmar(JSON.parse(lerLS(k) || 'null')); } catch { return null; } }
  function gravarLS(k, v) {
    try { localStorage.setItem(k, v); return true; }
    catch { if (!avisouQuota) { avisouQuota = true; avisar('quota', null); } return false; }
  }
  function apagarLS(k) { try { localStorage.removeItem(k); } catch {} }

  function getUser() {
    const u = lerJSON(K_USER);
    return u && typeof u === 'object' && u.usuario ? u : null;
  }
  function setUser(u) {
    epoch++; mem = null; conteudo = null; carregandoConteudo = null; atualizando = null;
    if (!u) { apagarLS(K_USER); return true; }
    return gravarLS(K_USER, JSON.stringify({ usuario: String(u.usuario), nome: String(u.nome || u.usuario), papel: String(u.papel || '') }));
  }

  // arquivados: códigos que o servidor marcou como apagados, por coleção. A
  // lista do servidor manda o arquivado (sem o conteúdo, para o facilitador)
  // justamente para a tela saber que aquele código existe e está fechado.
  function vazio() {
    const dados = {}, arquivados = {}; GUARDADAS.forEach(c => { dados[c] = []; arquivados[c] = []; });
    return { usuario: '', dados, arquivados, rev: {}, buscadoEm: {}, em: null };
  }
  function estado() {
    const u = getUser();
    if (!u) return vazio();
    if (mem && mem.usuario === u.usuario) return mem;
    const salvo = lerJSON(chaveCache(u.usuario));
    const e = vazio(); e.usuario = u.usuario;
    if (salvo && typeof salvo === 'object') {
      GUARDADAS.forEach(c => { if (Array.isArray(salvo.dados && salvo.dados[c])) e.dados[c] = salvo.dados[c]; });
      GUARDADAS.forEach(c => { if (Array.isArray(salvo.arquivados && salvo.arquivados[c])) e.arquivados[c] = salvo.arquivados[c].filter(x => typeof x === 'string'); });
      if (salvo.rev && typeof salvo.rev === 'object') e.rev = salvo.rev;
      if (salvo.buscadoEm && typeof salvo.buscadoEm === 'object') e.buscadoEm = salvo.buscadoEm;
      if (typeof salvo.em === 'string') e.em = salvo.em;
    }
    mem = e;
    return mem;
  }
  function persistir() {
    if (!mem || !mem.usuario) return false;
    return gravarLS(chaveCache(mem.usuario), JSON.stringify({ dados: mem.dados, arquivados: mem.arquivados, rev: mem.rev, buscadoEm: mem.buscadoEm, em: mem.em }));
  }

  function erro(tipo, mensagem, status, extra) {
    return Object.assign(new Error(mensagem), { tipo, status: status || 0 }, extra || {});
  }

  // ---------------------------------------------------------------- apiFn
  async function apiFn(action, corpo, opcoes) {
    const sessaoDaChamada = epoch;
    const cracha = typeof AUTH !== 'undefined' ? AUTH.cracha() : '';
    if (!cracha) {
      const e = erro('sessao', 'Sua sessão terminou. Entre de novo.', 401);
      avisar('sessao', e.message);
      throw e;
    }
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const limite = (opcoes && opcoes.timeoutMs) || 15000;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), limite) : null;
    let r;
    try {
      r = await fetch(window.API_BASE + '/' + window.API_FN.sync, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cracha },
        body: JSON.stringify(Object.assign({ action }, corpo || {})),
        signal: ctrl ? ctrl.signal : undefined,
      });
    } catch (e) {
      const demorou = e && e.name === 'AbortError';
      throw erro('rede', demorou
        ? 'O servidor demorou a responder. Nada foi perdido: tente de novo.'
        : 'Sem conexão com o servidor. Nada foi perdido: tente de novo quando a internet voltar.', 0, { rede: true });
    } finally { if (timer) clearTimeout(timer); }

    let dados = null;
    try { dados = desarmar(await r.json()); } catch { dados = null; }
    const doServidor = dados && typeof dados === 'object' ? (dados.erro || dados.error || '') : '';

    if (r.status === 401) {
      // "Entre no sistema." é o recado genérico; qualquer outro (acesso
      // encerrado pela gestão, por exemplo) vai junto, porque muda o que fazer.
      const motivo = doServidor && norm(doServidor) !== norm('Entre no sistema.') ? ' Motivo: ' + doServidor : '';
      const e = erro('sessao', 'Sua sessão terminou. Entre de novo.' + motivo, 401, { causa: doServidor });
      // Só derruba a sessão se a resposta é da conta que ainda está aberta.
      if (sessaoDaChamada === epoch) avisar('sessao', e.message);
      throw e;
    }
    if (r.status === 403) {
      throw erro('permissao', 'Seu acesso não permite esta ação.' + (doServidor ? ' ' + doServidor : ''), 403);
    }
    if (!r.ok || !dados || typeof dados !== 'object' || dados.ok === false || doServidor) {
      if (r.status === 409) throw erro('conflito', doServidor || 'Outra pessoa alterou este item antes de você.', 409);
      throw erro('servidor', doServidor || ('O servidor respondeu ' + r.status + ' sem explicar.'), r.status);
    }
    return dados;
  }

  // Lista uma coleção inteira, página por página. Lista que não é lista é
  // erro: 200 com corpo torto não pode virar "não há nada" na tela.
  async function listarTudo(colecao) {
    let desde, tudo = [];
    const vistos = new Set();
    for (let pagina = 0; pagina < 200; pagina++) {
      const corpo = { colecao, limite: 500, protocolo: 2 };
      if (desde !== undefined && desde !== null) corpo.desde = desde;
      const r = await apiFn('list', corpo);
      if (!Array.isArray(r.itens)) throw erro('servidor', 'A lista de ' + colecao + ' veio incompleta do servidor.', 200);
      tudo = tudo.concat(r.itens);
      if (!r.proximo) return tudo;
      const marca = JSON.stringify(r.proximo);
      if (vistos.has(marca)) throw erro('servidor', 'A lista de ' + colecao + ' não terminou de chegar. Tente de novo.', 200);
      vistos.add(marca); desde = r.proximo;
    }
    throw erro('servidor', 'A lista de ' + colecao + ' é maior do que o esperado.', 200);
  }
  const vivos = itens => itens
    .filter(x => x && !x.apagado && x.registro && typeof x.registro === 'object' && x.registro.id)
    .map(x => Object.assign({}, x.registro, { _rev: Number.isSafeInteger(x.revision) ? x.revision : undefined }));
  const arquivadosDe = itens => itens
    .filter(x => x && x.apagado)
    .map(x => (typeof x.id === 'string' && x.id) || (x.registro && typeof x.registro.id === 'string' && x.registro.id) || '')
    .filter(Boolean);

  // Traz do servidor as coleções que mudaram. Uma de cada vez: a segunda
  // chamada durante a primeira recebe a mesma promessa.
  function atualizar() {
    if (atualizando) return atualizando;
    if (!getUser()) return Promise.resolve(false);
    const inicio = epoch;
    avisar('atualizando', null);
    atualizando = (async () => {
      try {
        let deles = null;
        try {
          const r = await apiFn('rev');
          const pc = r && r.rev && r.rev.porColecao;
          if (pc && typeof pc === 'object') deles = pc;
        } catch (e) { if (e.tipo === 'sessao' || e.tipo === 'rede') throw e; deles = null; }
        if (inicio !== epoch) return false;
        const mudou = [];
        for (const c of GUARDADAS) {
          const s = estado();
          // Pula a coleção só quando a revisão bate E a última lista inteira é
          // recente: se um dia o contador do servidor falhar, em 15 minutos a
          // lista completa corrige sozinha.
          const recente = Date.now() - Date.parse(s.buscadoEm[c] || 0) < 15 * 60 * 1000;
          if (deles && recente && Object.prototype.hasOwnProperty.call(s.rev, c) && s.rev[c] === (deles[c] || 0)) continue;
          const itens = await listarTudo(c);
          if (inicio !== epoch) return false;
          const agora = estado();
          agora.dados[c] = vivos(itens);
          agora.arquivados[c] = arquivadosDe(itens);
          agora.buscadoEm[c] = new Date().toISOString();
          if (deles) agora.rev[c] = deles[c] || 0; else delete agora.rev[c];
          mudou.push(c);
        }
        const s = estado(); s.em = new Date().toISOString(); persistir();
        avisar('dados', { mudou });
        return true;
      } catch (e) {
        if (inicio === epoch) avisar('erroAtualizar', e.message || 'Falha ao atualizar.');
        return false;
      } finally {
        if (inicio === epoch) atualizando = null;
      }
    })();
    return atualizando;
  }

  function col(nome) {
    if (!GUARDADAS.includes(nome)) return [];
    return estado().dados[nome].slice();
  }
  const um = (nome, id) => col(nome).find(r => r.id === id) || null;
  const arquivado = (nome, id) => GUARDADAS.includes(nome) && (estado().arquivados[nome] || []).includes(id);
  // Tira o código da lista viva e o marca como arquivado. Só mexe se a
  // resposta é da conta que ainda está aberta.
  function marcarArquivado(colecao, id, inicio) {
    if (inicio !== epoch || !GUARDADAS.includes(colecao)) return;
    const s = estado();
    s.arquivados[colecao] = (s.arquivados[colecao] || []).filter(x => x !== id).concat([id]);
    s.dados[colecao] = s.dados[colecao].filter(x => x.id !== id);
    persistir();
    avisar('dados', { mudou: [colecao] });
  }
  const limpar = reg => {
    const out = {};
    Object.keys(reg || {}).forEach(k => { if (k.charAt(0) !== '_') out[k] = reg[k]; });
    return out;
  };

  // Grava um registro. Registro novo com código escolhido pelo app (o plano
  // da turma é sempre "plano-<turmaId>") pergunta ao servidor antes de gravar.
  // O que isso resolve: se já existe um registro VIVO com esse código (feito em
  // outro aparelho e ainda fora da cópia local), a gravação para com conflito
  // em vez de sobrescrever o que está lá.
  // O que isso NÃO resolve: código arquivado. A vof_gravar recusa todo upsert
  // em item arquivado (409 "Item arquivado"), com qualquer revisão, inclusive
  // a certa que o get devolve. Por isso o get que volta sem registro e com
  // revisão maior que zero (é assim que o servidor responde pelo arquivado)
  // vira erro com arquivado: true, sem mandar a gravação que seria recusada.
  // Só o admin traz o item de volta (ação restore, em restaurar()).
  async function gravar(colecao, registro, opcoes) {
    if (!COLECOES.includes(colecao)) throw erro('app', 'Coleção desconhecida: ' + colecao, 0);
    if (!registro || typeof registro !== 'object' || !registro.id) throw erro('app', 'Registro sem código.', 0);
    const inicio = epoch;
    const limpo = limpar(registro);
    let esperada = Number.isSafeInteger(registro._rev) ? registro._rev : undefined;
    if (esperada === undefined && GUARDADAS.includes(colecao)) {
      const noCache = um(colecao, limpo.id);
      if (noCache && Number.isSafeInteger(noCache._rev)) esperada = noCache._rev;
    }
    if (esperada === undefined && opcoes && opcoes.idFixo) {
      const g = await apiFn('get', { colecao, id: limpo.id });
      if (g && g.registro) throw erro('conflito', 'Já existe um registro com este código no servidor. Atualize a tela para ver o que está lá.', 409);
      if (g && Number.isSafeInteger(g.revision) && g.revision > 0) {
        marcarArquivado(colecao, limpo.id, inicio);
        throw erro('conflito', 'Este item foi arquivado. Só o admin pode restaurar.', 409, { arquivado: true });
      }
      esperada = 0;
    }
    if (esperada === undefined) esperada = 0;
    let r;
    try {
      r = await apiFn('upsert', { colecao, registro: limpo, expectedRevision: esperada, mutationId: novoId() });
    } catch (e) {
      // O servidor diz "Este item foi arquivado" (falhaDeGravacao em regras.mjs).
      if (e && e.status === 409 && /arquivad/i.test(e.message || '')) {
        marcarArquivado(colecao, limpo.id, inicio);
        e.arquivado = true;
      }
      throw e;
    }
    const revisao = Number.isSafeInteger(r.revision) ? r.revision : esperada + 1;
    const salvo = Object.assign({}, (r.registro && typeof r.registro === 'object') ? r.registro : limpo, { _rev: revisao });
    if (inicio === epoch && GUARDADAS.includes(colecao)) {
      const s = estado();
      s.dados[colecao] = s.dados[colecao].filter(x => x.id !== salvo.id).concat([salvo]);
      persistir();
      avisar('dados', { mudou: [colecao] });
    }
    return Object.assign({}, r, { registro: salvo, revision: revisao });
  }

  // Apagar é do admin (o servidor recusa os outros papéis). O servidor marca
  // como apagado; o admin pode restaurar.
  async function apagar(colecao, id) {
    const inicio = epoch;
    const atual = um(colecao, id);
    const corpo = { colecao, id, mutationId: novoId() };
    if (atual && Number.isSafeInteger(atual._rev)) corpo.expectedRevision = atual._rev;
    const r = await apiFn('delete', corpo);
    marcarArquivado(colecao, id, inicio);
    return r;
  }

  // Restaurar também é só do admin: o servidor recusa o facilitador (403) e
  // confirma no banco que o papel de admin ainda vale. O item volta com o
  // conteúdo que tinha quando foi arquivado.
  async function restaurar(colecao, id) {
    const inicio = epoch;
    const r = await apiFn('restore', { colecao, id, mutationId: novoId() });
    if (inicio === epoch && GUARDADAS.includes(colecao)) {
      const s = estado();
      s.arquivados[colecao] = (s.arquivados[colecao] || []).filter(x => x !== id);
      if (r && r.registro && typeof r.registro === 'object' && r.registro.id === id) {
        const volta = Object.assign({}, r.registro, { _rev: Number.isSafeInteger(r.revision) ? r.revision : undefined });
        s.dados[colecao] = s.dados[colecao].filter(x => x.id !== id).concat([volta]);
      }
      persistir();
      avisar('dados', { mudou: [colecao] });
    }
    return r;
  }

  // ------------------------------------------------------------ conteúdo APN
  function carregarConteudo(forcar) {
    if (conteudo && !forcar) return Promise.resolve(conteudo);
    if (carregandoConteudo) return carregandoConteudo;
    const inicio = epoch;
    carregandoConteudo = (async () => {
      try {
        const itens = await listarTudo('conteudo');
        const docs = {};
        vivos(itens).forEach(reg => { docs[reg.id] = reg; });
        const pacote = { docs, em: new Date().toISOString() };
        if (inicio === epoch) conteudo = pacote;
        return pacote;
      } finally {
        if (inicio === epoch) carregandoConteudo = null;
      }
    })();
    return carregandoConteudo;
  }

  // ------------------------------------------------------------------ salas
  async function lerSala(codigo) {
    const r = await apiFn('get', { colecao: 'salas', id: codigo }, { timeoutMs: 8000 });
    return { registro: r && r.registro && typeof r.registro === 'object' ? r.registro : null, revision: r && Number.isSafeInteger(r.revision) ? r.revision : 0 };
  }
  async function gravarSala(registro, revisao) {
    const r = await apiFn('upsert', { colecao: 'salas', registro: limpar(registro), expectedRevision: Number.isSafeInteger(revisao) ? revisao : 0, mutationId: novoId() }, { timeoutMs: 8000 });
    return { registro: r.registro || registro, revision: Number.isSafeInteger(r.revision) ? r.revision : (revisao || 0) + 1 };
  }

  // -------------------------------------------------------------- arquivos
  async function urlArquivo(nome) {
    const r = await apiFn('urlArquivo', { nome });
    if (!r || typeof r.url !== 'string' || !/^https:\/\//.test(r.url)) throw erro('servidor', 'O servidor não devolveu um link válido.', 200);
    return r;
  }

  // ------------------------------------------------------------- rascunhos
  // Por conta e por tela. É conveniência deste aparelho: o que vale é o que
  // foi gravado no servidor.
  function rascunho(nome, valor) {
    const u = getUser(); if (!u) return null;
    const k = chaveRascunho(u.usuario, nome);
    if (valor === undefined) return lerJSON(k);
    if (valor === null) { apagarLS(k); return null; }
    return gravarLS(k, JSON.stringify(valor));
  }

  // Sair de propósito limpa o que é desta conta neste aparelho: a cópia dos
  // dados (diagnósticos de clientes, planos) e os rascunhos. Em computador
  // emprestado, o próximo a usar o navegador não acha nada. Queda de sessão
  // (401) NÃO limpa: a mesma pessoa entra de novo e continua de onde parou.
  function chavesDaConta() {
    const u = getUser(); if (!u) return [];
    const prefixoR = 'vof_rascunho_v1_' + encodeURIComponent(norm(u.usuario)) + '_';
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k === chaveCache(u.usuario) || (k && k.indexOf(prefixoR) === 0)) out.push(k); } } catch {}
    return out;
  }
  function contarRascunhos() { return chavesDaConta().filter(k => k.indexOf('vof_rascunho_v1_') === 0).length; }
  function limparConta() { chavesDaConta().forEach(apagarLS); mem = null; }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => { if (getUser()) atualizar(); });
  }

  return {
    COLECOES, apiFn, atualizar, col, um, arquivado, gravar, apagar, restaurar, carregarConteudo,
    conteudoEmMemoria: () => conteudo,
    lerSala, gravarSala, urlArquivo, rascunho, contarRascunhos, limparConta, getUser, setUser,
    atualizadoEm: () => estado().em,
    on: (ev, fn) => { (ouvintes[ev] = ouvintes[ev] || []).push(fn); },
  };
})();
