import { Bot, InlineKeyboard, InputFile, type Context } from "grammy";
import { MARCA_REGISTRO, comRegistroInterno, type Cerebro } from "./claude.ts";
import type { Config } from "./config.ts";
import { formatarResumo } from "./custo.ts";
import { previaEmail, validarEmail } from "./email.ts";
import { paraHtmlTelegram, semMarcacao } from "./formato.ts";
import type { Memoria } from "./memoria.ts";
import type { Sistemas } from "./sistemas.ts";
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

// Texto longo chega partido pelo Telegram em várias mensagens, e ele às vezes
// manda duas ou três seguidas. Cada mensagem espera um instante; só a última
// responde, e o histórico junta todas numa vez só (claude.ts juntarSeguidas).
export const ESPERA_AGRUPAR_MS = 2500;
const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

export function criarBot(
  config: Config,
  memoria: Memoria,
  cerebro: Cerebro,
  sistemas: Pick<Sistemas, "enviarEmail">,
): Bot {
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

  // Cancelar e botão vencido só tiram os botões: a mensagem (a prévia de um
  // e-mail, por exemplo) continua na conversa, e um aviso curto vem abaixo.
  bot.callbackQuery(CANCELAR, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup();
    await ctx.reply("Cancelado. Nada foi feito.");
  });

  bot.callbackQuery(/^ok:/, async (ctx) => {
    const leitura = lerConfirmacao(ctx.callbackQuery.data, agoraS());
    if (!leitura.valida) {
      await ctx.answerCallbackQuery({ text: leitura.motivo === "expirada" ? "Botão expirado." : "Botão inválido." });
      await ctx.editMessageReplyMarkup();
      await ctx.reply("Confirmação expirada. Nada foi feito. Peça de novo.");
      return;
    }
    // Tira os botões antes de executar: um segundo toque não repete a ação.
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup();
    await ctx.reply(await executar(leitura.acao, ctx.chat!.id));
  });

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const minha = await memoria.salvarMensagem(chatId, "user", ctx.message.text);

    const pararDigitando = manterDigitando(ctx);
    try {
      await esperar(ESPERA_AGRUPAR_MS);
      if ((await memoria.ultimaDoDono(chatId)) !== minha) return; // chegou outra: ela responde por todas
      const historico = await memoria.historico(chatId);
      const { texto, anexos, consultas, confirmacoes } = await cerebro.responder(historico, dataPorExtenso(new Date(), config.fuso));
      // O dono recebe só o texto; o histórico guarda também o que foi consultado.
      await memoria.salvarMensagem(chatId, "assistant", comRegistroInterno(texto, consultas));
      await responderFormatado(ctx, texto);
      for (const anexo of anexos) {
        await ctx.replyWithDocument(new InputFile(anexo.bytes, anexo.nome), { caption: anexo.titulo });
      }
      // Cada ação preparada aparece inteira, com o botão embaixo.
      for (const c of confirmacoes) {
        if (c.tipo === "email") {
          await pedirConfirmacao(ctx, previaEmail(c.email), { tipo: "email", pendenteId: c.pendenteId }, "📤 Enviar");
        } else {
          const lista = c.fatos.map((f) => `#${f.id}. ${f.conteudo}`).join("\n\n");
          await pedirConfirmacao(
            ctx,
            `🗑️ APAGAR ${c.fatos.length} FATO(S) DA MEMÓRIA${c.motivo ? `\n${c.motivo}` : ""}\n\n${lista}\n\nIsso não tem volta.`,
            { tipo: "fatos", pendenteId: c.pendenteId },
            "🗑️ Apagar",
          );
        }
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
    if (acao.tipo === "email") return await enviarEmail(acao.pendenteId, chatId);
    if (acao.tipo === "fatos") return await apagarFatos(acao.pendenteId, chatId);
    if (acao.tipo === "esquecer") {
      return (await memoria.apagarFato(acao.fatoId))
        ? `Fato #${acao.fatoId} apagado.`
        : `O fato #${acao.fatoId} já não existia.`;
    }
    const n = await memoria.apagarHistorico(chatId);
    return `Histórico apagado (${n} mensagens). Começamos do zero; os fatos continuam.`;
  }

  // Envio do e-mail preparado, depois do toque em Enviar. A reserva é
  // atômica: se já foi enviado (dois toques), não manda de novo. O resultado
  // entra no histórico para o Don Boy saber, na próxima conversa, que saiu.
  async function enviarEmail(pendenteId: number, chatId: number): Promise<string> {
    const pendente = await memoria.reservarPendente(pendenteId);
    if (!pendente || pendente.tipo !== "email") return "Esse e-mail já foi enviado ou não existe mais. Nada foi feito agora.";
    const validacao = validarEmail(pendente.dados);
    if (!validacao.ok) {
      await memoria.concluirPendente(pendenteId, `recusado: ${validacao.erro}`);
      return `Não enviei: ${validacao.erro}`;
    }
    const { para, assunto } = validacao.email;
    try {
      await sistemas.enviarEmail(validacao.email);
    } catch (e) {
      const motivo = (e as Error).message;
      await memoria.concluirPendente(pendenteId, `erro: ${motivo}`);
      await memoria.salvarMensagem(chatId, "assistant", `${MARCA_REGISTRO} O e-mail #${pendenteId} NÃO foi enviado (${motivo}).`);
      return `❌ Não enviei o e-mail: ${motivo}`;
    }
    await memoria.concluirPendente(pendenteId, "enviado");
    await memoria.salvarMensagem(
      chatId,
      "assistant",
      `${MARCA_REGISTRO} O dono tocou em Enviar e o e-mail #${pendenteId} foi enviado para ${para.join(", ")}${assunto ? `, assunto "${assunto}"` : ""}.`,
    );
    return `✅ E-mail enviado para ${para.join(", ")}.`;
  }

  // Fatos que o Claude propôs apagar, depois do toque em Apagar.
  async function apagarFatos(pendenteId: number, chatId: number): Promise<string> {
    const pendente = await memoria.reservarPendente(pendenteId);
    const ids = ((pendente?.dados as { ids?: unknown } | undefined)?.ids ?? []) as unknown[];
    if (!pendente || pendente.tipo !== "fatos" || !Array.isArray(ids)) return "Essa limpeza já foi feita ou não existe mais. Nada foi feito agora.";
    const apagados: number[] = [];
    for (const id of ids.map(Number).filter(Number.isSafeInteger)) {
      if (await memoria.apagarFato(id)) apagados.push(id);
    }
    await memoria.concluirPendente(pendenteId, `apagados: ${apagados.join(", ") || "nenhum"}`);
    await memoria.salvarMensagem(chatId, "assistant", `${MARCA_REGISTRO} O dono tocou em Apagar e os fatos ${apagados.join(", ") || "(nenhum)"} foram apagados da memória.`);
    return apagados.length ? `✅ Apagados da memória: ${apagados.map((id) => `#${id}`).join(", ")}.` : "Esses fatos já não existiam. Nada mudou.";
  }

  return bot;
}

// Mensagem com os botões de confirmação. Texto longo (um e-mail grande) vai
// em partes, com os botões na última.
async function pedirConfirmacao(ctx: Context, pergunta: string, acao: AcaoIrreversivel, rotulo = "✅ Confirmar"): Promise<void> {
  const teclado = new InlineKeyboard()
    .text(rotulo, codificarConfirmacao(acao, agoraS()))
    .text("✖️ Cancelar", CANCELAR);
  const partes = dividirMensagem(pergunta);
  for (const parte of partes.slice(0, -1)) await ctx.reply(parte);
  await ctx.reply(partes.at(-1) ?? pergunta, { reply_markup: teclado });
}

async function responderLongo(ctx: Context, texto: string): Promise<void> {
  for (const parte of dividirMensagem(texto)) await ctx.reply(parte);
}

// Resposta do Claude: negrito, listas e tabelas em HTML do Telegram. Se o
// Telegram recusar a marcação de um trecho, esse trecho vai em texto puro.
async function responderFormatado(ctx: Context, texto: string): Promise<void> {
  for (const parte of dividirMensagem(texto)) {
    try {
      await ctx.reply(paraHtmlTelegram(parte), { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    } catch (e) {
      console.error("HTML recusado pelo Telegram, indo em texto puro:", (e as Error).message);
      await ctx.reply(semMarcacao(parte));
    }
  }
}

// O "digitando..." do Telegram some em ~5 s; renova até a resposta sair.
function manterDigitando(ctx: Context): () => void {
  const enviar = () => ctx.replyWithChatAction("typing").catch(() => {});
  void enviar();
  const timer = setInterval(enviar, 4000);
  return () => clearInterval(timer);
}
