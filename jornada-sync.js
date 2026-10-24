/* Progresso pessoal: fila durável por usuário, revisões por missão e conflito
 * explícito. A única saída de rede continua sendo STORE/apiFn. O legado sem
 * dono nunca é mostrado nem enviado antes da escolha de importar nesta conta. */
(function (raiz) {
  'use strict';
  const IDS = Object.freeze(['arquitetura', 'conscientizar', 'ciclo', 'times', 'diagnostico', 'venda', 'operacao', 'financas', 'pessoas', 'gestores', '90dias', 'dono', 'venda2', 'operacao2', 'financas2', 'pessoas2', 'gestores2', 'dinamicas']);
  const LEGADO = ['vof_jornada_v1', 'cl_vof_jornada_v1'];
  const DONO_LEGADO = 'vof_jornada_legado_importado_v1';
  const chave = usuario => 'vof_jornada_pessoal_v1_' + encodeURIComponent(usuario);
  const prefixo = usuario => chave(usuario) + '::';
  const origem = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  const copiar = valor => JSON.parse(JSON.stringify(valor));
  const texto = (valor, max = 2000) => typeof valor === 'string' ? valor.slice(0, max) : '';
  const objeto = valor => valor && typeof valor === 'object' && !Array.isArray(valor);
  const revisao = valor => Number.isSafeInteger(valor) && valor >= 0 ? valor : 0;
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let atual = null, geracao = 0;
  function loja() { return typeof STORE !== 'undefined' ? STORE : raiz.STORE; }
  function usuarioAtual() {
    const u = loja()?.getUser(), usuario = typeof u?.usuario === 'string' ? u.usuario : '';
    // O token pode mudar em outra aba antes da atualização de vof_user. Nesse
    // intervalo a jornada anterior não pode aparecer nem aceitar novos dados.
    if (typeof AUTH !== 'undefined' && typeof AUTH.dono === 'function' && AUTH.dono()?.usuario !== usuario) return '';
    return usuario;
  }
  function crachaAtual() { return typeof AUTH !== 'undefined' && typeof AUTH.cracha === 'function' ? AUTH.cracha() : ''; }
  function ler(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }
  function escrever(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
  function idNovo() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16); crypto.getRandomValues(b);
    return Array.from(b, v => v.toString(16).padStart(2, '0')).join('');
  }
  function registro(r) {
    if (!objeto(r)) return null;
    const p = objeto(r.pratica) ? r.pratica : {};
    const normalizado = { opcao: texto(r.opcao, 100), texto: texto(r.texto), concluida: r.concluida === true, data: texto(r.data, 40) };
    if (Number.isSafeInteger(r.desafioVersao) && r.desafioVersao >= 1 && r.desafioVersao <= 10000) normalizado.desafioVersao = r.desafioVersao;
    if (['planejada', 'em_pratica', 'revisada'].includes(p.situacao)) normalizado.pratica = {
      prazo: texto(p.prazo, 40), situacao: p.situacao, resultado: texto(p.resultado), revisaoEm: texto(p.revisaoEm, 40) };
    return normalizado;
  }
  function vazio(usuario) { return { usuario, entradas: {}, fila: {}, conflitos: {}, ultimaSync: '' }; }
  function chaves(usuario) {
    const lista = [], p = prefixo(usuario);
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(p)) lista.push(k); } } catch {}
    return lista;
  }
  function carregar(usuario) {
    const bruto = ler(chave(usuario)), r = vazio(usuario), nos = [], recibos = new Map(), bases = new Map();
    // Compatibilidade com a primeira prévia agregada. A forma nova usa registros
    // independentes e rascunhos imutáveis; nenhum setItem substitui outra missão.
    if (objeto(bruto) && bruto.usuario === usuario) {
      r.ultimaSync = texto(bruto.ultimaSync, 40);
      if (!bruto.fragmentado) for (const id of IDS) {
        const e = bruto.entradas?.[id], f = bruto.fila?.[id], c = bruto.conflitos?.[id];
        if (registro(e?.registro)) r.entradas[id] = { registro: registro(e.registro), revision: revisao(e.revision), atualizado_em: texto(e.atualizado_em, 40) };
        if (registro(f?.registro)) nos.push({ ...f, missao: id, origem: '', pais: [], conflito: c });
      }
    }
    for (const k of chaves(usuario)) {
      const v = ler(k); if (!objeto(v) || v.usuario !== usuario || !IDS.includes(v.missao)) continue;
      if (v.tipo === 'entrada' && registro(v.registro) && revisao(v.revision) >= (r.entradas[v.missao]?.revision || 0)) r.entradas[v.missao] = { registro: registro(v.registro), revision: revisao(v.revision), atualizado_em: texto(v.atualizado_em, 40) };
      if (v.tipo === 'rascunho' && registro(v.registro) && typeof v.mutationId === 'string') nos.push(v);
      if (v.tipo === 'recibo' && revisao(v.revision) >= (recibos.get(v.mutationId)?.revision || 0)) recibos.set(v.mutationId, v);
      if (v.tipo === 'base') bases.set(v.mutationId, Math.max(bases.get(v.mutationId) || 0, revisao(v.revision)));
    }
    const substituidos = new Set(nos.flatMap(n => Array.isArray(n.pais) ? n.pais : []));
    for (const id of IDS) {
      const candidatos = [...new Map(nos.filter(n => n.missao === id && !recibos.has(n.mutationId) && !substituidos.has(n.mutationId)).map(n => [n.mutationId, n])).values()]
        .sort((a, b) => Number(b.prioridade === 1) - Number(a.prioridade === 1) || Number(b.origem === origem) - Number(a.origem === origem) || (b.em || '').localeCompare(a.em || '') || b.mutationId.localeCompare(a.mutationId));
      const n = candidatos[0]; if (!n) continue;
      const pais = Array.isArray(n.pais) ? n.pais : [];
      const expectedRevision = Math.max(revisao(n.expectedRevision), bases.get(n.mutationId) || 0, ...pais.map(p => revisao(recibos.get(p)?.revision)));
      r.fila[id] = { registro: registro(n.registro), expectedRevision, mutationId: n.mutationId, pais, origem: n.origem || '' };
      const outro = candidatos.find(x => !igual(x.registro, n.registro));
      const e = r.entradas[id];
      if (outro) r.conflitos[id] = { local: registro(n.registro), servidor: registro(outro.registro), revision: e?.revision || 0, atualizado_em: e?.atualizado_em || '', servidorPendente: true, mutations: [n.mutationId, outro.mutationId] };
      else if (n.conflito && registro(n.conflito.servidor)) r.conflitos[id] = { ...n.conflito, ...(e && e.revision > n.conflito.revision && !n.conflito.servidorPendente ? { servidor: copiar(e.registro), revision: e.revision, atualizado_em: e.atualizado_em } : {}), local: registro(n.registro), mutations: [n.mutationId] };
      else if (e && e.revision !== expectedRevision && !igual(e.registro, n.registro)) r.conflitos[id] = { local: registro(n.registro), servidor: copiar(e.registro), revision: e.revision, atualizado_em: e.atualizado_em, mutations: [n.mutationId] };
    }
    return r;
  }
  function contexto() {
    const usuario = usuarioAtual(), cracha = crachaAtual();
    if (!atual || atual.usuario !== usuario || atual.cracha !== cracha) {
      if (atual?.timer) clearTimeout(atual.timer);
      atual = { usuario, cracha, geracao: ++geracao, dados: usuario ? carregar(usuario) : vazio(''), trabalho: null, timer: null, falha: null, conferido: false, rejeitadas: {} };
    }
    return atual;
  }
  function vigente(c) { return atual === c && usuarioAtual() === c.usuario && crachaAtual() === c.cracha && Boolean(c.usuario); }
  function emitir() {
    if (typeof raiz.dispatchEvent !== 'function' || typeof raiz.CustomEvent !== 'function') return;
    raiz.dispatchEvent(new raiz.CustomEvent('vof-jornada-atualizada', { detail: { sincronizacao: true } }));
    raiz.dispatchEvent(new raiz.CustomEvent('vof-jornada-sync', { detail: status() }));
  }
  function gravar(c, dados, opcoes = {}) {
    if (!vigente(c)) return false;
    const base = c.dados, p = prefixo(c.usuario);
    const guardar = (k, v) => { if (!escrever(p + k, { ...v, usuario: c.usuario })) throw new Error('armazenamento'); };
    try {
      for (const id of IDS) {
        const e = dados.entradas[id];
        if (e) guardar('entrada::' + id + '::' + e.revision, { tipo: 'entrada', missao: id, ...e });
        const antes = base.fila[id], nova = dados.fila[id], conflito = base.conflitos[id];
        const resolvendo = opcoes.resolver === true && conflito && !dados.conflitos[id];
        if (nova && (!antes || nova.mutationId !== antes.mutationId)) {
          const bifurca = dados.conflitos[id] && !conflito;
          const pais = [...new Set([...(nova.pais || []), ...(bifurca ? [] : [...(antes?.pais || []), ...(antes ? [antes.mutationId] : [])]), ...(resolvendo ? conflito.mutations || [] : [])])];
          guardar('rascunho::' + nova.mutationId, { tipo: 'rascunho', missao: id, registro: nova.registro, expectedRevision: nova.expectedRevision, mutationId: nova.mutationId, pais, origem, prioridade: bifurca ? 1 : 0, em: new Date().toISOString(), ...(bifurca && !antes ? { conflito: dados.conflitos[id] } : {}) });
          // O descendente já está durável antes da poda. Escritas simultâneas
          // geram irmãos, com chaves diferentes, e serão exibidas como conflito.
          for (const pai of pais) try { localStorage.removeItem(p + 'rascunho::' + pai); } catch {}
        } else if (nova && !ler(p + 'rascunho::' + nova.mutationId) && !chaves(c.usuario).some(k => k.startsWith(p + 'recibo::' + nova.mutationId + '::'))) {
          guardar('rascunho::' + nova.mutationId, { tipo: 'rascunho', missao: id, ...nova, pais: nova.pais || [], origem: nova.origem || origem, em: new Date().toISOString() });
        }
        if (nova && antes?.mutationId === nova.mutationId && nova.expectedRevision > antes.expectedRevision) guardar('base::' + nova.mutationId + '::' + nova.expectedRevision, { tipo: 'base', missao: id, mutationId: nova.mutationId, revision: nova.expectedRevision });
        if (!nova && antes) {
          for (const mutationId of [antes.mutationId, ...(antes.pais || [])]) {
            const revision = mutationId === antes.mutationId ? e?.revision || 0 : 0;
            guardar('recibo::' + mutationId + '::' + revision, { tipo: 'recibo', missao: id, mutationId, revision });
          }
        }
        if (resolvendo) for (const mutationId of conflito.mutations || []) {
          if (mutationId !== nova?.mutationId) guardar('recibo::' + mutationId + '::0', { tipo: 'recibo', missao: id, mutationId, revision: 0 });
        }
      }
      const unido = carregar(c.usuario);
      unido.ultimaSync = [unido.ultimaSync, dados.ultimaSync].sort().pop() || '';
      // Espelho de compatibilidade/diagnóstico, nunca fonte dos registros novos.
      if (!escrever(chave(c.usuario), { ...unido, fragmentado: true })) throw new Error('armazenamento');
      c.dados = carregar(c.usuario); return true;
    } catch {
      // O que já foi escrito continua durável e poderá ser retomado.
      c.dados = carregar(c.usuario); c.falha = { tipo: 'armazenamento' }; emitir(); return false;
    }
  }
  function respostasDe(dados) {
    const respostas = {};
    for (const id of IDS) {
      const r = dados.conflitos[id]?.local || dados.fila[id]?.registro || dados.entradas[id]?.registro;
      if (r) respostas[id] = copiar(r);
    }
    return respostas;
  }
  function estado() {
    const respostas = respostasDe(contexto().dados);
    return { xp: IDS.filter(id => respostas[id]?.concluida === true).length * 30, respostas };
  }
  function legado() {
    for (const k of LEGADO) {
      const bruto = ler(k), respostas = {};
      for (const id of IDS) { const r = registro(bruto?.respostas?.[id]); if (r) respostas[id] = r; }
      if (Object.keys(respostas).length) return respostas;
    }
    return null;
  }
  function status() {
    const c = contexto(), pendentes = Object.keys(c.dados.fila).length, conflitos = Object.keys(c.dados.conflitos);
    let tipo = 'local', mensagem = 'Entre na sua conta para guardar sua jornada.';
    if (c.usuario) {
      if (c.trabalho) { tipo = 'sincronizando'; mensagem = 'Conferindo e salvando sua jornada…'; }
      else if (conflitos.length) { tipo = 'conflito'; mensagem = 'Há respostas alteradas em outro aparelho. Escolha qual versão manter.'; }
      else if (c.falha?.tipo === 'rede') { tipo = 'offline'; mensagem = 'Sem conexão. Suas respostas neste aparelho serão reenviadas quando a conexão voltar.'; }
      else if (c.falha) { tipo = 'erro'; mensagem = c.falha.tipo === 'armazenamento' ? 'Não foi possível guardar neste aparelho. Libere espaço antes de continuar.' : 'A sincronização não foi concluída. Suas respostas locais foram preservadas.'; }
      else if (pendentes) { tipo = 'pendente'; mensagem = 'Respostas guardadas neste aparelho. Aguardando sincronização.'; }
      else if (c.conferido) { tipo = 'ok'; mensagem = 'Jornada sincronizada com sua conta.'; }
      else { mensagem = 'Progresso deste aparelho. Aguardando conferir sua conta.'; }
    }
    return { estado: tipo, mensagem, pendentes, conflitos, legadoDisponivel: Boolean(c.usuario && !ler(DONO_LEGADO) && legado()), ultimaSync: c.dados.ultimaSync };
  }
  function agendar(c) {
    if (!vigente(c)) return;
    if (c.timer) clearTimeout(c.timer);
    c.timer = setTimeout(() => { c.timer = null; if (vigente(c)) sincronizar(); }, 1200);
    if (c.timer?.unref) c.timer.unref();
  }
  function persistir(valor, opcoes = {}) {
    const c = contexto(); if (!c.usuario || !objeto(valor?.respostas)) return false;
    const d = copiar(c.dados), atuais = respostasDe(d);
    const ids = opcoes.id ? IDS.filter(id => id === opcoes.id) : IDS;
    let alterou = false;
    for (const id of ids) {
      const r = registro(valor.respostas[id]); if (!r) continue; // omissão não exclui histórico
      const anterior = atuais[id];
      if (anterior?.concluida) { r.concluida = true; r.data = anterior.data || r.data; }
      if (igual(r, anterior)) continue;
      if (d.conflitos[id]) d.conflitos[id].local = r;
      d.fila[id] = { registro: r, expectedRevision: d.fila[id]?.expectedRevision ?? d.entradas[id]?.revision ?? 0, mutationId: idNovo() };
      alterou = true;
    }
    if (!alterou) return true;
    if (!gravar(c, d)) return false;
    c.falha = null; emitir(); agendar(c); return true;
  }
  function validarResposta(c, r) {
    if (!objeto(r) || r.usuario !== c.usuario) throw Object.assign(new Error('Resposta de outra conta ou resposta incompleta.'), { tipo: 'servidor' });
  }
  function conciliar(c, resposta) {
    validarResposta(c, resposta);
    if (!objeto(resposta.respostas)) throw Object.assign(new Error('Jornada incompleta.'), { tipo: 'servidor' });
    const d = copiar(c.dados);
    for (const id of IDS) {
      const remoto = resposta.respostas[id];
      if (!remoto) continue; // servidor não apaga histórico local silenciosamente
      if (!registro(remoto.registro) || !Number.isSafeInteger(remoto.revision) || remoto.revision < 1) throw Object.assign(new Error('Revisão inválida.'), { tipo: 'servidor' });
      if (remoto.revision < (d.entradas[id]?.revision || 0)) continue; // outra aba já recebeu uma revisão mais nova
      const e = { registro: registro(remoto.registro), revision: remoto.revision, atualizado_em: texto(remoto.atualizado_em, 40) }, f = d.fila[id];
      d.entradas[id] = e;
      if (!f) continue;
      if (igual(f.registro, e.registro)) { delete d.fila[id]; delete d.conflitos[id]; }
      else if (e.revision !== f.expectedRevision) d.conflitos[id] = { local: copiar(f.registro), servidor: copiar(e.registro), revision: e.revision, atualizado_em: e.atualizado_em };
    }
    if (!gravar(c, d)) throw Object.assign(new Error('Falha no armazenamento local.'), { tipo: 'armazenamento' });
  }
  async function executar(c) {
    let falhaParcial = null;
    try {
      const remoto = await loja().jornadaGet(c.cracha); if (!vigente(c)) return false;
      conciliar(c, remoto); c.falha = null;
      // Cada missão tem sua revisão. Um conflito não bloqueia as demais.
      for (const id of IDS) {
        if (!vigente(c)) return false;
        const atualFila = c.dados.fila[id]; if (!atualFila || c.dados.conflitos[id]) continue;
        if (c.rejeitadas[id] === atualFila.mutationId) { falhaParcial = { tipo: 'servidor' }; continue; }
        const envio = copiar(atualFila);
        try {
          const salvo = await loja().jornadaSalvar({ missao: id, registro: envio.registro, expectedRevision: envio.expectedRevision, mutationId: envio.mutationId }, c.cracha);
          if (!vigente(c)) return false;
          validarResposta(c, salvo);
          if (salvo.missao !== id || !registro(salvo.registro) || !Number.isSafeInteger(salvo.revision) || salvo.revision < 1) throw Object.assign(new Error('Confirmação incompleta.'), { tipo: 'servidor' });
          const d = copiar(c.dados), r = registro(salvo.registro);
          if (salvo.revision >= (d.entradas[id]?.revision || 0)) d.entradas[id] = { registro: r, revision: salvo.revision, atualizado_em: texto(salvo.atualizado_em, 40) };
          // Digitação durante a requisição continua na fila, baseada na revisão confirmada.
          if (d.fila[id]?.mutationId === envio.mutationId) delete d.fila[id];
          else if (d.fila[id]?.pais?.includes(envio.mutationId)) {
            d.fila[id].expectedRevision = Math.max(d.fila[id].expectedRevision, salvo.revision);
            if (r.concluida) { d.fila[id].registro.concluida = true; d.fila[id].registro.data = r.data; }
          }
          if (!gravar(c, d)) throw Object.assign(new Error('Falha no armazenamento local.'), { tipo: 'armazenamento' });
        } catch (e) {
          if (!vigente(c)) return false;
          // Um rascunho incompleto de missão já concluída pode ser recusado. Ele
          // fica preservado para correção; as outras missões seguem sincronizando.
          if (e?.status === 400) { c.rejeitadas[id] = envio.mutationId; falhaParcial = e; continue; }
          if (e?.tipo !== 'conflito' && e?.status !== 409) throw e;
          const atualizado = await loja().jornadaGet(c.cracha); if (!vigente(c)) return false;
          conciliar(c, atualizado);
        }
      }
      if (!vigente(c)) return false;
      const d = copiar(c.dados); d.ultimaSync = new Date().toISOString();
      if (!gravar(c, d)) return false;
      c.conferido = !falhaParcial; c.falha = falhaParcial ? { tipo: falhaParcial.tipo || 'servidor' } : null;
      // Respostas digitadas durante o envio recebem outra rodada, sem laço agressivo.
      if (Object.keys(c.dados.fila).some(id => !c.dados.conflitos[id] && c.rejeitadas[id] !== c.dados.fila[id].mutationId)) agendar(c);
      return Object.keys(c.dados.fila).length === 0 && Object.keys(c.dados.conflitos).length === 0;
    } catch (e) {
      if (vigente(c)) c.falha = { tipo: e?.tipo || 'servidor' };
      return false;
    } finally { if (vigente(c)) { c.trabalho = null; emitir(); } }
  }
  function sincronizar() {
    const c = contexto(); if (!c.usuario) return Promise.resolve(false);
    if (c.trabalho) return c.trabalho;
    if (c.timer) { clearTimeout(c.timer); c.timer = null; }
    c.trabalho = Promise.resolve().then(() => executar(c)); emitir(); return c.trabalho;
  }
  function importarLegado() {
    const c = contexto(), anteriorDono = ler(DONO_LEGADO), antigas = legado();
    if (!c.usuario || anteriorDono || !antigas) return false;
    const d = copiar(c.dados), atuais = respostasDe(d);
    for (const id of IDS) {
      const r = antigas[id]; if (!r || igual(r, atuais[id])) continue;
      const e = d.entradas[id];
      if (atuais[id]) {
        // Nunca substitui o trabalho atual com uma importação ambígua.
        d.conflitos[id] = { local: r, servidor: atuais[id], revision: e?.revision || 0, atualizado_em: e?.atualizado_em || '', servidorPendente: Boolean(d.fila[id]) };
      }
      d.fila[id] = { registro: r, expectedRevision: e?.revision || 0, mutationId: idNovo() };
    }
    const anterior = c.dados;
    if (!gravar(c, d)) return false;
    if (!escrever(DONO_LEGADO, { usuario: c.usuario, em: new Date().toISOString() })) { gravar(c, anterior); return false; }
    c.falha = null; emitir(); agendar(c); return true;
  }
  function conflitosDetalhes() { const c = contexto(); return Object.entries(c.dados.conflitos).map(([id, r]) => ({ id, ...copiar(r) })); }
  async function resolverConflito(id, escolha) {
    const c = contexto(), conflito = c.dados.conflitos[id];
    if (!conflito || !['servidor', 'local'].includes(escolha)) return false;
    const d = copiar(c.dados);
    if (escolha === 'servidor') {
      d.entradas[id] = { registro: conflito.servidor, revision: conflito.revision, atualizado_em: conflito.atualizado_em };
      if (conflito.servidorPendente) d.fila[id] = { registro: conflito.servidor, expectedRevision: conflito.revision, mutationId: idNovo() };
      else delete d.fila[id];
    } else {
      const r = copiar(conflito.local);
      if (conflito.servidor.concluida) { r.concluida = true; r.data = conflito.servidor.data; }
      d.fila[id] = { registro: r, expectedRevision: conflito.revision, mutationId: idNovo() };
    }
    delete d.conflitos[id]; if (!gravar(c, d, { resolver: true })) return false;
    c.falha = null; emitir(); return sincronizar();
  }
  // A limpeza antiga apagava estudo sem confirmação do servidor. A nova jornada
  // não oferece exclusão de histórico; limpar a fila também perderia trabalho.
  function limpar() { return false; }
  if (loja()?.on) loja().on('usuario', () => { contexto(); emitir(); });
  if (typeof raiz.addEventListener === 'function') {
    raiz.addEventListener('online', () => { if (usuarioAtual()) sincronizar(); });
    raiz.addEventListener('storage', ev => {
      const c = contexto();
      if (ev.key === chave(c.usuario) || ev.key?.startsWith(prefixo(c.usuario))) { c.dados = carregar(c.usuario); c.conferido = false; emitir(); }
      if (ev.key === 'vof_user' || (typeof AUTH !== 'undefined' && ev.key === AUTH.CHAVE)) { contexto(); emitir(); }
    });
  }
  raiz.VOFJornada = Object.freeze({ IDS, estado, persistir, conectar: sincronizar, sincronizar, status, importarLegado, conflitosDetalhes, resolverConflito, limpar });
})(typeof window !== 'undefined' ? window : globalThis);
