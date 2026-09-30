import assert from "node:assert/strict";
import { test } from "node:test";
import { carimbo, fatoRepetido, juntarSeguidas } from "../src/claude.ts";
import { montarMime, paraBase64Url, previaEmail, validarEmail } from "../src/email.ts";
import { codificarConfirmacao, lerConfirmacao } from "../src/telegram-util.ts";

const valido = { para: ["Cliente@Exemplo.com.br"], cc: [], assunto: "Proposta", corpo: "Olá,\nsegue a proposta.", responderA: "" };

test("e-mail: valida destinatários, assunto e corpo", () => {
  const ok = validarEmail(valido);
  assert.ok(ok.ok);
  assert.deepEqual(ok.ok && ok.email.para, ["cliente@exemplo.com.br"]);
  assert.match((validarEmail({ ...valido, para: [] }) as { erro: string }).erro, /destinatário/);
  assert.match((validarEmail({ ...valido, para: ["Fulano <f@x.com>"] }) as { erro: string }).erro, /inválido/);
  assert.match((validarEmail({ ...valido, assunto: "" }) as { erro: string }).erro, /assunto/);
  assert.ok(validarEmail({ ...valido, assunto: "", responderA: "18c2f0a9" }).ok, "resposta pode herdar o assunto");
  assert.match((validarEmail({ ...valido, corpo: "  " }) as { erro: string }).erro, /corpo/);
  assert.match((validarEmail({ ...valido, cc: Array(10).fill("a@b.co") }) as { erro: string }).erro, /No máximo/);
  assert.match((validarEmail({ ...valido, responderA: "../x" }) as { erro: string }).erro, /Id/);
});

test("e-mail: quebra de linha no assunto não vira cabeçalho novo", () => {
  const v = validarEmail({ ...valido, assunto: "Oi\r\nBcc: espiao@x.com" });
  assert.ok(v.ok);
  const mime = montarMime(v.ok ? v.email : (undefined as never), "Oi\r\nBcc: espiao@x.com");
  const cabecalhos = mime.split("\r\n\r\n")[0]!.split("\r\n");
  assert.ok(!cabecalhos.some((l) => l.startsWith("Bcc:")));
});

test("e-mail: MIME em UTF-8 com assunto codificado e resposta na mesma conversa", () => {
  const v = validarEmail({ ...valido, corpo: "Orçamento aprovado. Obrigado!" });
  assert.ok(v.ok);
  const mime = montarMime(v.ok ? v.email : (undefined as never), "Re: Orçamento", { messageId: "<abc@mail>", references: "<x@mail>" });
  const [cabecalho, corpo] = mime.split("\r\n\r\n");
  assert.match(cabecalho!, /^To: cliente@exemplo\.com\.br\r\n/);
  assert.match(cabecalho!, /Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
  assert.match(cabecalho!, /In-Reply-To: <abc@mail>/);
  assert.match(cabecalho!, /References: <x@mail> <abc@mail>/);
  assert.equal(Buffer.from(corpo!.replace(/\r\n/g, ""), "base64").toString("utf8"), "Orçamento aprovado. Obrigado!");
  const raw = paraBase64Url(mime);
  assert.ok(!/[+/=]/.test(raw));
  assert.equal(Buffer.from(raw, "base64url").toString("utf8"), mime);
});

test("e-mail: a prévia mostra tudo o que vai sair", () => {
  const v = validarEmail({ ...valido, cc: ["socio@x.com"] });
  const previa = previaEmail(v.ok ? v.email : (undefined as never));
  for (const trecho of ["Para: cliente@exemplo.com.br", "Cc: socio@x.com", "Assunto: Proposta", "segue a proposta.", "Enviar"]) {
    assert.ok(previa.includes(trecho), trecho);
  }
});

test("botão de envio: ida e volta com o número do e-mail preparado", () => {
  const t = 1_800_000_000;
  const dado = codificarConfirmacao({ tipo: "email", pendenteId: 7 }, t);
  assert.ok(dado.length <= 64);
  assert.deepEqual(lerConfirmacao(dado, t + 1), { valida: true, acao: { tipo: "email", pendenteId: 7 } });
  assert.equal(lerConfirmacao("ok:email:-:1", 1).valida, false);
});

test("histórico: mensagens seguidas do mesmo lado viram uma só", () => {
  assert.deepEqual(
    juntarSeguidas([
      { papel: "user", conteudo: "manda" },
      { papel: "assistant", conteudo: "Pronto para enviar." },
      { papel: "assistant", conteudo: "[registro] enviado" },
      { papel: "user", conteudo: "valeu" },
    ]),
    [
      { papel: "user", conteudo: "manda" },
      { papel: "assistant", conteudo: "Pronto para enviar.\n\n[registro] enviado" },
      { papel: "user", conteudo: "valeu" },
    ],
  );
});

test("carimbo: dia e hora de Brasília na frente da mensagem do dono", () => {
  assert.equal(carimbo("2026-10-01T00:30:00Z", "America/Sao_Paulo"), "qua 30/09 21:30");
  assert.equal(carimbo("inválido", "America/Sao_Paulo"), "");
});

test("memória: fato igual ou já contido em outro não é salvo de novo", () => {
  const fatos = [{ id: 5, conteudo: "O irmão Pedro Henrique atua com o Léo na Universe Imports e em outras frentes." }];
  assert.equal(fatoRepetido("o irmão Pedro Henrique atua com o Léo na Universe Imports", fatos)?.id, 5);
  assert.equal(fatoRepetido("O Pedro Henrique saiu da Universe Imports.", fatos), null);
  assert.equal(fatoRepetido("Universe Imports", fatos), null, "curto demais para comparar");
});

test("botão de apagar fatos: ida e volta", () => {
  const dado = codificarConfirmacao({ tipo: "fatos", pendenteId: 12 }, 1_800_000_000);
  assert.deepEqual(lerConfirmacao(dado, 1_800_000_010), { valida: true, acao: { tipo: "fatos", pendenteId: 12 } });
});
