import assert from "node:assert/strict";
import { test } from "node:test";
import { criarBot } from "../src/bot.ts";
import { codificarConfirmacao } from "../src/telegram-util.ts";
test("botão Central só executa para o dono e uma única vez", async () => {
  let reservado = false, gravacoes = 0;
  const estados: string[] = [];
  const saidas: string[] = [];
  const m = {
    reservarPendente: async () => {
      if (reservado) return null;
      reservado = true;
      return { tipo: "central", dados: { tipo: "hotel" } };
    },
    concluirPendente: async (_id: number, _r: string, estado = "concluido") => estados.push(estado),
    salvarMensagem: async () => 1,
  };
  const bot = criarBot(
    { telegramToken: "123456:fake", donoId: 27 } as any,
    m as any,
    {} as any,
    {
      registrarCentral: async () => {
        gravacoes++;
        return { gravado: true, id: "v1", item: {} };
      },
    } as any,
  );
  bot.botInfo = {
    id: 1,
    is_bot: true,
    first_name: "Teste",
    username: "teste_bot",
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
    can_manage_bots: false,
    supports_join_request_queries: false,
  };
  bot.api.config.use(async (_prev, method, payload: any) => {
    if (method === "sendMessage") saidas.push(payload.text);
    return { ok: true, result: true } as any;
  });
  const update = (uid: number, id: number) => ({
    update_id: uid,
    callback_query: {
      id: String(uid),
      chat_instance: "teste",
      from: { id, is_bot: false, first_name: "Pessoa" },
      data: codificarConfirmacao({ tipo: "central", pendenteId: 7 }, Math.floor(Date.now() / 1000)),
      message: {
        message_id: 1,
        date: 0,
        chat: { id, type: "private" as const, first_name: "Pessoa" },
        text: "Registrar",
      },
    },
  });
  await bot.handleUpdate(update(1, 99));
  assert.equal(gravacoes, 0);
  await bot.handleUpdate(update(2, 27));
  await bot.handleUpdate(update(3, 27));
  assert.equal(gravacoes, 1);
  assert.deepEqual(estados, ["concluido"]);
  assert.ok(saidas[0]?.includes("gravado"));
  assert.ok(saidas[1]?.includes("utilizada"));
});
