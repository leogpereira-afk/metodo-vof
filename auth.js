// auth.js: o login da casa, conferido no SERVIDOR (equipe-auth, sistema "vof").
//
// A senha nunca é conferida aqui. O servidor devolve um CRACHÁ assinado (JWT
// com sis, sub, nome, papel e exp) e é ele que viaja em toda chamada ao
// vof-sync. O aparelho não tem o segredo: ele só lê o crachá para desenhar a
// tela. Papel adulterado no navegador não concede nada, porque o vof-sync
// confere assinatura, validade, sistema e papel em cada escrita.
//
// ENTRADA ÚNICA: o Painel grava o crachá do V.O.F. na chave "vof_cracha"
// (mesmo endereço, mesmo localStorage) e NÃO grava o usuário, porque não
// conhece o formato interno de cada app. Por isso existe dono(): quem chega
// pelo Painel entra lendo o dono do próprio crachá, sem ver a tela de senha.
// Foi exatamente esse defeito que trancou o Léo fora do PCP em 16/08.

const AUTH = (() => {
  const URL_AUTH = window.API_BASE + '/equipe-auth';
  const SISTEMA = 'vof';
  const K_TOKEN = 'vof_cracha';

  const pegar = () => { try { return localStorage.getItem(K_TOKEN) || ''; } catch { return ''; } };
  const guardar = t => { if (!t) return false; try { localStorage.setItem(K_TOKEN, t); return true; } catch { return false; } };
  const esquecer = () => { try { localStorage.removeItem(K_TOKEN); } catch {} };

  async function chamar(acao, corpo, comCracha) {
    const cab = { 'Content-Type': 'application/json' };
    if (comCracha) cab['Authorization'] = 'Bearer ' + pegar();
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 15000) : null;
    try {
      let r;
      try {
        r = await fetch(URL_AUTH, {
          method: 'POST', headers: cab, signal: ctrl ? ctrl.signal : undefined,
          body: JSON.stringify(Object.assign({ acao, sistema: SISTEMA }, corpo || {})),
        });
      } catch (e) {
        // Sem rede não é senha errada: status 0 deixa isso claro para quem chama.
        throw Object.assign(new Error('Sem conexão com o servidor.'), { status: 0, rede: true });
      }
      let dados = null;
      try { dados = await r.json(); } catch { dados = null; }
      if (!r.ok || !dados || typeof dados !== 'object' || dados.ok === false || dados.erro || dados.error) {
        const msg = (dados && (dados.erro || dados.error)) || ('O servidor respondeu ' + r.status + '.');
        throw Object.assign(new Error(msg), { status: r.status, erro: dados && (dados.erro || dados.error) });
      }
      return dados;
    } finally { if (timer) clearTimeout(timer); }
  }

  // Quem é o dono do crachá deste aparelho, lido do próprio crachá.
  // Não confere assinatura (o aparelho não tem o segredo; o servidor confere
  // em toda chamada). Confere o que dá para conferir aqui: formato, sistema e
  // validade. Crachá vencido ou de outro sistema devolve null e a tela de login
  // aparece, em vez de um app que só ouve recusa.
  function dono() {
    const t = pegar();
    if (!t) return null;
    const partes = t.split('.');
    if (partes.length !== 3) return null;
    try {
      let b = partes[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      const p = JSON.parse(decodeURIComponent(escape(atob(b))));
      if (!p || p.sis !== SISTEMA) return null;
      if (typeof p.exp !== 'number' || p.exp <= Math.floor(Date.now() / 1000)) return null;
      const usuario = String(p.sub || '').trim();
      if (!usuario) return null;
      return { usuario, nome: String(p.nome || usuario), papel: String(p.papel || '') };
    } catch { return null; }
  }

  return {
    SISTEMA,
    CHAVE: K_TOKEN,
    temCracha: () => !!pegar(),
    // O store assina cada chamada ao vof-sync com isto.
    cracha: pegar,
    dono,
    esquecer,

    async login(usuario, senha) {
      const r = await chamar('login', { usuario, senha });
      if (!r.token || !r.usuario || !r.papel) throw new Error('Resposta de login incompleta. Tente de novo.');
      if (!guardar(r.token)) throw new Error('Não consegui guardar o acesso neste aparelho (memória cheia ou navegação privada).');
      return r;
    },

    // Confere o crachá com o servidor. Sem internet devolve null (segue com o
    // que está no aparelho); crachá recusado devolve false.
    async eu() {
      try { return await chamar('eu', {}, true); } catch (e) { return e.status === 401 ? false : null; }
    },
  };
})();
