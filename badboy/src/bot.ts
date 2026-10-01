import {identificarAnexo, type AnexoRecebido} from "./midia.ts";
import { previaRegistroCentral, type RegistroCentral } from "./central.ts";
import { type Api, Bot, type Context, InlineKeyboard, InputFile } from "grammy";
import { type Cerebro, comRegistroInterno, MARCA_REGISTRO } from "./claude.ts";
import { previaSolicitacao, validarSolicitacao } from "./compras.ts";
import type { Config } from "./config.ts";
import { formatarResumo } from "./custo.ts";
import { previaEmail, validarEmail } from "./email.ts";
import { partesTelegram } from "./formato.ts";
import type { Memoria } from "./memoria.ts";
import type { Sistemas } from "./sistemas.ts";
import {
  type AcaoIrreversivel,
  CANCELAR,
  codificarConfirmacao,
  dataPorExtenso,
  dividirMensagem,
  lerConfirmacao,
  mesPorExtenso,
} from "./telegram-util.ts";

const AJUDA = [
  "Don Boy às ordens. Me conte o que precisa, como falaria com um velho amigo.",
  "",
  "Envie PDF, foto, áudio ou arquivo de texto. Peça imagens, documentos e e-mails; e-mails saem com sua confirmação.",
  "/custo — gasto Claude do mês em tokens e dólares",
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
  sistemas: Pick<Sistemas, "enviarEmail" | "solicitarCompra" | "registrarCentral">,
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
    await ctx.reply(formatarResumo(resumo, mesPorExtenso(new Date(), config.fuso)) + "\n\nÁudio e imagens usam uma API complementar; seus custos não estão incluídos neste total do Claude.");
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
    if (!Number.isSafeInteger(id) || id <= 0) {
      return ctx.reply("Use assim: /esquecer [número do fato]. Veja os números em /fatos.");
    }
    const fato = await memoria.buscarFato(id);
    if (!fato) return ctx.reply(`Não existe fato #${id}.`);
    await pedirConfirmacao(ctx.api, ctx.chat.id, `Apagar o fato #${id}?\n\n“${fato.conteudo}”\n\nIsso não tem volta.`, {
      tipo: "esquecer",
      fatoId: id,
    });
  });

  bot.command("limpar", (ctx) =>
    pedirConfirmacao(
      ctx.api,
      ctx.chat.id,
      "Apagar TODO o histórico desta conversa? Os fatos salvos continuam.\n\nIsso não tem volta.",
      { tipo: "limpar" },
    ));

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

  bot.on("message", async (ctx) => {
    const recebidoUpdate=ctx.update as unknown as {_erro_anexo?:string;_anexos?:AnexoRecebido[]};
    if(recebidoUpdate._erro_anexo)return void await ctx.reply(recebidoUpdate._erro_anexo);
    let anexos:AnexoRecebido[];
    try {const a=identificarAnexo(ctx.message);anexos=recebidoUpdate._anexos??(a?[a]:[]);}
    catch(e){return void await ctx.reply((e as Error).message);}
    if(!ctx.message.text&&!anexos.length)return void await ctx.reply("Envie texto, PDF, foto, áudio, TXT, CSV, JSON ou Markdown. Vídeos e outros formatos ainda não são processados.");
    const texto=ctx.message.text||ctx.message.caption||(anexos[0]?.tipo==='audio'?'Áudio recebido: transcreva e responda ao pedido falado, se houver.':'Analise o arquivo enviado e apresente o conteúdo e os pontos principais.');
    const chatId = ctx.chat.id;
    const recebido = (ctx.update as unknown as { _mensagem_id?: number })._mensagem_id;
    const minha = Number.isSafeInteger(recebido)
      ? recebido
      : await memoria.salvarMensagem(chatId, "user", texto, anexos);

    const pararDigitando = manterDigitando(ctx);
    try {
      await esperar(ESPERA_AGRUPAR_MS);
      if ((await memoria.ultimaDoDono(chatId)) !== minha) return; // chegou outra: ela responde por todas
      await turno(ctx.api, chatId, config, memoria, cerebro);
    } finally {
      pararDigitando();
    }
  });


  bot.catch(async ({ ctx, error }) => {
    console.error("Erro no update", ctx.update.update_id, error);
    await ctx.reply(
      "Não concluí o pedido. Registrei a falha; se houve uma ação externa, confira o resultado antes de repetir.",
    ).catch(() => {});
    throw error;
  });

  async function executar(acao: AcaoIrreversivel, chatId: number): Promise<string> {
    if (acao.tipo === "central") return await registrarCentral(acao.pendenteId, chatId);
    if (acao.tipo === "email") return await enviarEmail(acao.pendenteId, chatId);
    if (acao.tipo === "fatos") return await apagarFatos(acao.pendenteId, chatId);
    if (acao.tipo === "compra") return await pedirCompra(acao.pendenteId, chatId);
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
    const pendente = await memoria.reservarPendente(pendenteId, "email");
    if (!pendente || pendente.tipo !== "email") {
      return "Não executei agora: esta confirmação já foi usada, expirou ou está em análise. Confira o resultado anterior antes de reenviar.";
    }
    const validacao = validarEmail(pendente.dados);
    if (!validacao.ok) {
      await memoria.concluirPendente(pendenteId, `recusado: ${validacao.erro}`, "falhou");
      return `Não enviei: ${validacao.erro}`;
    }
    const { para, assunto } = validacao.email;
    try {
      await sistemas.enviarEmail(validacao.email);
    } catch (e) {
      const motivo = (e as Error).message;
      await memoria.concluirPendente(pendenteId, `erro: ${motivo}`, "incerto");
      await memoria.salvarMensagem(
        chatId,
        "assistant",
        `${MARCA_REGISTRO} O envio do e-mail #${pendenteId} não pôde ser confirmado (${motivo}). Confira o Gmail antes de tentar outra vez.`,
      );
      return `⚠️ Não consegui confirmar o envio. Confira a pasta Enviados antes de repetir. Detalhe: ${motivo}`;
    }
    await memoria.concluirPendente(pendenteId, "enviado");
    await memoria.salvarMensagem(
      chatId,
      "assistant",
      `${MARCA_REGISTRO} O dono tocou em Enviar e o e-mail #${pendenteId} foi enviado para ${para.join(", ")}${
        assunto ? `, assunto "${assunto}"` : ""
      }.`,
    );
    return `✅ E-mail enviado para ${para.join(", ")}.`;
  }

  // Solicitação de material ao Compras, depois do toque em Solicitar.
  async function pedirCompra(pendenteId: number, chatId: number): Promise<string> {
    const pendente = await memoria.reservarPendente(pendenteId, "compra");
    if (!pendente || pendente.tipo !== "compra") {
      return "Não executei agora: esta confirmação já foi usada, expirou ou está em análise. Confira o resultado anterior antes de repetir.";
    }
    const validacao = validarSolicitacao(pendente.dados);
    if (!validacao.ok) {
      await memoria.concluirPendente(pendenteId, `recusada: ${validacao.erro}`, "falhou");
      return `Não enviei: ${validacao.erro}`;
    }
    try {
      const { codigo } = await sistemas.solicitarCompra(validacao.solicitacao);
      await memoria.concluirPendente(pendenteId, `enviada: ${codigo ?? "sem código"}`);
      await memoria.salvarMensagem(
        chatId,
        "assistant",
        `${MARCA_REGISTRO} O dono tocou em Solicitar e a solicitação de compra ${
          codigo ?? `#${pendenteId}`
        } foi aberta no Compras.`,
      );
      return `✅ Solicitação ${codigo ?? `#${pendenteId}`} aberta no Compras. O comprador já vê na fila.`;
    } catch (e) {
      const motivo = (e as Error).message;
      await memoria.concluirPendente(pendenteId, `erro: ${motivo}`, "incerto");
      await memoria.salvarMensagem(
        chatId,
        "assistant",
        `${MARCA_REGISTRO} A solicitação de compra #${pendenteId} ficou sem confirmação (${motivo}). Confira o Compras antes de repetir.`,
      );
      return `⚠️ Não consegui confirmar a solicitação. Confira o Compras antes de repetir. Detalhe: ${motivo}`;
    }
  }

  // Fatos que o Claude propôs apagar, depois do toque em Apagar.
  async function apagarFatos(pendenteId: number, chatId: number): Promise<string> {
    const pendente = await memoria.reservarPendente(pendenteId, "fatos");
    const ids = ((pendente?.dados as { ids?: unknown } | undefined)?.ids ?? []) as unknown[];
    if (!pendente || pendente.tipo !== "fatos" || !Array.isArray(ids)) {
      return "Essa limpeza já foi feita ou não existe mais. Nada foi feito agora.";
    }
    const apagados: number[] = [];
    for (const id of ids.map(Number).filter(Number.isSafeInteger)) {
      if (await memoria.apagarFato(id)) apagados.push(id);
    }
    await memoria.concluirPendente(pendenteId, `apagados: ${apagados.join(", ") || "nenhum"}`);
    await memoria.salvarMensagem(
      chatId,
      "assistant",
      `${MARCA_REGISTRO} O dono tocou em Apagar e os fatos ${
        apagados.join(", ") || "(nenhum)"
      } foram apagados da memória.`,
    );
    return apagados.length
      ? `✅ Apagados da memória: ${apagados.map((id) => `#${id}`).join(", ")}.`
      : "Esses fatos já não existiam. Nada mudou.";
  }

  async function registrarCentral(pendenteId: number, chatId: number): Promise<string> {
    const pendente = await memoria.reservarPendente(pendenteId, "central");
    if (!pendente) return "Esta confirmação expirou ou já foi utilizada. Confira o resultado anterior.";
    try {
      const r = await sistemas.registrarCentral(pendente.dados as RegistroCentral);
      if (!r.gravado) throw new Error("A Central não confirmou a gravação.");
      await memoria.concluirPendente(pendenteId, "registrado: " + r.id);
      await memoria.salvarMensagem(
        chatId,
        "assistant",
        `${MARCA_REGISTRO} Registro #${pendenteId} gravado e conferido na Central do Léo; id ${r.id}.`,
      );
      return "✅ Registro gravado e conferido na Central do Léo.";
    } catch (e) {
      await memoria.concluirPendente(pendenteId, (e as Error).message, "incerto");
      return "⚠️ Não confirmei a gravação: " + (e as Error).message +
        ". Confira o cadastro antes de preparar outra tentativa.";
    }
  }

  return bot;
}

// Um turno do Don Boy numa conversa: lê o histórico (a mensagem do dono já
// está gravada), pensa, grava a resposta e entrega texto, documentos e
// botões. Serve à mensagem do dono e às rotinas (briefing da manhã).
export async function turno(
  api: Api,
  chatId: number,
  config: Pick<Config, "fuso">,
  memoria: Memoria,
  cerebro: Cerebro,
): Promise<void> {
  const historico = await memoria.historico(chatId);
  const turnoId = crypto.randomUUID(), inicio = Date.now();
  await memoria.registrarTurno(turnoId, { chat_id: chatId, estado: "gerando" });
  let entregaIniciada = false;
  try {
    const { texto, anexos, consultas, confirmacoes, usos } = await cerebro.responder(
      historico,
      dataPorExtenso(new Date(), config.fuso),
      { chatId },
    );
    await memoria.registrarTurno(turnoId, {
      chat_id: chatId,
      estado: "gerado",
      resposta: texto,
      consultas,
      modelo: usos.at(-1)?.modelo,
      custo_usd: usos.reduce((s, u) => s + u.custoUsd, 0),
      duracao_ms: Date.now() - inicio,
    });
    // O dono recebe só o texto; o histórico guarda também o que foi consultado.
    entregaIniciada = true;
    await responderFormatado(api, chatId, texto);
    for (const anexo of anexos) {
      await api.sendDocument(chatId, new InputFile(anexo.bytes, anexo.nome), { caption: anexo.titulo });
    }
    // Cada ação preparada aparece inteira, com o botão embaixo.
    for (const c of confirmacoes) {
      if (c.tipo === "central") {
        await pedirConfirmacao(api, chatId, previaRegistroCentral(c.registro), {
          tipo: "central",
          pendenteId: c.pendenteId,
        }, "✅ Registrar");
      } else if (c.tipo === "email") {
        await pedirConfirmacao(
          api,
          chatId,
          previaEmail(c.email),
          { tipo: "email", pendenteId: c.pendenteId },
          "📤 Enviar",
        );
      } else if (c.tipo === "compra") {
        await pedirConfirmacao(api, chatId, previaSolicitacao(c.solicitacao), {
          tipo: "compra",
          pendenteId: c.pendenteId,
        }, "🛒 Solicitar");
      } else {
        const lista = c.fatos.map((f) => `#${f.id}. ${f.conteudo}`).join("\n\n");
        await pedirConfirmacao(
          api,
          chatId,
          `🗑️ APAGAR ${c.fatos.length} FATO(S) DA MEMÓRIA${
            c.motivo ? `\n${c.motivo}` : ""
          }\n\n${lista}\n\nIsso não tem volta.`,
          { tipo: "fatos", pendenteId: c.pendenteId },
          "🗑️ Apagar",
        );
      }
    }
    await memoria.salvarMensagem(chatId, "assistant", comRegistroInterno(texto, consultas));
    await memoria.registrarTurno(turnoId, {
      chat_id: chatId,
      estado: "entregue",
      finalizado_em: new Date().toISOString(),
    });
  } catch (e) {
    await memoria.registrarTurno(turnoId, {
      chat_id: chatId,
      estado: entregaIniciada ? "entrega_incerta" : "falhou",
      erro: (e as Error).message,
      finalizado_em: new Date().toISOString(),
    });
    throw e;
  }
}

// Mensagem com os botões de confirmação. Texto longo (um e-mail grande) vai
// em partes, com os botões na última.
async function pedirConfirmacao(
  api: Api,
  chatId: number,
  pergunta: string,
  acao: AcaoIrreversivel,
  rotulo = "✅ Confirmar",
): Promise<void> {
  const teclado = new InlineKeyboard()
    .text(rotulo, codificarConfirmacao(acao, agoraS()))
    .text("✖️ Cancelar", CANCELAR);
  const partes = dividirMensagem(pergunta);
  for (const parte of partes.slice(0, -1)) await api.sendMessage(chatId, parte);
  await api.sendMessage(chatId, partes.at(-1) ?? pergunta, { reply_markup: teclado });
}

async function responderLongo(ctx: Context, texto: string): Promise<void> {
  for (const parte of dividirMensagem(texto)) await ctx.reply(parte);
}

// Resposta do Claude: negrito, listas e tabelas em HTML do Telegram. Se o
// Telegram recusar a marcação de um trecho, esse trecho vai em texto puro.
async function responderFormatado(api: Api, chatId: number, texto: string): Promise<void> {
  for (const parte of partesTelegram(texto)) {
    try {
      await api.sendMessage(chatId, parte.html, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    } catch (e) {
      const mensagem = (e as Error).message;
      if (!/can't parse entities|message is too long|can't find end|unsupported start tag/i.test(mensagem)) throw e;
      console.error("HTML recusado pelo Telegram, indo em texto puro:", (e as Error).message);
      await api.sendMessage(chatId, parte.texto);
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
