// Configuração lida SÓ de variáveis de ambiente. Nenhuma chave no código.
// Falta algo obrigatório → o processo nem sobe, com a lista do que falta.

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
}

export function lerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const faltando: string[] = [];
  const obrigatoria = (nome: string): string => {
    const valor = env[nome]?.trim();
    if (!valor) faltando.push(nome);
    return valor ?? "";
  };

  const telegramToken = obrigatoria("TELEGRAM_BOT_TOKEN");
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

  const esforco = (env.CLAUDE_ESFORCO?.trim() || "low") as Esforco;
  if (!ESFORCOS.includes(esforco)) {
    throw new Error(`CLAUDE_ESFORCO inválido: use ${ESFORCOS.join(", ")}`);
  }

  return {
    telegramToken,
    donoId,
    anthropicApiKey,
    modelo: env.CLAUDE_MODELO?.trim() || "claude-sonnet-5-5",
    esforco,
    supabaseUrl,
    supabaseChave,
    fuso: env.FUSO?.trim() || "America/Sao_Paulo",
  };
}
