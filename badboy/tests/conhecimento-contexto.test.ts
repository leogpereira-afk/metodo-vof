import assert from "node:assert/strict";
import { test } from "node:test";
import * as conhecimento from "../src/conhecimento.ts";
test("identifica pedidos operacionais e preserva integralmente a fonte ao segmentar", () => {
  const api = conhecimento as any;
  assert.equal(typeof api.segmentarConhecimento, "function");
  assert.equal(typeof api.precisaConhecimentoMubisys, "function");
  assert.equal(api.precisaConhecimentoMubisys("Qual a regra de comissão da Impresilk?"), true);
  assert.equal(api.precisaConhecimentoMubisys("A O.S. 23396 foi entregue?"), true);
  assert.equal(api.precisaConhecimentoMubisys("Boa noite!"), false);
  const fonte = "# Regra\n\n" + ("Texto com acento, unidade m² e documentos.\n".repeat(500));
  const partes = api.segmentarConhecimento(fonte, 4000);
  assert.ok(partes.every((p: any) => p.conteudo.length <= 4000));
  assert.equal(partes.map((p: any) => p.conteudo).join(""), fonte);
});
