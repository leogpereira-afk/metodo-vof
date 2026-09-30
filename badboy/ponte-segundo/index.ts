// donboy-ponte: Edge Function do SEGUNDO projeto Supabase. O Don Boy mora no
// projeto principal; por aqui ele só LÊ os sistemas deste projeto.
//
// POST com o header x-donboy-token e o corpo:
//   { "acao": "consultar", "sql": "select ..." }  → até 200 linhas em JSON
//   { "acao": "novidades", "horas": 24 }          → o que mudou na janela
//
// O token é conferido pelo hash (sha-256) guardado em public.donboy_ponte; o
// token em si fica só no Vault do projeto principal. As consultas rodam como
// donboy_leitor (só SELECT, sem senhas e tokens) e por GET, que o PostgREST
// executa em transação somente leitura (migração migrations-segundo/0001).

import { createClient } from "npm:@supabase/supabase-js@2.117.2";

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

  let corpo: { acao?: unknown; sql?: unknown; horas?: unknown };
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

  return json({ erro: "ação desconhecida" }, 400);
});
