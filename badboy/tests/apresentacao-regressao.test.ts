import assert from "node:assert/strict";
import { test } from "node:test";
import * as formato from "../src/formato.ts";
const partes = (texto: string) => {
  const fn =
    (formato as unknown as { partesTelegram?: (s: string) => { html: string; texto: string }[] }).partesTelegram;
  assert.equal(typeof fn, "function", "a entrega precisa dividir o HTML renderizado");
  return fn!(texto);
};
test("tabela expandida respeita o limite final e mantém todas as linhas", () => {
  const md = "| Item | Prazo de entrega | Observação importante |\n|---|---|---|\n" +
    Array.from({ length: 100 }, (_, i) => `| ITEM_${i + 1} | 7 dias | conferir |`).join("\n");
  const p = partes(md);
  assert.ok(p.length > 1);
  assert.ok(p.every((x) => x.texto.length <= 4096));
  const t = p.map((x) => x.texto).join("");
  for (let i = 1; i <= 100; i++) assert.ok(t.includes(`ITEM_${i}`));
});
test("divisão preserva negrito, entidades e caracteres Unicode", () => {
  const p = partes("**" + ("Olá & 👨‍👩‍👧 ".repeat(700)) + "**");
  assert.ok(p.length > 1);
  for (const x of p) {
    assert.ok(x.texto.length <= 4096);
    assert.ok(x.html.startsWith("<b>"));
    assert.ok(x.html.endsWith("</b>"));
    assert.ok(!/[\uD800-\uDBFF]$/.test(x.texto));
  }
  assert.equal(p.map((x) => x.texto).join(""), "Olá & 👨‍👩‍👧 ".repeat(700));
});
