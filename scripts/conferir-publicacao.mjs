// Confere se a pasta publicada leva TUDO o que a página pede.
//
// Por que existe: deploy por lista nominal já publicou um site com um .js
// faltando e o Actions verde ("casa.js 404 com deploy success"). Aqui cada
// caminho local citado pelo index.html, pelo SHELL do sw.js, pelo manifesto e
// pelas imagens do metodo.js precisa existir na pasta. Faltou um: sai com erro
// e diz qual.
//
// Uso: node scripts/conferir-publicacao.mjs dist
import { readFileSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';

const locais = lista => lista
  .map(x => String(x || '').trim())
  .filter(x => x && !/^(https?:|data:|mailto:|#)/i.test(x))
  .map(x => normalize(x.replace(/^\.\//, '').split('#')[0].split('?')[0]))
  .filter(x => x && x !== '.' && x !== './');

export function referencias(pasta) {
  const ler = nome => readFileSync(join(pasta, nome), 'utf8');
  const refs = new Set(['index.html']);
  const html = ler('index.html');
  locais([...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map(m => m[1])).forEach(x => refs.add(x));
  if (existsSync(join(pasta, 'sw.js'))) {
    const sw = ler('sw.js');
    const bloco = /const SHELL\s*=\s*\[([\s\S]*?)\]/.exec(sw);
    if (bloco) locais([...bloco[1].matchAll(/'([^']+)'/g)].map(m => m[1])).forEach(x => refs.add(x));
  }
  if (existsSync(join(pasta, 'manifest.webmanifest'))) {
    const man = JSON.parse(ler('manifest.webmanifest'));
    locais((man.icons || []).map(i => i.src)).forEach(x => refs.add(x));
  }
  if (existsSync(join(pasta, 'metodo.js'))) {
    const m = ler('metodo.js');
    locais([...m.matchAll(/\.\/assets\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|svg|gif)/g)].map(x => x[0])).forEach(x => refs.add(x));
  }
  return [...refs].sort();
}

export function conferir(pasta) {
  const refs = referencias(pasta);
  return { refs, faltando: refs.filter(r => !existsSync(join(pasta, r))) };
}

if (process.argv[1] && process.argv[1].endsWith('conferir-publicacao.mjs')) {
  const pasta = process.argv[2] || '.';
  const { refs, faltando } = conferir(pasta);
  if (faltando.length) {
    console.error('Faltam na publicação (' + faltando.length + '): ' + faltando.join(', '));
    process.exit(1);
  }
  console.log('Publicação completa: ' + refs.length + ' arquivos citados, todos presentes.');
}
