// Service worker do Método V.O.F.
//
// REDE PRIMEIRO, cache como reserva. Os outros apps da casa servem o cache
// primeiro e dependem de alguém lembrar de subir a versão a cada publicação;
// quando esquece, a equipe fica presa na versão velha (já aconteceu: o dono
// via a v76 com a v79 no ar). Aqui a versão do servidor sempre ganha quando há
// internet, e o cache só entra sem sinal ou quando a rede demora mais de 4 s.
// Mesmo assim, suba CACHE ao mudar a lista SHELL ou a autenticação.
//
// A API NUNCA passa por aqui (supabase.co vai direto) e só o GET do próprio
// site é tratado: fontes e qualquer outro endereço seguem o caminho normal.
const CACHE = 'vof-shell-v3';
const SHELL = ['./', './index.html', './styles.css', './metodo.css', './config.js', './auth.js',
  './store.js', './metodo.js', './app.js', './manifest.webmanifest', './favicon.svg', './icone-192.png', './icone-512.png',
  // As duas marcas da capa e da sala: sem elas, fora do ar a capa perde a logo.
  // As páginas do caderno (p0xx.jpg) carregam sob demanda e entram no cache ao abrir.
  './assets/vof/logo-vof.png', './assets/vof/logo-leonardo-goncalves.png'];

self.addEventListener('install', e => {
  // cache:'reload' busca da rede, não do cache HTTP do navegador (o Pages
  // manda max-age=600): sem isto, a instalação guardaria a versão anterior.
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

// Apaga versões velhas DESTE sistema, e só delas. O cache é por endereço, e
// os sistemas da casa moram todos em leogpereira-afk.github.io: apagar o que
// não é meu zeraria o disco dos vizinhos.
const MEU_PREFIXO = 'vof-';
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(
    ks.filter(k => k !== CACHE && k.startsWith(MEU_PREFIXO)).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

function daRede(req) {
  // no-cache revalida com o servidor (ETag): barato e sempre atual. A
  // navegação vai como veio: ela não aceita opções novas e não pode receber
  // resposta redirecionada de um fetch feito aqui.
  const pedido = req.mode === 'navigate' ? fetch(req) : fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
  return pedido.then(resp => {
    if (resp && resp.ok && resp.type === 'basic' && !resp.redirected) {
      const copia = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
    }
    return resp;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;   // API sempre fresca, nunca do cache
  if (url.origin !== self.location.origin) return;    // só o próprio site
  e.respondWith(new Promise(resolve => {
    let respondido = false;
    const responder = r => { if (!respondido && r) { respondido = true; resolve(r); } };
    const doCache = () => caches.match(req, { ignoreSearch: true });
    const lenta = setTimeout(() => { doCache().then(responder); }, 4000);
    daRede(req).then(r => { clearTimeout(lenta); responder(r); })
      .catch(() => { clearTimeout(lenta); doCache().then(hit => responder(hit || Response.error())); });
  }));
});
