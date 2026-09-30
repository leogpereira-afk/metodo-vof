import assert from "node:assert/strict";
import { test } from "node:test";
import { ficha, gerarDocumento, lerBlocos, nomeDoArquivo, trechos } from "../src/documentos.ts";

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

test("ficha: rótulo e valor em negrito ou com dois-pontos", () => {
  assert.deepEqual(ficha("**Banco:** 208 · BTG Pactual"), { rotulo: "Banco", valor: "208 · BTG Pactual" });
  assert.deepEqual(ficha("Agência: 20"), { rotulo: "Agência", valor: "20" });
  assert.equal(ficha("Confira o nome do titular antes de pagar"), null);
});

test("destaque com > e separador --- no Markdown do documento", () => {
  assert.deepEqual(lerBlocos("Texto\n---\n> Atenção ao prazo").map((b) => b.tipo), ["paragrafo", "nota"]);
});

test("PDF com a fonte de emoji embutida fica pequeno; sem ela, o emoji só some", async () => {
  const md = "# 💳 Dados para pagamento\nPessoa Física\n\n## ⚡ PIX\n- **Banco:** 208 · BTG Pactual\n- **Chave:** 📱 11 97274-6113\n\n> ✅ Envie o comprovante.";
  const comEmoji = await gerarDocumento("Pix", "pdf", md);
  const semEmoji = await gerarDocumento("Pix", "pdf", md, { fonteEmoji: null });
  assert.ok(semEmoji.bytes.length < 20_000, `sem emoji: ${semEmoji.bytes.length}`);
  assert.ok(comEmoji.bytes.length > semEmoji.bytes.length + 50_000, "a fonte de emoji entrou no PDF");
  assert.ok(comEmoji.bytes.length < 300_000, `PDF grande demais: ${comEmoji.bytes.length}`);
});
