import { Bot, InlineKeyboard, InputFile, type Context } from "grammy";
import { comRegistroInterno, type Cerebro } from "./claude.ts";
import type { Config } from "./config.ts";
import { formatarResumo } from "./custo.ts";
import type { Memoria } from "./memoria.ts";
import {
  CANCELAR,
  codificarConfirmacao,
  dataPorExtenso,
  dividirMensagem,
  lerConfirmacao,
  mesPorExtenso,
  type AcaoIrreversivel,
} from "./telegram-util.ts";

const AJUDA = [
  "Don Boy às ordens. Me conte o que precisa, como falaria com um velho amigo.",
  "",
  "/custo — gasto do mês em tokens e dólares",
  "/lembrar [texto] — salva um fato",
  "/fatos — lista os fatos salvos",
  "/esquecer [número] — apaga um fato (pede confirmação)",
  "/limpar — apaga o histórico da conversa (pede confirmação)",
].join("\n");

export const COMANDOS = [
  { command: "custo", description: "Gasto do mês em tokens e dólares" },
  { command: "lembrar", description: "Salvar um fato" },
  { command: "fatos", description: "Listar os fatos salvos" },
  { command: "esquecer", description: "Apagar um fato (com confirmação)" },
  { command: "limpar", description: "Apagar o histórico (com confirmação)" },
  { command: "ajuda", description: "O que eu sei fazer" },
];

const agoraS = () => Math.floor(Date.now() / 1000);

export function criarBot(config: Config, memoria: Memoria, cerebro: Cerebro): Bot {
  const bot = new Bot(config.telegramToken);

  // Porteiro: só o dono, só em conversa privada. Qualquer outro update é
  // ignorado em silêncio (nem confirma que o bot existe).
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== config.donoId) return;
    if (ctx.chat && ctx.chat.type !== "private") return;
    await next();
  });

  bot.command(["start", "ajuda"], (ctx) => ctx.reply(AJUDA));

  bot.command("custo", async (ctx) => {
    const resumo = await memoria.resumoDoMes(config.fuso);
    await ctx.reply(formatarResumo(resumo, mesPorExtenso(new Date(), config.fuso)));
  });

  bot.command("lembrar", async (ctx) => {
    const texto = ctx.match.trim();
    if (!texto) return ctx.reply("Use assim: /lembrar [o que devo guardar]");
    if (texto.length > 1000) return ctx.reply("Fato longo demais (máx. 1000 caracteres). Resuma.");
    const id = await memoria.salvarFato(texto, "comando");
    await ctx.reply(`Guardado (#${id}).`);
  });

  bot.command("fatos", async (ctx) => {
    const fatos = await memoria.listarFatos();
    if (fatos.length === 0) return ctx.reply("Nenhum fato salvo ainda. Use /lembrar [texto].");
    const linhas = fatos.map((f) => `${f.id}. ${f.conteudo}${f.origem === "conversa" ? " (aprendido)" : ""}`);
    await responderLongo(ctx, `${fatos.length} fato(s):\n\n${linhas.join("\n")}`);
  });

  bot.command("esquecer", async (ctx) => {
    const id = Number(ctx.match.trim().replace(/^#/, ""));
    if (!Number.isSafeInteger(id) || id <= 0) return ctx.reply("Use assim: /esquecer [número do fato]. Veja os números em /fatos.");
    const fato = await memoria.buscarFato(id);
    if (!fato) return ctx.reply(`Não existe fato #${id}.`);
    await pedirConfirmacao(ctx, `Apagar o fato #${id}?\n\n“${fato.conteudo}”\n\nIsso não tem volta.`, {
      tipo: "esquecer",
      fatoId: id,
    });
  });

  bot.command("limpar", (ctx) =>
    pedirConfirmacao(
      ctx,
      "Apagar TODO o histórico desta conversa? Os fatos salvos continuam.\n\nIsso não tem volta.",
      { tipo: "limpar" },
    ),
  );

  bot.callbackQuery(CANCELAR, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Cancelado. Nada foi apagado.");
  });

  bot.callbackQuery(/^ok:/, async (ctx) => {
    const leitura = lerConfirmacao(ctx.callbackQuery.data, agoraS());
    if (!leitura.valida) {
      await ctx.answerCallbackQuery({ text: leitura.motivo === "expirada" ? "Botão expirado." : "Botão inválido." });
      await ctx.editMessageText("Confirmação expirada. Nada foi apagado. Rode o comando de novo.");
      return;
    }
    // Tira os botões antes de executar: um segundo toque não repete a ação.
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup();
    await ctx.editMessageText(await executar(leitura.acao, ctx.chat!.id));
  });

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    await memoria.salvarMensagem(chatId, "user", ctx.message.text);

    const pararDigitando = manterDigitando(ctx);
    try {
      const historico = await memoria.historico(chatId);
      const { texto, anexos, consultas } = await cerebro.responder(historico, dataPorExtenso(new Date(), config.fuso));
      // O dono recebe só o texto; o histórico guarda também o que foi consultado.
      await memoria.salvarMensagem(chatId, "assistant", comRegistroInterno(texto, consultas));
      await responderLongo(ctx, texto);
      for (const anexo of anexos) {
        await ctx.replyWithDocument(new InputFile(anexo.bytes, anexo.nome), { caption: anexo.titulo });
      }
    } finally {
      pararDigitando();
    }
  });

  bot.on("message", (ctx) => ctx.reply("Por enquanto eu só leio texto."));

  bot.catch(async ({ ctx, error }) => {
    console.error("Erro no update", ctx.update.update_id, error);
    await ctx.reply("Deu erro do meu lado. Tente de novo em instantes.").catch(() => {});
  });

  async function executar(acao: AcaoIrreversivel, chatId: number): Promise<string> {
    if (acao.tipo === "esquecer") {
      return (await memoria.apagarFato(acao.fatoId))
        ? `Fato #${acao.fatoId} apagado.`
        : `O fato #${acao.fatoId} já não existia.`;
    }
    const n = await memoria.apagarHistorico(chatId);
    return `Histórico apagado (${n} mensagens). Começamos do zero; os fatos continuam.`;
  }

  return bot;
}

async function pedirConfirmacao(ctx: Context, pergunta: string, acao: AcaoIrreversivel): Promise<void> {
  const teclado = new InlineKeyboard()
    .text("✅ Confirmar", codificarConfirmacao(acao, agoraS()))
    .text("✖️ Cancelar", CANCELAR);
  await ctx.reply(pergunta, { reply_markup: teclado });
}

async function responderLongo(ctx: Context, texto: string): Promise<void> {
  for (const parte of dividirMensagem(texto)) await ctx.reply(parte);
}

// O "digitando..." do Telegram some em ~5 s; renova até a resposta sair.
function manterDigitando(ctx: Context): () => void {
  const enviar = () => ctx.replyWithChatAction("typing").catch(() => {});
  void enviar();
  const timer = setInterval(enviar, 4000);
  return () => clearInterval(timer);
}
