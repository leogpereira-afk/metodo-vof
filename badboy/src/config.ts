// Configuração lida SÓ de variáveis de ambiente (secrets da Edge Function).
// Nenhuma chave no código. Falta algo obrigatório → erro com a lista do que
// falta. SUPABASE_URL e a chave secreta o Supabase injeta sozinho.

const ESFORCOS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Esforco = (typeof ESFORCOS)[number];

export interface Config {
  telegramToken: string;
  donoId: number;
  anthropicApiKey: string;
  modelo: string;
  esforco: Esforco;
  supabaseUrl: string;
  supabaseChave: string;
  fuso: string;
  urlPonte: string;
}

// Edge Function donboy-ponte do segundo projeto Supabase (leitura dos
// sistemas de lá). Não é segredo: o acesso exige o token guardado no Vault.
export const URL_PONTE_PADRAO = "https://heveemylixartyijxewh.supabase.co/functions/v1/donboy-ponte";

export type Ambiente = Record<string, string | undefined>;

export function lerConfig(env: Ambiente): Config {
  const faltando: string[] = [];
  const obrigatoria = (nome: string): string => {
    const valor = env[nome]?.trim();
    if (!valor) faltando.push(nome);
    return valor ?? "";
  };

  const telegramToken = extrairTokenTelegram(obrigatoria("TELEGRAM_BOT_TOKEN"));
  const donoIdTexto = obrigatoria("TELEGRAM_DONO_ID");
  const anthropicApiKey = obrigatoria("ANTHROPIC_API_KEY");
  const supabaseUrl = obrigatoria("SUPABASE_URL");
  const supabaseChave = obrigatoria("SUPABASE_SECRET_KEY");

  if (faltando.length > 0) {
    throw new Error(`Variáveis de ambiente faltando: ${faltando.join(", ")}`);
  }

  const donoId = Number(donoIdTexto);
  if (!Number.isSafeInteger(donoId) || donoId <= 0) {
    throw new Error("TELEGRAM_DONO_ID precisa ser o ID numérico do seu usuário no Telegram");
  }

  const esforco = (env.CLAUDE_ESFORCO?.trim() || "medium") as Esforco;
  if (!ESFORCOS.includes(esforco)) {
    throw new Error(`CLAUDE_ESFORCO inválido: use ${ESFORCOS.join(", ")}`);
  }

  return {
    telegramToken,
    donoId,
    anthropicApiKey,
    modelo: env.CLAUDE_MODELO?.trim() || "claude-opus-5-5",
    esforco,
    supabaseUrl,
    supabaseChave,
    fuso: env.FUSO?.trim() || "America/Sao_Paulo",
    urlPonte: env.DONBOY_PONTE_URL?.trim() || URL_PONTE_PADRAO,
  };
}

const TOKEN_TELEGRAM = /\d{5,}:[A-Za-z0-9_-]{30,}/;

// Token colado com sujeira: a mensagem inteira do @BotFather (texto + token)
// ou o token partido por uma quebra de linha. Pega só "números:letras".
export function extrairTokenTelegram(colado: string): string {
  return (
    TOKEN_TELEGRAM.exec(colado)?.[0] ??
    TOKEN_TELEGRAM.exec(colado.replace(/\s+/g, ""))?.[0] ??
    colado
  );
}
