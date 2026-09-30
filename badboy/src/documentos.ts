// Documentos que o Don Boy gera e manda no Telegram: Word (.docx) para editar
// e PDF para enviar pronto. Entrada em Markdown simples:
//   # título   ## seção   ### subseção   - item   > destaque   **negrito**
//   linha em branco separa parágrafos
// No PDF, itens no formato "- **Rótulo:** valor" viram uma ficha (rótulo à
// esquerda, valor em destaque), bom para dados bancários, contatos e resumos.

import fontkit from "@pdf-lib/fontkit";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont, type PDFPage } from "pdf-lib";
import { FONTE_EMOJI_BASE64 } from "./fontes/emoji.ts";

export type Formato = "docx" | "pdf";

export interface Anexo {
  nome: string;
  titulo: string;
  bytes: Uint8Array;
}

export type Bloco =
  | { tipo: "titulo" | "subtitulo" | "secao"; texto: string }
  | { tipo: "item"; texto: string }
  | { tipo: "nota"; texto: string }
  | { tipo: "paragrafo"; texto: string };

export function lerBlocos(conteudo: string): Bloco[] {
  const blocos: Bloco[] = [];
  let paragrafo: string[] = [];
  const fecharParagrafo = () => {
    if (paragrafo.length > 0) blocos.push({ tipo: "paragrafo", texto: paragrafo.join(" ") });
    paragrafo = [];
  };

  for (const bruta of conteudo.replace(/\r\n?/g, "\n").split("\n")) {
    const linha = bruta.trim();
    const cabecalho = /^(#{1,3})\s+(.*)$/.exec(linha);
    const item = /^(?:[-*•])\s+(.*)$/.exec(linha);
    const nota = /^>\s?(.*)$/.exec(linha);
    if (!linha || /^(-{3,}|\*{3,}|_{3,})$/.test(linha)) {
      fecharParagrafo();
    } else if (cabecalho) {
      fecharParagrafo();
      const nivel = cabecalho[1]!.length;
      blocos.push({ tipo: nivel === 1 ? "titulo" : nivel === 2 ? "subtitulo" : "secao", texto: cabecalho[2]! });
    } else if (item) {
      fecharParagrafo();
      blocos.push({ tipo: "item", texto: item[1]! });
    } else if (nota) {
      fecharParagrafo();
      blocos.push({ tipo: "nota", texto: nota[1]! });
    } else {
      paragrafo.push(linha);
    }
  }
  fecharParagrafo();
  return blocos;
}

// "texto **forte** texto" → trechos com e sem negrito.
export function trechos(texto: string): { texto: string; negrito: boolean }[] {
  return texto
    .split(/(\*\*[^*]+\*\*)/)
    .filter((t) => t.length > 0)
    .map((t) => (t.startsWith("**") && t.endsWith("**") ? { texto: t.slice(2, -2), negrito: true } : { texto: t, negrito: false }));
}

// "- **Banco:** 208, BTG Pactual" ou "- Banco: 208" → rótulo e valor.
export function ficha(texto: string): { rotulo: string; valor: string } | null {
  const m = /^\*\*([^*]{1,40}?):?\*\*:?\s+(.+)$/.exec(texto) ?? /^([^:*]{1,32}):\s+(.+)$/.exec(texto);
  return m ? { rotulo: m[1]!.trim(), valor: m[2]!.trim() } : null;
}

export function nomeDoArquivo(titulo: string, formato: Formato): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "documento"}.${formato}`;
}

export interface OpcoesDocumento {
  // Fonte de emoji (TTF). undefined: a embutida; null: sem emoji.
  fonteEmoji?: Uint8Array | null;
  // Data que sai no cabeçalho do PDF (padrão: agora).
  data?: Date;
}

export async function gerarDocumento(titulo: string, formato: Formato, conteudo: string, opcoes: OpcoesDocumento = {}): Promise<Anexo> {
  const blocos = lerBlocos(conteudo);
  const bytes = formato === "docx" ? await gerarDocx(titulo, blocos) : await gerarPdf(titulo, blocos, opcoes);
  return { nome: nomeDoArquivo(titulo, formato), titulo, bytes };
}

async function gerarDocx(titulo: string, blocos: Bloco[]): Promise<Uint8Array> {
  const corridas = (texto: string, italico = false) =>
    trechos(texto).map((t) => new TextRun({ text: t.texto, bold: t.negrito, italics: italico }));
  const niveis = { titulo: HeadingLevel.HEADING_1, subtitulo: HeadingLevel.HEADING_2, secao: HeadingLevel.HEADING_3 };

  const paragrafos = blocos.map((b) => {
    if (b.tipo === "item") return new Paragraph({ children: corridas(b.texto), bullet: { level: 0 } });
    if (b.tipo === "paragrafo") return new Paragraph({ children: corridas(b.texto), spacing: { after: 160 } });
    if (b.tipo === "nota") return new Paragraph({ children: corridas(b.texto, true), indent: { left: 360 }, spacing: { after: 160 } });
    return new Paragraph({ children: corridas(b.texto), heading: niveis[b.tipo] });
  });

  const doc = new Document({
    creator: "Don Boy",
    title: titulo,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children: paragrafos }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

// ---------------------------------------------------------------- PDF

// Fonte de emoji embutida (recorte da Noto Emoji, monocromática): os emojis
// saem na cor do texto. Decodificada uma vez por instância.
let fonteEmojiPadrao: Uint8Array | null = null;
function fonteEmojiEmbutida(): Uint8Array {
  fonteEmojiPadrao ??= Uint8Array.from(atob(FONTE_EMOJI_BASE64), (c) => c.charCodeAt(0));
  return fonteEmojiPadrao;
}

const COR = {
  indigo: rgb(0.2196, 0.251, 0.9098), // #3840E8, a identidade visual do dono
  indigoSuave: rgb(0.933, 0.941, 0.992),
  indigoLinha: rgb(0.843, 0.855, 0.98),
  texto: rgb(0.118, 0.137, 0.188),
  cinza: rgb(0.42, 0.447, 0.502),
  borda: rgb(0.9, 0.906, 0.925),
  fundoFicha: rgb(0.969, 0.973, 0.988),
  branco: rgb(1, 1, 1),
  subtituloTopo: rgb(0.851, 0.859, 0.984),
};

// As fontes padrão do PDF só conhecem o alfabeto latino (WinAnsi): acentos
// do português passam; o resto some (emoji vai pela fonte de emoji).
const WIN_ANSI = /[^ -~ -ÿ–—‘’“”•…€]/g;
const limparParaPdf = (texto: string) =>
  texto.replace(/\t/g, "    ").replace(/→/g, "->").replace(/[─━]/g, "-").replace(WIN_ANSI, "");

const EMOJI = "\\p{Regional_Indicator}{2}|[0-9#*]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic}|\\p{Emoji_Modifier})*";
const SEPARA_EMOJI = new RegExp(`(${EMOJI})`, "u");
const E_EMOJI = new RegExp(`^(?:${EMOJI})$`, "u");

interface Estilo {
  fonte: PDFFont;
  tamanho: number;
  cor: Color;
}

// Pedaço de texto com a sua fonte: texto latino ou emoji.
interface Pedaco {
  texto: string;
  estilo: Estilo;
  emoji: boolean;
}

// Fonte de emoji embutida no PDF (se houver) e o teste de glifo dela.
type Fontes = { emoji: PDFFont | null; temGlifo: (cp: number) => boolean };

function pedacos(texto: string, estilo: Estilo, f: Fontes): Pedaco[] {
  const saida: Pedaco[] = [];
  for (const parte of texto.split(SEPARA_EMOJI)) {
    if (!parte) continue;
    if (E_EMOJI.test(parte)) {
      const limpo = parte.replace(/️/g, "");
      if (f.emoji && f.temGlifo(limpo.codePointAt(0)!)) saida.push({ texto: limpo, estilo, emoji: true });
    } else {
      const limpo = limparParaPdf(parte);
      if (limpo) saida.push({ texto: limpo, estilo, emoji: false });
    }
  }
  return saida;
}

function largura(p: Pedaco, f: Fontes): number {
  const fonte = p.emoji ? f.emoji! : p.estilo.fonte;
  return fonte.widthOfTextAtSize(p.texto, p.estilo.tamanho);
}

// Quebra texto com negrito e emoji em linhas que cabem na largura. Cada linha
// é uma lista de pedaços, já com a fonte certa.
function linhas(texto: string, base: Estilo, forte: Estilo, larguraMax: number, f: Fontes): Pedaco[][] {
  const palavras: Pedaco[][] = [];
  for (const t of trechos(texto)) {
    const estilo = t.negrito ? forte : base;
    for (const palavra of t.texto.split(/(\s+)/)) {
      if (!palavra) continue;
      if (/^\s+$/.test(palavra)) {
        palavras.push([{ texto: " ", estilo, emoji: false }]);
      } else {
        palavras.push(pedacos(palavra, estilo, f));
      }
    }
  }
  const resultado: Pedaco[][] = [];
  let atual: Pedaco[] = [];
  let larguraAtual = 0;
  for (const palavra of palavras) {
    const espaco = palavra.length === 1 && palavra[0]!.texto === " ";
    const w = palavra.reduce((soma, p) => soma + largura(p, f), 0);
    if (espaco) {
      if (atual.length > 0) {
        atual.push(...palavra);
        larguraAtual += w;
      }
      continue;
    }
    if (larguraAtual + w > larguraMax && atual.length > 0) {
      while (atual.length && atual.at(-1)!.texto === " ") larguraAtual -= largura(atual.pop()!, f);
      resultado.push(atual);
      atual = [];
      larguraAtual = 0;
    }
    atual.push(...palavra);
    larguraAtual += w;
  }
  while (atual.length && atual.at(-1)!.texto === " ") atual.pop();
  if (atual.length) resultado.push(atual);
  return resultado;
}

function desenharLinha(pagina: PDFPage, linha: Pedaco[], x: number, y: number, f: Fontes, cor?: Color): void {
  for (const p of linha) {
    const fonte = p.emoji ? f.emoji! : p.estilo.fonte;
    pagina.drawText(p.texto, { x, y, size: p.estilo.tamanho, font: fonte, color: cor ?? p.estilo.cor });
    x += largura(p, f);
  }
}

const dataPorExtenso = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" }).format(d);

async function gerarPdf(titulo: string, blocosEntrada: Bloco[], opcoes: OpcoesDocumento): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(limparParaPdf(titulo));
  pdf.setAuthor("Don Boy");
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);

  const bytesEmoji = opcoes.fonteEmoji === undefined ? fonteEmojiEmbutida() : opcoes.fonteEmoji;
  const f: Fontes = { emoji: null, temGlifo: () => false };
  if (bytesEmoji) {
    try {
      // Inteira: o recorte do pdf-lib apaga os desenhos desta fonte, e ela já é pequena.
      f.emoji = await pdf.embedFont(bytesEmoji, { subset: false });
      const leitor = fontkit.create(bytesEmoji);
      f.temGlifo = (cp) => leitor.hasGlyphForCodePoint(cp);
    } catch {
      f.emoji = null; // fonte inválida: segue sem emoji
    }
  }

  const [LARGURA_A4, ALTURA_A4] = [595.28, 841.89];
  const MARGEM = 48;
  const RODAPE = 56;
  const UTIL = LARGURA_A4 - 2 * MARGEM;
  const data = dataPorExtenso(opcoes.data ?? new Date());

  // O título e um subtítulo curto vão para a faixa do topo.
  const blocos = [...blocosEntrada];
  let tituloTopo = titulo;
  if (blocos[0]?.tipo === "titulo") tituloTopo = blocos.shift()!.texto;
  let subtituloTopo = "";
  if ((blocos[0]?.tipo === "paragrafo" || blocos[0]?.tipo === "subtitulo") && blocos[0].texto.length <= 110 && blocos.length > 1) {
    subtituloTopo = blocos.shift()!.texto;
  }

  const est = (fonte: PDFFont, tamanho: number, cor: Color): Estilo => ({ fonte, tamanho, cor });
  const corpo = est(normal, 10.5, COR.texto);
  const corpoForte = est(negrito, 10.5, COR.texto);

  let pagina = pdf.addPage([LARGURA_A4, ALTURA_A4]);
  let y: number;

  // Faixa do topo, só na primeira página.
  const linhasTitulo = linhas(tituloTopo, est(negrito, 21, COR.branco), est(negrito, 21, COR.branco), UTIL, f);
  const linhasSub = subtituloTopo ? linhas(subtituloTopo, est(normal, 11, COR.subtituloTopo), est(negrito, 11, COR.subtituloTopo), UTIL, f) : [];
  const alturaFaixa = 44 + linhasTitulo.length * 26 + linhasSub.length * 15 + 22;
  pagina.drawRectangle({ x: 0, y: ALTURA_A4 - alturaFaixa, width: LARGURA_A4, height: alturaFaixa, color: COR.indigo });
  y = ALTURA_A4 - 50;
  for (const l of linhasTitulo) {
    desenharLinha(pagina, l, MARGEM, y, f);
    y -= 26;
  }
  y += 6;
  for (const l of linhasSub) {
    desenharLinha(pagina, l, MARGEM, y, f);
    y -= 15;
  }
  pagina.drawText(data, { x: MARGEM, y: ALTURA_A4 - alturaFaixa + 14, size: 8.5, font: normal, color: COR.subtituloTopo });
  y = ALTURA_A4 - alturaFaixa - 30;

  const novaPagina = () => {
    pagina = pdf.addPage([LARGURA_A4, ALTURA_A4]);
    pagina.drawRectangle({ x: 0, y: ALTURA_A4 - 6, width: LARGURA_A4, height: 6, color: COR.indigo });
    y = ALTURA_A4 - MARGEM;
  };
  const garantir = (altura: number) => {
    if (y - altura < RODAPE) novaPagina();
  };

  const paragrafo = (texto: string, x: number, larguraMax: number, depois: number, base = corpo, forte = corpoForte) => {
    const alturaLinha = base.tamanho * 1.45;
    for (const l of linhas(texto, base, forte, larguraMax, f)) {
      garantir(alturaLinha);
      y -= alturaLinha;
      desenharLinha(pagina, l, x, y, f);
    }
    y -= depois;
  };

  for (let i = 0; i < blocos.length; i++) {
    const b = blocos[i]!;

    if (b.tipo === "titulo" || b.tipo === "subtitulo") {
      garantir(48);
      y -= 14;
      paragrafo(b.texto.replace(/\*\*/g, ""), MARGEM, UTIL, 0, est(negrito, 13.5, COR.indigo), est(negrito, 13.5, COR.indigo));
      y -= 5;
      pagina.drawLine({ start: { x: MARGEM, y }, end: { x: MARGEM + UTIL, y }, thickness: 1, color: COR.indigoLinha });
      y -= 8;
      continue;
    }
    if (b.tipo === "secao") {
      garantir(34);
      y -= 8;
      paragrafo(b.texto.replace(/\*\*/g, ""), MARGEM, UTIL, 4, est(negrito, 11.5, COR.texto), est(negrito, 11.5, COR.texto));
      continue;
    }
    if (b.tipo === "paragrafo") {
      paragrafo(b.texto, MARGEM, UTIL, 8);
      continue;
    }
    if (b.tipo === "nota") {
      const PAD = 10;
      const ls = linhas(b.texto, corpo, corpoForte, UTIL - 2 * PAD - 4, f);
      const altura = ls.length * 15 + 2 * PAD - 4;
      garantir(altura + 8);
      y -= 4;
      pagina.drawRectangle({ x: MARGEM, y: y - altura, width: UTIL, height: altura, color: COR.indigoSuave });
      pagina.drawRectangle({ x: MARGEM, y: y - altura, width: 3, height: altura, color: COR.indigo });
      let yl = y - PAD - 7;
      for (const l of ls) {
        desenharLinha(pagina, l, MARGEM + PAD + 4, yl, f);
        yl -= 15;
      }
      y -= altura + 10;
      continue;
    }

    // Itens: os de "rótulo: valor" seguidos formam uma ficha; os outros são
    // lista com marcador.
    const campo = ficha(b.texto);
    if (!campo) {
      const ls = linhas(b.texto, corpo, corpoForte, UTIL - 16, f);
      ls.forEach((l, n) => {
        garantir(15.2);
        y -= 15.2;
        if (n === 0) pagina.drawCircle({ x: MARGEM + 4, y: y + 3.4, size: 2.2, color: COR.indigo });
        desenharLinha(pagina, l, MARGEM + 16, y, f);
      });
      y -= 3;
      if (blocos[i + 1]?.tipo !== "item") y -= 6;
      continue;
    }
    const COL = Math.min(170, UTIL * 0.36);
    const PAD = 9;
    const rotulo = est(normal, 8.5, COR.cinza);
    const valor = est(negrito, 11.5, COR.texto);
    const valorLongo = est(normal, 10.5, COR.texto);
    let primeira = true;
    let j = i;
    for (; j < blocos.length; j++) {
      const item = blocos[j]!;
      const c = item.tipo === "item" ? ficha(item.texto) : null;
      if (!c) break;
      const estiloValor = c.valor.replace(/\*\*/g, "").length <= 48 ? valor : valorLongo;
      const lr = linhas(c.rotulo.toUpperCase(), rotulo, rotulo, COL - 2 * PAD, f);
      const lv = linhas(c.valor, estiloValor, est(negrito, estiloValor.tamanho, COR.texto), UTIL - COL - PAD, f);
      const altLinhaV = estiloValor.tamanho * 1.4;
      const altura = Math.max(lr.length * 11, lv.length * altLinhaV) + 2 * PAD;
      garantir(altura);
      pagina.drawRectangle({ x: MARGEM, y: y - altura, width: UTIL, height: altura, color: COR.fundoFicha });
      pagina.drawRectangle({ x: MARGEM, y: y - altura, width: 3, height: altura, color: COR.indigo });
      if (!primeira) pagina.drawLine({ start: { x: MARGEM + 3, y }, end: { x: MARGEM + UTIL, y }, thickness: 0.6, color: COR.borda });
      let yr = y - PAD - 8;
      for (const l of lr) {
        desenharLinha(pagina, l, MARGEM + PAD + 4, yr, f);
        yr -= 11;
      }
      let yv = y - PAD - estiloValor.tamanho + 1;
      for (const l of lv) {
        desenharLinha(pagina, l, MARGEM + COL, yv, f);
        yv -= altLinhaV;
      }
      y -= altura;
      primeira = false;
    }
    i = j - 1;
    y -= 14;
  }

  // Rodapé com o número da página, em todas as páginas.
  const paginas = pdf.getPages();
  paginas.forEach((p, n) => {
    p.drawLine({ start: { x: MARGEM, y: 38 }, end: { x: LARGURA_A4 - MARGEM, y: 38 }, thickness: 0.6, color: COR.borda });
    const numero = `${n + 1} / ${paginas.length}`;
    p.drawText(numero, { x: LARGURA_A4 - MARGEM - normal.widthOfTextAtSize(numero, 8), y: 24, size: 8, font: normal, color: COR.cinza });
  });
  return await pdf.save();
}
