// Documentos que o Don Boy gera e manda no Telegram: Word (.docx) para editar
// e PDF para enviar pronto. Entrada em Markdown simples:
//   # título   ## subtítulo   ### seção   - item   **negrito**
//   linha em branco separa parágrafos

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";

export type Formato = "docx" | "pdf";

export interface Anexo {
  nome: string;
  titulo: string;
  bytes: Uint8Array;
}

export type Bloco =
  | { tipo: "titulo" | "subtitulo" | "secao"; texto: string }
  | { tipo: "item"; texto: string }
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
    if (!linha) {
      fecharParagrafo();
    } else if (cabecalho) {
      fecharParagrafo();
      const nivel = cabecalho[1]!.length;
      blocos.push({ tipo: nivel === 1 ? "titulo" : nivel === 2 ? "subtitulo" : "secao", texto: cabecalho[2]! });
    } else if (item) {
      fecharParagrafo();
      blocos.push({ tipo: "item", texto: item[1]! });
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

export function nomeDoArquivo(titulo: string, formato: Formato): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "documento"}.${formato}`;
}

export async function gerarDocumento(titulo: string, formato: Formato, conteudo: string): Promise<Anexo> {
  const blocos = lerBlocos(conteudo);
  const bytes = formato === "docx" ? await gerarDocx(titulo, blocos) : await gerarPdf(titulo, blocos);
  return { nome: nomeDoArquivo(titulo, formato), titulo, bytes };
}

async function gerarDocx(titulo: string, blocos: Bloco[]): Promise<Uint8Array> {
  const corridas = (texto: string) => trechos(texto).map((t) => new TextRun({ text: t.texto, bold: t.negrito }));
  const niveis = { titulo: HeadingLevel.HEADING_1, subtitulo: HeadingLevel.HEADING_2, secao: HeadingLevel.HEADING_3 };

  const paragrafos = blocos.map((b) => {
    if (b.tipo === "item") return new Paragraph({ children: corridas(b.texto), bullet: { level: 0 } });
    if (b.tipo === "paragrafo") return new Paragraph({ children: corridas(b.texto), spacing: { after: 160 } });
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

// As fontes padrão do PDF só conhecem o alfabeto latino (WinAnsi): acentos
// do português passam; emoji e símbolos raros saem do texto.
const WIN_ANSI = /[^\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g;
const limparParaPdf = (texto: string) => texto.replace(/\t/g, "    ").replace(WIN_ANSI, "");

function quebrarLinhas(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    // Palavra maior que a linha inteira: corta em pedaços.
    let resto = palavra;
    while (fonte.widthOfTextAtSize(resto, tamanho) > largura) {
      let corte = resto.length - 1;
      while (corte > 1 && fonte.widthOfTextAtSize(resto.slice(0, corte), tamanho) > largura) corte--;
      linhas.push(resto.slice(0, corte));
      resto = resto.slice(corte);
    }
    atual = resto;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

async function gerarPdf(titulo: string, blocos: Bloco[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(limparParaPdf(titulo));
  pdf.setAuthor("Don Boy");
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);

  const [LARGURA_A4, ALTURA_A4] = [595.28, 841.89];
  const MARGEM = 56;
  const LARGURA_UTIL = LARGURA_A4 - 2 * MARGEM;
  const RECUO_ITEM = 14;

  let pagina = pdf.addPage([LARGURA_A4, ALTURA_A4]);
  let y = ALTURA_A4 - MARGEM;

  const escrever = (
    texto: string,
    fonte: PDFFont,
    tamanho: number,
    x: number,
    largura: number,
    depois: number,
    marcador?: string,
  ) => {
    const alturaLinha = tamanho * 1.35;
    quebrarLinhas(limparParaPdf(texto), fonte, tamanho, largura).forEach((linha, i) => {
      if (y - alturaLinha < MARGEM) {
        pagina = pdf.addPage([LARGURA_A4, ALTURA_A4]);
        y = ALTURA_A4 - MARGEM;
      }
      y -= alturaLinha;
      if (i === 0 && marcador) pagina.drawText(marcador, { x: MARGEM + 2, y, size: tamanho, font: fonte });
      pagina.drawText(linha, { x, y, size: tamanho, font: fonte });
    });
    y -= depois;
  };

  const tamanhos = { titulo: 18, subtitulo: 14, secao: 12 };
  for (const b of blocos) {
    const semMarcas = b.texto.replace(/\*\*/g, "");
    if (b.tipo === "paragrafo") {
      escrever(semMarcas, normal, 11, MARGEM, LARGURA_UTIL, 8);
    } else if (b.tipo === "item") {
      escrever(semMarcas, normal, 11, MARGEM + RECUO_ITEM, LARGURA_UTIL - RECUO_ITEM, 4, "•");
    } else {
      y -= 6;
      escrever(semMarcas, negrito, tamanhos[b.tipo], MARGEM, LARGURA_UTIL, 6);
    }
  }
  return await pdf.save();
}
