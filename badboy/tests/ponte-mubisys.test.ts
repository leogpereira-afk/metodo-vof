import assert from "node:assert/strict";
import { test } from "node:test";
import { caminhoMubi } from "../ponte-segundo/mubisys.ts";

test("ERP ao vivo: só os caminhos permitidos, com a chave limpa", () => {
  assert.equal(caminhoMubi("os", "23.451"), "ordem-servico/numero/23451");
  assert.equal(caminhoMubi("orcamento", "28540"), "orcamento/numero/28540");
  assert.equal(caminhoMubi("cliente", "51.477.418/0001-25"), "cliente/cpfcnpj/51477418000125");
  assert.throws(() => caminhoMubi("contas-pagar", "1"), /não permitida/);
  assert.throws(() => caminhoMubi("cliente", "123"), /CPF ou CNPJ/);
  assert.throws(() => caminhoMubi("os", "../x"), /número/);
});

test("ERP ao vivo: dois 404 = não achou; um 404 seguido de achado vale o achado; sem segredo na saída", async () => {
  const { consultarMubisys } = await import("../ponte-segundo/mubisys.ts");
  const env = (n: string) => ({ MUBI_PUBLIC_KEY: "pub", MUBI_TOKEN: "tok" })[n];
  let chamadas = 0;
  const sempre404 = (async () => { chamadas++; return new Response("", { status: 404 }); }) as typeof fetch;
  assert.deepEqual(await consultarMubisys("os", "1", env, sempre404), { encontrado: false });
  assert.equal(chamadas, 2);

  const respostas = [new Response("", { status: 404 }), new Response(JSON.stringify({ data: { numero: "1", token: "x", itens: [{ senha: "y", nome: "a" }] } }), { status: 201 })];
  const pisca = (async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.mubisys.com/api/pub/ordem-servico/numero/1");
    assert.equal((init.headers as Record<string, string>)["Access-Token"], "tok");
    return respostas.shift()!;
  }) as typeof fetch;
  assert.deepEqual(await consultarMubisys("os", "1", env, pisca), { encontrado: true, registro: { numero: "1", itens: [{ nome: "a" }] } });

  const recusa = (async () => new Response("", { status: 401 })) as typeof fetch;
  await assert.rejects(consultarMubisys("os", "1", env, recusa), /credencial/);
});

test("Compras: manda a solicitação pela porta do link público, com o token do projeto", async () => {
  const { solicitarCompra } = await import("../ponte-segundo/mubisys.ts");
  const env = (n: string) => ({ COMPRAS_TOKEN: "ct", SUPABASE_URL: "https://x.supabase.co" })[n];
  const buscar = (async (url: string, init: RequestInit) => {
    assert.equal(url, "https://x.supabase.co/functions/v1/compras-nucleo");
    assert.equal((init.headers as Record<string, string>)["x-token"], "ct");
    const corpo = JSON.parse(init.body as string);
    assert.equal(corpo.action, "novaSolicitacao");
    assert.equal(corpo.registro.itens.length, 1);
    assert.equal(corpo.registro.solicitante.funcao, "Direção");
    return new Response(JSON.stringify({ ok: true, codigo: "SC-0040", numero: 40 }), { status: 200 });
  }) as typeof fetch;
  const r = await solicitarCompra(
    { itens: [{ descricao: "MDF 6mm", qtd: 2, unid: "chapa" }, { descricao: "", qtd: 1, unid: "un" }], setor: "", urgencia: "normal", necessidadeEm: "", justificativa: "OS 1", obra: "" },
    env,
    buscar,
  );
  assert.deepEqual(r, { codigo: "SC-0040", numero: 40 });
});
