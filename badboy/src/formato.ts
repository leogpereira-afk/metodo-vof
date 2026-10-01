// Formatação das respostas no Telegram. O Claude escreve um Markdown simples
// (**negrito**, listas, tabelas); aqui vira o HTML que o Telegram entende.
// Tabela não existe no Telegram: a estreita vai como bloco monoespaçado
// alinhado; a larga, que quebraria no celular, vira uma linha por item.
// Se o Telegram recusar o HTML, quem envia cai para semMarcacao().

// Largura máxima (em caracteres) de uma tabela monoespaçada na tela do celular.
export const LARGURA_TABELA = 34;

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Negrito, itálico, código e link dentro de uma linha. Escapa antes: as
// marcações (*, `, [) não são afetadas pelo escape.
function emLinha(texto: string): string {
  const partes = texto.split(/(`[^`\n]+`)/);
  return partes
    .map((parte) => {
      if (/^`[^`\n]+`$/.test(parte)) return `<code>${esc(parte.slice(1, -1))}</code>`;
      return esc(parte)
        .replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>")
        .replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")
        .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
    })
    .join("");
}

const SEPARADOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const celulas = (linha: string) => linha.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function tabela(linhas: string[]): string {
  const cabecalho = celulas(linhas[0]!);
  const corpo = linhas.slice(2).map(celulas);
  const limpo = (c: string | undefined) => (c ?? "").replace(/\*\*/g, "").replace(/`/g, "");
  const larguras = cabecalho.map((_, i) => Math.max(...[cabecalho, ...corpo].map((r) => limpo(r[i]).length)));
  const total = larguras.reduce((a, b) => a + b, 0) + 2 * (larguras.length - 1);

  if (total <= LARGURA_TABELA) {
    const linha = (r: string[]) => r.map((c, i) => limpo(c).padEnd(larguras[i]!)).join("  ").trimEnd();
    const regua = larguras.map((l) => "─".repeat(l)).join("  ");
    return `<pre>${esc([linha(cabecalho), regua, ...corpo.map(linha)].join("\n"))}</pre>`;
  }
  return corpo
    .map((r) => {
      const [primeira, ...resto] = r;
      const campos = resto
        .map((c, i) => (c ? (cabecalho[i + 1] ? `${emLinha(cabecalho[i + 1]!)}: ${emLinha(c)}` : emLinha(c)) : ""))
        .filter(Boolean);
      return `▪️ <b>${emLinha(limpo(primeira))}</b>${campos.length ? `\n${campos.join(" · ")}` : ""}`;
    })
    .join("\n");
}

export function paraHtmlTelegram(texto: string): string {
  const linhas = texto.replace(/\r\n?/g, "\n").split("\n");
  const saida: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]!;

    if (/^\s*```/.test(linha)) {
      const bloco: string[] = [];
      while (++i < linhas.length && !/^\s*```/.test(linhas[i]!)) bloco.push(linhas[i]!);
      saida.push(`<pre>${esc(bloco.join("\n"))}</pre>`);
      continue;
    }
    if (/^\s*\|/.test(linha) && i + 1 < linhas.length && SEPARADOR.test(linhas[i + 1]!)) {
      const bloco = [linha, linhas[i + 1]!];
      i += 2;
      while (i < linhas.length && /^\s*\|/.test(linhas[i]!)) bloco.push(linhas[i++]!);
      i--;
      saida.push(tabela(bloco));
      continue;
    }
    const titulo = /^\s*#{1,6}\s+(.*)$/.exec(linha);
    if (titulo) {
      saida.push(`<b>${emLinha(titulo[1]!.replace(/\*\*/g, ""))}</b>`);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(linha)) continue;
    const item = /^(\s*)[-*+]\s+(.*)$/.exec(linha);
    if (item) {
      saida.push(`${item[1]}• ${emLinha(item[2]!)}`);
      continue;
    }
    const citacao = /^\s*>\s?(.*)$/.exec(linha);
    saida.push(emLinha(citacao ? citacao[1]! : linha));
  }
  return saida.join("\n");
}

// Plano B, quando o Telegram recusa o HTML: tira as marcações e manda puro.
export function semMarcacao(texto: string): string {
  return texto
    .replace(/\*\*([^*\n]+?)\*\*/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^(\s*)[-*+]\s+/gm, "$1• ");
}

// Divide depois de renderizar; fecha e reabre as tags em cada parte. Conta
// o texto visível em UTF-16 (conservador para o Telegram), sem cortar entidades.
export function partesTelegram(markdown: string): { html: string; texto: string }[] {
  const html = paraHtmlTelegram(markdown);
  const partes: { html: string; texto: string }[] = [];
  const abertas: { nome: string; tag: string }[] = [];
  let atual = "", texto = "";
  const fechar = () => {
    if (!texto) return;
    partes.push({ html: atual + [...abertas].reverse().map((t) => `</${t.nome}>`).join(""), texto });
    atual = abertas.map((t) => t.tag).join("");
    texto = "";
  };
  const tokens = html.match(/<[^>]+>|&(?:amp|lt|gt|quot|#\d+);|[^<&]+/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith("<")) {
      atual += token;
      if (token.startsWith("</")) abertas.pop();
      else abertas.push({ nome: /^<([a-z]+)/.exec(token)![1]!, tag: token });
      continue;
    }
    const decodificado = token === "&amp;"
      ? "&"
      : token === "&lt;"
      ? "<"
      : token === "&gt;"
      ? ">"
      : token === "&quot;"
      ? '"'
      : /^&#\d+;$/.test(token)
      ? String.fromCodePoint(Number(token.slice(2, -1)))
      : token;
    const segmentos = token.startsWith("&")
      ? [{ segment: decodificado }]
      : new Intl.Segmenter("pt-BR", { granularity: "grapheme" }).segment(decodificado);
    for (const { segment } of segmentos) {
      // Um grafema malicioso pode ter milhares de combinadores: subdivide
      // apenas esse caso, nunca um par substituto Unicode.
      const unidades = segment.length > 4096 ? [...segment] : [segment];
      for (const unidade of unidades) {
        if (texto.length + unidade.length > 4096) fechar();
        atual += esc(unidade);
        texto += unidade;
      }
    }
  }
  fechar();
  return partes;
}
