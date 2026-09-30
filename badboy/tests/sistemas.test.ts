import assert from "node:assert/strict";
import { test } from "node:test";
import { MARCA_REGISTRO, comRegistroInterno, extrairTexto, usoDaInternet } from "../src/claude.ts";
import { SEGREDO_PONTE, Sistemas } from "../src/sistemas.ts";

const URL = "https://segundo.invalid/functions/v1/donboy-ponte";

function montar(opcoes: { token?: string | null; status?: number; dados?: unknown; erroPrincipal?: string } = {}) {
  const chamadas = { segredo: 0, fetch: [] as { url: string; init: RequestInit }[], principal: [] as string[] };
  const memoria = {
    consultarBanco: async (sql: string) => {
      chamadas.principal.push(sql);
      return [{ origem: "principal" }];
    },
    novidades: async () => {
      if (opcoes.erroPrincipal) throw new Error(opcoes.erroPrincipal);
      return [{ tabela: "recebimentos", linhas: 3 }];
    },
    segredo: async (nome: string) => {
      assert.equal(nome, SEGREDO_PONTE);
      chamadas.segredo++;
      return opcoes.token === undefined ? "t".repeat(64) : opcoes.token;
    },
  };
  const buscar = (async (url: string, init: RequestInit) => {
    chamadas.fetch.push({ url, init });
    return new Response(JSON.stringify(opcoes.status && opcoes.status >= 400 ? { erro: "falhou lá" } : { dados: opcoes.dados ?? [{ origem: "segundo" }] }), {
      status: opcoes.status ?? 200,
    });
  }) as typeof fetch;
  return { sistemas: new Sistemas(memoria, URL, buscar), chamadas };
}

test("principal consulta direto; segundo vai pela ponte com o token do Vault", async () => {
  const { sistemas, chamadas } = montar();
  assert.deepEqual(await sistemas.consultar("principal", "select 1"), [{ origem: "principal" }]);
  assert.deepEqual(chamadas.principal, ["select 1"]);
  assert.equal(chamadas.fetch.length, 0);

  assert.deepEqual(await sistemas.consultar("segundo", "select 2"), [{ origem: "segundo" }]);
  await sistemas.consultar("segundo", "select 3");
  assert.equal(chamadas.segredo, 1, "o token é lido do Vault uma vez só");
  assert.equal(chamadas.fetch.length, 2);
  const { url, init } = chamadas.fetch[0]!;
  assert.equal(url, URL);
  assert.equal((init.headers as Record<string, string>)["x-donboy-token"], "t".repeat(64));
  assert.deepEqual(JSON.parse(init.body as string), { acao: "consultar", sql: "select 2" });
});

test("ponte recusada (401): erro claro e o token é relido na próxima", async () => {
  const { sistemas, chamadas } = montar({ status: 401 });
  await assert.rejects(sistemas.consultar("segundo", "select 1"), /recusou o acesso/);
  await assert.rejects(sistemas.consultar("segundo", "select 1"), /recusou o acesso/);
  assert.equal(chamadas.segredo, 2);
});

test("ponte sem token no Vault: avisa que não está configurada", async () => {
  const { sistemas, chamadas } = montar({ token: null });
  await assert.rejects(sistemas.consultar("segundo", "select 1"), /não configurada/);
  assert.equal(chamadas.fetch.length, 0);
});

test("erro do segundo sistema chega com a mensagem de lá", async () => {
  const { sistemas } = montar({ status: 400 });
  await assert.rejects(sistemas.consultar("segundo", "select x"), /falhou lá/);
});

test("novidades: um sistema com erro não esconde o outro", async () => {
  const { sistemas, chamadas } = montar({ erroPrincipal: "fora do ar", dados: [{ tabela: "leo_estado", linhas: 1 }] });
  const novidades = await sistemas.novidades(24);
  assert.deepEqual(novidades, [
    { sistema: "principal", ok: false, erro: "fora do ar" },
    { sistema: "segundo", ok: true, tabelas: [{ tabela: "leo_estado", linhas: 1 }] },
  ]);
  assert.deepEqual(JSON.parse(chamadas.fetch[0]!.init.body as string), { acao: "novidades", horas: 24 });
});

test("registro interno: só entra no histórico quando houve consulta", () => {
  assert.equal(comRegistroInterno("Oi, Léo.", []), "Oi, Léo.");
  const salvo = comRegistroInterno("Achei 3 contas.", ["consultou o sistema segundo: select 1", "novidades das últimas 24 h nos dois sistemas"]);
  assert.ok(salvo.startsWith("Achei 3 contas.\n\n"));
  assert.ok(salvo.includes(MARCA_REGISTRO));
  assert.ok(salvo.includes("consultou o sistema segundo: select 1 | novidades das últimas 24 h"));
});

test("agenda, Gmail e lembrete vão pela ponte com a ação certa", async () => {
  const { sistemas, chamadas } = montar();
  await sistemas.agenda("2026-10-01", "2026-10-07");
  await sistemas.buscarEmails("is:unread newer_than:2d", 5);
  await sistemas.lerEmail("abc123");
  await sistemas.criarLembrete({ titulo: "Ligar", data: "2026-10-02", hora: "09:00", duracaoMin: 15, nota: "" });
  assert.deepEqual(
    chamadas.fetch.map((c) => JSON.parse(c.init.body as string)),
    [
      { acao: "agenda", de: "2026-10-01", ate: "2026-10-07" },
      { acao: "gmail_buscar", consulta: "is:unread newer_than:2d", quantos: 5 },
      { acao: "gmail_ler", id: "abc123" },
      { acao: "agenda_lembrete", lembrete: { titulo: "Ligar", data: "2026-10-02", hora: "09:00", duracaoMin: 15, nota: "" } },
    ],
  );
  assert.equal(chamadas.segredo, 1);
});

test("texto com citações da internet: blocos seguidos viram uma frase só", () => {
  const blocos = [
    { type: "thinking", thinking: "...", signature: "x" },
    { type: "text", text: "Deixa eu ver." },
    { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "dólar hoje" } },
    { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
    { type: "text", text: "O dólar fechou a " },
    { type: "text", text: "R$ 5,31", citations: [{ type: "web_search_result_location" }] },
    { type: "text", text: " hoje." },
  ] as never;
  assert.equal(extrairTexto(blocos), "Deixa eu ver.\n\nO dólar fechou a R$ 5,31 hoje.");
  assert.deepEqual(usoDaInternet(blocos), ["pesquisou na internet: dólar hoje"]);
  assert.deepEqual(
    usoDaInternet([{ type: "server_tool_use", id: "s2", name: "web_fetch", input: { url: "https://exemplo.com" } }] as never),
    ["leu a página https://exemplo.com"],
  );
});
