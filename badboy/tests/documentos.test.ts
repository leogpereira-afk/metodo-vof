import assert from "node:assert/strict";
import { test } from "node:test";
import { gerarDocumento, lerBlocos, nomeDoArquivo, trechos } from "../src/documentos.ts";

const EXEMPLO = `# Proposta Comercial
## Construção — Residencial Açaí

Prezados, apresentamos a **proposta** para a obra.
Valor e prazo abaixo.

### Condições
- Prazo: 180 dias
- Pagamento: 30% na assinatura 🚀
- Reajuste anual pelo INCC`;

test("lerBlocos reconhece títulos, itens e parágrafos de várias linhas", () => {
  assert.deepEqual(lerBlocos(EXEMPLO).map((b) => b.tipo), [
    "titulo", "subtitulo", "paragrafo", "secao", "item", "item", "item",
  ]);
  assert.equal(lerBlocos(EXEMPLO)[2]!.texto, "Prezados, apresentamos a **proposta** para a obra. Valor e prazo abaixo.");
});

test("trechos separa negrito", () => {
  assert.deepEqual(trechos("a **b** c"), [
    { texto: "a ", negrito: false },
    { texto: "b", negrito: true },
    { texto: " c", negrito: false },
  ]);
});

test("nome do arquivo sem acento nem espaço", () => {
  assert.equal(nomeDoArquivo("Proposta — Residencial Açaí 2026", "pdf"), "Proposta-Residencial-Acai-2026.pdf");
  assert.equal(nomeDoArquivo("!!!", "docx"), "documento.docx");
});

test("gera PDF e DOCX válidos, inclusive com emoji e texto longo", async () => {
  const longo = EXEMPLO + "\n\n" + Array.from({ length: 120 }, (_, i) => `Cláusula ${i + 1}: texto de exemplo com acentuação — ção, ã, é.`).join("\n\n");
  const pdf = await gerarDocumento("Proposta Açaí", "pdf", longo);
  assert.equal(new TextDecoder().decode(pdf.bytes.slice(0, 5)), "%PDF-");
  assert.equal(pdf.nome, "Proposta-Acai.pdf");
  const docx = await gerarDocumento("Proposta Açaí", "docx", longo);
  assert.equal(new TextDecoder().decode(docx.bytes.slice(0, 2)), "PK");
});
