// donboy-ponte: Edge Function do SEGUNDO projeto Supabase. O Don Boy mora no
// projeto principal; por aqui ele LÊ os sistemas deste projeto e, depois do
// botão de confirmação do dono, envia e-mail e pede material ao Compras.
//
// POST com o header x-donboy-token e o corpo:
//   { "acao": "consultar", "sql": "select ..." }  → até 200 linhas em JSON
//   { "acao": "novidades", "horas": 24 }          → o que mudou na janela
//   { "acao": "agenda", "de": "AAAA-MM-DD", "ate": "AAAA-MM-DD" } → eventos
//   { "acao": "gmail_buscar", "consulta": "...", "quantos": 10 } → e-mails
//   { "acao": "gmail_ler", "id": "..." }          → um e-mail inteiro
//   { "acao": "gmail_enviar", "email": { para, cc, assunto, corpo, responderA } }
//   { "acao": "agenda_lembrete", "lembrete": { titulo, data, hora, duracaoMin, nota } }
//   { "acao": "mubisys", "tipo": "os|orcamento|cliente|fornecedor", "chave": "..." } → ERP ao vivo, só leitura
//   { "acao": "compras_solicitar", "solicitacao": { itens, setor, urgencia, ... } } → SC no módulo Compras
// Agenda e Gmail pela conexão Google da Central (google.ts). O envio só é
// pedido depois do toque do dono no botão "Enviar" do Telegram.
//
// O token é conferido pelo hash (sha-256) guardado em public.donboy_ponte; o
// token em si fica só no Vault do projeto principal. As consultas rodam como
// donboy_leitor (só SELECT, sem senhas e tokens) e por GET, que o PostgREST
// executa em transação somente leitura (migração migrations-segundo/0001).

import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { agenda, criarLembrete, gmailBuscar, gmailEnviar, gmailLer } from "./google.ts";
import { consultarMubisys, solicitarCompra, type SolicitacaoCompra } from "./mubisys.ts";

function chaveSecreta(): string {
  try {
    const chave = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default;
    if (chave) return chave;
  } catch {
    // formato inesperado: cai para a chave legada
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", chaveSecreta(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function sha256(texto: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405);

  const token = req.headers.get("x-donboy-token") ?? "";
  if (token.length < 32) return json({ erro: "não autorizado" }, 401);
  const { data: acesso, error: erroAcesso } = await db
    .from("donboy_ponte")
    .select("hash")
    .eq("hash", await sha256(token))
    .maybeSingle();
  if (erroAcesso) return json({ erro: "falha ao conferir o acesso" }, 500);
  if (!acesso) return json({ erro: "não autorizado" }, 401);

  let corpo: {
    acao?: unknown; sql?: unknown; horas?: unknown; de?: unknown; ate?: unknown; consulta?: unknown; quantos?: unknown;
    id?: unknown; email?: unknown; lembrete?: unknown; tipo?: unknown; chave?: unknown; solicitacao?: unknown;
  };
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "JSON inválido" }, 400);
  }

  if (corpo.acao === "consultar") {
    if (typeof corpo.sql !== "string" || !corpo.sql.trim()) return json({ erro: "informe o sql" }, 400);
    const { data, error } = await db.rpc("badboy_consultar", { p_sql: corpo.sql }, { get: true });
    return error ? json({ erro: error.message }, 400) : json({ dados: data });
  }

  if (corpo.acao === "novidades") {
    const horas = Math.min(Math.max(Math.trunc(Number(corpo.horas) || 24), 1), 720);
    const { data, error } = await db.rpc("badboy_novidades", { p_horas: horas }, { get: true });
    return error ? json({ erro: error.message }, 400) : json({ dados: data });
  }

  if (corpo.acao === "mubisys" || corpo.acao === "compras_solicitar") {
    try {
      if (corpo.acao === "mubisys") return json({ dados: await consultarMubisys(String(corpo.tipo ?? ""), String(corpo.chave ?? "")) });
      return json({ dados: await solicitarCompra((corpo.solicitacao ?? {}) as SolicitacaoCompra) });
    } catch (e) {
      return json({ erro: (e as Error).message }, 502);
    }
  }

  const acoesGoogle = ["agenda", "agenda_lembrete", "gmail_buscar", "gmail_ler", "gmail_enviar"];
  if (acoesGoogle.includes(String(corpo.acao))) {
    try {
      if (corpo.acao === "agenda_lembrete") return json({ dados: await criarLembrete(db, corpo.lembrete) });
      if (corpo.acao === "agenda") return json({ dados: await agenda(db, String(corpo.de ?? ""), String(corpo.ate ?? "")) });
      if (corpo.acao === "gmail_enviar") return json({ dados: await gmailEnviar(db, corpo.email) });
      if (corpo.acao === "gmail_buscar") {
        return json({ dados: await gmailBuscar(db, String(corpo.consulta ?? ""), Number(corpo.quantos)) });
      }
      return json({ dados: await gmailLer(db, String(corpo.id ?? "")) });
    } catch (e) {
      return json({ erro: (e as Error).message }, 502);
    }
  }

  return json({ erro: "ação desconhecida" }, 400);
});
