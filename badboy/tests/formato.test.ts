import assert from "node:assert/strict";
import { test } from "node:test";
import { paraHtmlTelegram, semMarcacao } from "../src/formato.ts";

test("formato: negrito, listas, título e escape de HTML", () => {
  const html = paraHtmlTelegram("## Resumo\n**R$ 197 mil** vencidos <atenção>\n- item *um*\n* item dois\n---\n> citado");
  assert.equal(
    html,
    "<b>Resumo</b>\n<b>R$ 197 mil</b> vencidos &lt;atenção&gt;\n• item <i>um</i>\n• item dois\ncitado",
  );
});

test("formato: tabela estreita vira bloco alinhado", () => {
  const html = paraHtmlTelegram("| Dia | Hora |\n|---|---|\n| Seg | 08h |\n| **Ter** | 19h |");
  assert.equal(html, "<pre>Dia  Hora\n───  ────\nSeg  08h\nTer  19h</pre>");
});

test("formato: tabela larga vira uma linha por item, com o nome das colunas", () => {
  const md = [
    "| Opção | Preço total | Prazo de entrega | Observação |",
    "|:--|--:|---|---|",
    "| Fornecedor A | R$ 12.400 | 15 dias | frete incluso |",
    "| Fornecedor B | R$ 11.900 | 30 dias | |",
  ].join("\n");
  assert.equal(
    paraHtmlTelegram(md),
    "▪️ <b>Fornecedor A</b>\nPreço total: R$ 12.400 · Prazo de entrega: 15 dias · Observação: frete incluso\n" +
      "▪️ <b>Fornecedor B</b>\nPreço total: R$ 11.900 · Prazo de entrega: 30 dias",
  );
});

test("formato: código e link; plano B sem marcação", () => {
  assert.equal(paraHtmlTelegram("veja `a<b` e [site](https://x.com/a)"), 'veja <code>a&lt;b</code> e <a href="https://x.com/a">site</a>');
  assert.equal(paraHtmlTelegram("```\n<x>\n```"), "<pre>&lt;x&gt;</pre>");
  assert.equal(semMarcacao("## T\n**a** e `b`\n- c"), "T\na e b\n• c");
  assert.equal(paraHtmlTelegram("5 * 3 * 2 = 30"), "5 * 3 * 2 = 30");
});
