import assert from "node:assert/strict";
import { test } from "node:test";
import { criarBot } from "../src/bot.ts";
import { codificarConfirmacao } from "../src/telegram-util.ts";
const info = {
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
} as const;
test("PDF no Telegram percorre histórico, resposta e entrega sem duplicar mensagem recebida", async () => {
  const saidas: string[] = [], estados: string[] = [];
  let salvouDono = 0, respondeu = 0;
  const anexo = {
    tipo: "pdf",
    file_id: "arquivo",
    nome: "relatorio.pdf",
    mime: "application/pdf",
  };
  const memoria = {
    ultimaDoDono: async () => 7,
    historico: async () => [{
      papel: "user",
      conteudo: "Confira o documento",
      anexos: [anexo],
    }],
    registrarTurno: async (_id: string, d: any) => estados.push(d.estado),
    salvarMensagem: async (_c: number, p: string) => {
      if (p === "user") salvouDono++;
      return 7;
    },
  };
  const bot = criarBot(
    {
      telegramToken: "123456:fake",
      donoId: 27,
      fuso: "America/Sao_Paulo",
    } as any,
    memoria as any,
    {
      responder: async (h: any) => {
        respondeu++;
        assert.equal(h[0].anexos[0].file_id, "arquivo");
        return {
          texto: "O documento contém 42 itens.",
          anexos: [],
          consultas: ["leu PDF"],
          confirmacoes: [],
          usos: [],
        };
      },
    } as any,
    {} as any,
  );
  bot.botInfo = info;
  bot.api.config.use(async (_prev, method, payload: any) => {
    if (method === "sendMessage") saidas.push(payload.text);
    return { ok: true, result: true } as any;
  });
  await bot.handleUpdate({
    update_id: 7,
    _mensagem_id: 7,
    _anexos: [anexo],
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 27, type: "private" },
      from: { id: 27, is_bot: false, first_name: "Léo" },
      caption: "Confira o documento",
      document: {
        file_id: "arquivo",
        file_unique_id: "unico",
        file_name: "relatorio.pdf",
        mime_type: "application/pdf",
      },
    },
  } as any);
  assert.equal(salvouDono, 0);
  assert.equal(respondeu, 1);
  assert.equal(estados.at(-1), "entregue");
  assert.match(saidas.join(" "), /42 itens/);
});
test("e-mail só sai no botão do dono e nunca repete envio no segundo clique", async () => {
  let reservado = false, envios = 0;
  const email = {
    para: ["teste@example.com"],
    cc: [],
    assunto: "Teste",
    corpo: "Conteúdo de teste.",
    responderA: "",
  };
  const memoria = {
    reservarPendente: async () => {
      if (reservado) return null;
      reservado = true;
      return { tipo: "email", dados: email };
    },
    concluirPendente: async () => {},
    salvarMensagem: async () => 1,
  };
  const bot = criarBot(
    { telegramToken: "123456:fake", donoId: 27 } as any,
    memoria as any,
    {} as any,
    {
      enviarEmail: async () => {
        envios++;
        return { id: "gmail1", threadId: "thread1" };
      },
    } as any,
  );
  bot.botInfo = info;
  bot.api.config.use(async () => ({ ok: true, result: true } as any));
  const u = (id: number, dono: number) => ({
    update_id: id,
    callback_query: {
      id: String(id),
      chat_instance: "t",
      from: { id: dono, is_bot: false, first_name: "Dono" },
      data: codificarConfirmacao(
        { tipo: "email", pendenteId: 4 },
        Math.floor(Date.now() / 1000),
      ),
      message: {
        message_id: 1,
        date: 0,
        chat: { id: dono, type: "private" },
        text: "Enviar",
      },
    },
  });
  await bot.handleUpdate(u(1, 99) as any);
  assert.equal(envios, 0);
  await bot.handleUpdate(u(2, 27) as any);
  await bot.handleUpdate(u(3, 27) as any);
  assert.equal(envios, 1);
});
