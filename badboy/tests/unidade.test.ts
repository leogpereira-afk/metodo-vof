import assert from "node:assert/strict";
import { test } from "node:test";
import { lerConfig } from "../src/config.js";
import { calcularCusto, custosDaResposta } from "../src/custo.js";
import { JANELA_MIN, JANELA_PASSO, tamanhoJanela } from "../src/memoria.js";
import {
  VALIDADE_CONFIRMACAO_S,
  codificarConfirmacao,
  dividirMensagem,
  lerConfirmacao,
} from "../src/telegram-util.js";

test("janela do histórico: início só anda de passo em passo (cache estável)", () => {
  assert.equal(tamanhoJanela(0), 0);
  assert.equal(tamanhoJanela(7), 7);
  assert.equal(tamanhoJanela(JANELA_MIN), JANELA_MIN);
  let inicioAnterior = 0;
  let mudancas = 0;
  for (let total = 1; total <= 200; total++) {
    const n = tamanhoJanela(total);
    assert.ok(n <= JANELA_MIN + JANELA_PASSO - 1, `janela grande demais em ${total}`);
    assert.ok(total <= JANELA_MIN || n >= JANELA_MIN, `janela pequena demais em ${total}`);
    const inicio = total - n;
    assert.ok(inicio >= inicioAnterior, "o início nunca volta");
    if (inicio !== inicioAnterior) {
      mudancas++;
      assert.equal(inicio % JANELA_PASSO, 0);
    }
    inicioAnterior = inicio;
  }
  assert.equal(mudancas, Math.floor((200 - JANELA_MIN) / JANELA_PASSO));
});

test("dividirMensagem respeita o limite e não perde texto", () => {
  const texto = Array.from({ length: 300 }, (_, i) => `Parágrafo ${i} ${"x".repeat(40)}`).join("\n\n");
  const partes = dividirMensagem(texto, 500);
  assert.ok(partes.length > 1);
  for (const p of partes) assert.ok(p.length <= 500);
  assert.equal(partes.join(" ").replace(/\s+/g, " "), texto.replace(/\s+/g, " "));
  assert.deepEqual(dividirMensagem("curto"), ["curto"]);
  assert.deepEqual(dividirMensagem("a".repeat(1200), 500).map((p) => p.length), [500, 500, 200]);
});

test("confirmação: ida e volta, expiração e dado forjado", () => {
  const t = 1_800_000_000;
  const esq = codificarConfirmacao({ tipo: "esquecer", fatoId: 42 }, t);
  assert.ok(esq.length <= 64, "callback_data do Telegram tem no máx. 64 bytes");
  assert.deepEqual(lerConfirmacao(esq, t + 5), { valida: true, acao: { tipo: "esquecer", fatoId: 42 } });
  assert.deepEqual(lerConfirmacao(codificarConfirmacao({ tipo: "limpar" }, t), t), {
    valida: true,
    acao: { tipo: "limpar" },
  });
  assert.deepEqual(lerConfirmacao(esq, t + VALIDADE_CONFIRMACAO_S + 1), { valida: false, motivo: "expirada" });
  assert.equal(lerConfirmacao("ok:limpar:7:1", t).valida, false);
  assert.equal(lerConfirmacao("ok:esquecer:-:1", t).valida, false);
  assert.equal(lerConfirmacao("ok:apagar_tudo:-:1", t).valida, false);
});

test("custo: entrada, saída, escrita e leitura de cache", () => {
  const r = calcularCusto("claude-sonnet-5-5", {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cache_creation_input_tokens: 1_000_000,
    cache_read_input_tokens: 1_000_000,
  });
  // 2 + 10 + 2,50 (escrita 5 min) + 0,20
  assert.equal(r.custoUsd.toFixed(2), "14.70");

  const umaHora = calcularCusto("claude-sonnet-5-5", {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 1_000_000,
    cache_read_input_tokens: 0,
    cache_creation: { ephemeral_1h_input_tokens: 1_000_000, ephemeral_5m_input_tokens: 0 },
  });
  assert.equal(umaHora.custoUsd.toFixed(2), "4.00");

  // Modelo desconhecido nunca sai mais barato que o mais caro da tabela.
  const desconhecido = calcularCusto("modelo-novo", {
    input_tokens: 1_000_000,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  });
  assert.equal(desconhecido.custoUsd, 5);
});

test("custo: fallback cobra cada iteração pelo modelo que rodou", () => {
  const base = { cache_creation: null, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const resposta = {
    model: "claude-sonnet-5",
    usage: {
      ...base,
      input_tokens: 2_000_000,
      output_tokens: 0,
      iterations: [
        { ...base, type: "message", model: "claude-sonnet-5-5", input_tokens: 1_000_000, output_tokens: 0 },
        { ...base, type: "fallback_message", model: "claude-opus-4-8", input_tokens: 1_000_000, output_tokens: 0 },
      ],
    },
  } as never;
  const custos = custosDaResposta(resposta);
  assert.deepEqual(custos.map((c) => [c.modelo, c.custoUsd]), [
    ["claude-sonnet-5-5", 2],
    ["claude-opus-4-8", 5],
  ]);
});

test("config: exige as chaves e valida o ID do dono", () => {
  assert.throws(() => lerConfig({}), /TELEGRAM_BOT_TOKEN.*ANTHROPIC_API_KEY.*SUPABASE_SECRET_KEY/);
  const env = {
    TELEGRAM_BOT_TOKEN: "t",
    TELEGRAM_DONO_ID: "123",
    ANTHROPIC_API_KEY: "a",
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SECRET_KEY: "s",
  };
  const c = lerConfig(env);
  assert.equal(c.modelo, "claude-sonnet-5-5");
  assert.equal(c.esforco, "low");
  assert.equal(c.donoId, 123);
  assert.throws(() => lerConfig({ ...env, TELEGRAM_DONO_ID: "@leo" }), /ID numérico/);
  assert.throws(() => lerConfig({ ...env, CLAUDE_ESFORCO: "turbo" }), /CLAUDE_ESFORCO/);
});
