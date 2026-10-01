import assert from "node:assert/strict";
import { test } from "node:test";
import * as p from "../src/paginacao.ts";
test("paginação inclui a segunda página e informa quando a leitura é parcial", async () => {
  const fn = (p as any).lerPaginas;
  assert.equal(typeof fn, "function");
  const buscar = async (u: string) =>
    new URL(u).searchParams.has("pageToken")
      ? { items: [{ id: 2 }] }
      : { items: [{ id: 1 }], nextPageToken: "pagina2" };
  const r = await fn(buscar, "https://example.com/events", "items", 3);
  assert.deepEqual(r.items, [{ id: 1 }, { id: 2 }]);
  assert.equal(r.parcial, false);
  const limitado = await fn(buscar, "https://example.com/events", "items", 1);
  assert.equal(limitado.parcial, true);
  assert.equal(limitado.proximaPagina, "pagina2");
});
