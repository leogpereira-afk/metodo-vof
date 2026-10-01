import assert from "node:assert/strict";
import { test } from "node:test";
import { turno } from "../src/bot.ts";
function memoriaTeste() {
  const estados: string[] = [];
  const mensagens: string[] = [];
  return {
    estados,
    mensagens,
    historico: async () => [{ papel: "user", conteudo: "Olá" }],
    registrarTurno: async (_id: string, d: any) => {
      estados.push(d.estado);
    },
    salvarMensagem: async (_id: number, _p: string, t: string) => {
      mensagens.push(t);
    },
  };
}
const resposta = { texto: "Resposta completa.", anexos: [], consultas: [], confirmacoes: [], usos: [] };
test("falha de geração termina como falhou sem registrar resposta entregue", async () => {
  const m = memoriaTeste();
  await assert.rejects(turno({} as any, 1, { fuso: "America/Sao_Paulo" }, m as any, {
    responder: async () => {
      throw Error("modelo indisponível");
    },
  } as any));
  assert.equal(m.estados.at(-1), "falhou");
  assert.equal(m.mensagens.length, 0);
});
test("timeout no Telegram não repete envio nem registra entrega", async () => {
  const m = memoriaTeste();
  let envios = 0;
  await assert.rejects(turno(
    {
      sendMessage: async () => {
        envios++;
        throw Error("timeout");
      },
    } as any,
    1,
    { fuso: "America/Sao_Paulo" },
    m as any,
    { responder: async () => resposta } as any,
  ));
  assert.equal(envios, 1);
  assert.equal(m.estados.at(-1), "entrega_incerta");
  assert.equal(m.mensagens.length, 0);
});
test("entrega confirmada registra resposta e estado entregue", async () => {
  const m = memoriaTeste();
  await turno(
    { sendMessage: async () => ({}) } as any,
    1,
    { fuso: "America/Sao_Paulo" },
    m as any,
    { responder: async () => resposta } as any,
  );
  assert.equal(m.estados.at(-1), "entregue");
  assert.equal(m.mensagens.length, 1);
});
