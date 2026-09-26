// Testes da porta de dados vof-sync, sem rede e sem banco.
// Duas camadas: as regras puras (regras.mjs) e o handler inteiro (index.ts)
// rodando num contexto isolado com um Supabase de mentira.
// Rodar: node --test tests/   (Node 20 ou mais novo)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createHmac } from "node:crypto";
import * as regras from "../supabase/functions/vof-sync/regras.mjs";

const {
  lerCracha, ehMaquina, autorizar, precisaConfirmarAdmin, papelAtual, validarRegistro, caminhoArquivo, idValido, colValida,
  cursorValido, respostaDeErro, falhaDeGravacao, falhaDeArquivo, Falha, COLECOES, MIN_TOKEN_MAQUINA,
} = regras;

const SEGREDO = "segredo-ficticio-exclusivo-dos-testes-vof";
const MAQUINA = "m".repeat(MIN_TOKEN_MAQUINA) + "-ficticia";
const agora = () => Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

function jwt(payload = {}, { segredo = SEGREDO, cabecalho = { alg: "HS256", typ: "JWT" } } = {}) {
  const h = b64(cabecalho);
  const d = b64({ sis: "vof", sub: "facilitadora.teste", nome: "Facilitadora Teste", papel: "facilitador", iat: agora(), exp: agora() + 600, ...payload });
  return `${h}.${d}.${createHmac("sha256", segredo).update(`${h}.${d}`).digest("base64url")}`;
}

// --------------------------------------------------------------------------
// 1. Crachá: as quatro conferências
// --------------------------------------------------------------------------
test("crachá válido do V.O.F. é aceito e devolve o conteúdo", async () => {
  const p = await lerCracha(jwt(), SEGREDO);
  assert.equal(p.sis, "vof");
  assert.equal(p.papel, "facilitador");
  assert.equal((await lerCracha(jwt({ papel: "admin" }), SEGREDO)).papel, "admin");
});

test("crachá de outro sistema é recusado", async () => {
  for (const sis of ["pops", "painel", "rh", "central", "", undefined]) {
    assert.equal(await lerCracha(jwt({ sis }), SEGREDO), null, `sis=${sis}`);
  }
});

test("crachá vencido é recusado", async () => {
  assert.equal(await lerCracha(jwt({ exp: agora() - 1 }), SEGREDO), null);
  assert.equal(await lerCracha(jwt({ exp: agora() }), SEGREDO), null);
  // O relógio do servidor manda: o mesmo crachá vale agora e não vale daqui a 11 minutos.
  const t = jwt();
  assert.ok(await lerCracha(t, SEGREDO));
  assert.equal(await lerCracha(t, SEGREDO, Date.now() + 11 * 60_000), null);
});

test("crachá sem validade numérica é recusado", async () => {
  for (const exp of [null, "amanhã", "9999999999", Infinity, undefined]) {
    assert.equal(await lerCracha(jwt({ exp }), SEGREDO), null, `exp=${exp}`);
  }
});

test("assinatura errada é recusada", async () => {
  assert.equal(await lerCracha(jwt({}, { segredo: "outro-segredo-qualquer" }), SEGREDO), null);
  // Trocar o papel no meio do crachá sem assinar de novo não promove ninguém.
  const [h, , s] = jwt().split(".");
  const adulterado = `${h}.${b64({ sis: "vof", sub: "facilitadora.teste", papel: "admin", exp: agora() + 600 })}.${s}`;
  assert.equal(await lerCracha(adulterado, SEGREDO), null);
});

test("algoritmo diferente de HS256 é recusado, inclusive 'none'", async () => {
  assert.equal(await lerCracha(jwt({}, { cabecalho: { alg: "none" } }), SEGREDO), null);
  assert.equal(await lerCracha(jwt({}, { cabecalho: { alg: "HS512" } }), SEGREDO), null);
  const [h, d] = jwt({}, { cabecalho: { alg: "none" } }).split(".");
  assert.equal(await lerCracha(`${h}.${d}.`, SEGREDO), null);
});

test("papel desconhecido é recusado mesmo com assinatura válida", async () => {
  for (const papel of ["equipe", "gestor", "participante", "Admin", "", null, undefined]) {
    assert.equal(await lerCracha(jwt({ papel }), SEGREDO), null, `papel=${papel}`);
  }
});

test("crachá sem usuário é recusado", async () => {
  for (const sub of ["", "   ", null, 42]) assert.equal(await lerCracha(jwt({ sub }), SEGREDO), null, `sub=${sub}`);
});

test("sem segredo no servidor nenhum crachá entra", async () => {
  assert.equal(await lerCracha(jwt(), ""), null);
  assert.equal(await lerCracha(jwt(), undefined), null);
});

test("crachá malformado é recusado sem estourar", async () => {
  for (const t of ["", "abc", "a.b", "a.b.c.d", "x.y.z", "@@.##.$$", null, 123]) {
    assert.equal(await lerCracha(t, SEGREDO), null, String(t));
  }
});

// --------------------------------------------------------------------------
// 2. x-token de máquina
// --------------------------------------------------------------------------
test("x-token só vale se igual ao segredo", () => {
  assert.equal(ehMaquina(MAQUINA, MAQUINA), true);
  assert.equal(ehMaquina(MAQUINA.slice(0, -1) + "X", MAQUINA), false);
  assert.equal(ehMaquina(MAQUINA + "x", MAQUINA), false);
  assert.equal(ehMaquina(MAQUINA.slice(0, -1), MAQUINA), false);
});

test("x-token não vale vazio, de nenhum dos lados", () => {
  assert.equal(ehMaquina("", ""), false);
  assert.equal(ehMaquina(null, ""), false);
  assert.equal(ehMaquina(undefined, undefined), false);
  assert.equal(ehMaquina("", MAQUINA), false);
  assert.equal(ehMaquina(null, MAQUINA), false);
  assert.equal(ehMaquina("qualquer-coisa", ""), false);
});

test("segredo de máquina curto demais não vale", () => {
  const curto = "x".repeat(MIN_TOKEN_MAQUINA - 1);
  assert.equal(ehMaquina(curto, curto), false);
});

// --------------------------------------------------------------------------
// 3. Quem pode o quê
// --------------------------------------------------------------------------
const nega = (f) => assert.throws(f, (e) => e instanceof Falha && e.status === 403);

test("facilitador não grava conteudo (complemento APN)", () => {
  nega(() => autorizar({ acao: "upsert", colecao: "conteudo", papel: "facilitador" }));
});

test("facilitador grava turmas, empresas, diagnósticos, planos e salas", () => {
  for (const colecao of ["turmas", "empresas", "diagnosticos", "planos", "salas"]) {
    assert.doesNotThrow(() => autorizar({ acao: "upsert", colecao, papel: "facilitador" }), colecao);
  }
});

test("facilitador não apaga nem restaura, em coleção nenhuma", () => {
  for (const colecao of COLECOES) {
    nega(() => autorizar({ acao: "delete", colecao, papel: "facilitador" }));
    nega(() => autorizar({ acao: "restore", colecao, papel: "facilitador" }));
  }
});

test("facilitador não muda a configuração nem exporta tudo", () => {
  nega(() => autorizar({ acao: "setCfg", papel: "facilitador" }));
  nega(() => autorizar({ acao: "list", papel: "facilitador" }));
  nega(() => autorizar({ acao: "list", colecao: null, papel: "facilitador" }));
});

test("facilitador lê tudo, inclusive o conteúdo, e pede a apostila", () => {
  for (const acao of ["ping", "rev", "getCfg", "urlArquivo", "saude"]) autorizar({ acao, papel: "facilitador" });
  for (const colecao of COLECOES) {
    autorizar({ acao: "list", colecao, papel: "facilitador" });
    autorizar({ acao: "get", colecao, papel: "facilitador" });
  }
});

test("ação nova que ninguém listou fica negada ao facilitador", () => {
  for (const acao of ["putFoto", "sincronizar", "apagarTudo", "", "constructor"]) {
    nega(() => autorizar({ acao, colecao: "turmas", papel: "facilitador" }));
  }
});

test("admin apaga, restaura, configura e exporta", () => {
  for (const acao of ["delete", "restore", "upsert"]) {
    for (const colecao of COLECOES) autorizar({ acao, colecao, papel: "admin" });
  }
  autorizar({ acao: "setCfg", papel: "admin" });
  autorizar({ acao: "list", papel: "admin" });
});

test("só o que é exclusivo do admin é confirmado no banco; a máquina não", () => {
  const exclusivas = [
    { acao: "delete", colecao: "turmas" }, { acao: "restore", colecao: "turmas" }, { acao: "setCfg" },
    { acao: "list" }, { acao: "list", colecao: null }, { acao: "upsert", colecao: "conteudo" }, { acao: "inventada" },
  ];
  for (const q of exclusivas) assert.equal(precisaConfirmarAdmin({ ...q, papel: "admin" }), true, JSON.stringify(q));
  for (const q of exclusivas) assert.equal(precisaConfirmarAdmin({ ...q, maquina: true }), false, "máquina " + JSON.stringify(q));
  // O que o facilitador também pode não depende do banco: o admin não fica preso se a consulta cair.
  for (const acao of ["ping", "rev", "get", "getCfg", "urlArquivo", "saude"]) assert.equal(precisaConfirmarAdmin({ acao, colecao: "turmas", papel: "admin" }), false, acao);
  assert.equal(precisaConfirmarAdmin({ acao: "upsert", colecao: "turmas", papel: "admin" }), false);
  assert.equal(precisaConfirmarAdmin({ acao: "list", colecao: "turmas", papel: "admin" }), false);
  assert.equal(precisaConfirmarAdmin({ acao: "delete", colecao: "turmas", papel: "facilitador" }), false, "o facilitador já foi negado antes");
});

test("papel atual: a conta do sistema manda; sem ela, o quadro único; desativado não é papel", () => {
  assert.equal(papelAtual({ conta: { papel: "admin", ativo: true } }), "admin");
  assert.equal(papelAtual({ conta: { papel: "facilitador", ativo: true }, papelUnico: { papel: "admin", ativo: true } }), "facilitador");
  assert.equal(papelAtual({ conta: { papel: "admin", ativo: false } }), null);
  assert.equal(papelAtual({ papelUnico: { papel: "admin", ativo: true } }), "admin");
  assert.equal(papelAtual({ papelUnico: { papel: "admin", ativo: false } }), null);
  assert.equal(papelAtual({}), null);
  assert.equal(papelAtual(), null);
});

test("máquina (backup) pode tudo; papel desconhecido não pode nada", () => {
  autorizar({ acao: "delete", colecao: "turmas", maquina: true });
  autorizar({ acao: "list", maquina: true });
  for (const papel of ["equipe", "gestor", null, undefined, ""]) nega(() => autorizar({ acao: "ping", papel }));
});

// --------------------------------------------------------------------------
// 4. Validações
// --------------------------------------------------------------------------
const recusa = (f, re) => assert.throws(f, (e) => e instanceof Falha && e.status === 400 && (!re || re.test(e.message)));

test("identificador e coleção fora da lista são recusados", () => {
  assert.equal(idValido("turma-01"), "turma-01");
  for (const id of ["", "a b", "a/b", "../x", "x".repeat(161), 12, null, "a,b", "a(b)"]) recusa(() => idValido(id));
  for (const c of COLECOES) assert.equal(colValida(c), c);
  for (const c of ["pessoas", "registros", "pops", "", null, "__proto__"]) recusa(() => colValida(c));
});

test("a lista de coleções da vof_gravar é a mesma de regras.mjs", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/0001_init.sql", import.meta.url), "utf8");
  const m = sql.match(/p_colecao not in \(([^)]*)\)/);
  assert.ok(m, "não achei a lista de coleções na vof_gravar");
  const doBanco = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(doBanco, [...COLECOES].sort());
});

test("apostila: só nome da lista fechada vira caminho no bucket", () => {
  assert.equal(caminhoArquivo("apostila"), "apostila/Metodo_VOF_Apostila_Completa.pdf");
  for (const nome of ["../segredo", "apostila/../../x", "constructor", "__proto__", "toString", "", null, "APOSTILA"]) {
    recusa(() => caminhoArquivo(nome));
  }
});

test("turma: participantes é só a quantidade, nunca nomes", () => {
  const base = { id: "t1", nome: "Turma Ficticia", nivel: 1 };
  recusa(() => validarRegistro("turmas", { ...base, participantes: ["Fulano Ficticio", "Beltrana Ficticia"] }, { sub: "f" }), /Nomes não são guardados/);
  recusa(() => validarRegistro("turmas", { ...base, participantes: "Fulano, Beltrana" }, { sub: "f" }));
  recusa(() => validarRegistro("turmas", { ...base, participantes: -1 }, { sub: "f" }));
  assert.equal(validarRegistro("turmas", { ...base, participantes: "12" }, { sub: "f" }).participantes, 12);
  assert.equal(validarRegistro("turmas", { ...base, participantes: 0 }, { sub: "f" }).participantes, 0);
});

test("turma: nível, situação e data seguem o combinado", () => {
  const base = { id: "t1" };
  recusa(() => validarRegistro("turmas", { ...base, nivel: 3 }, { sub: "f" }));
  assert.equal(validarRegistro("turmas", { ...base, nivel: "2" }, { sub: "f" }).nivel, 2);
  assert.equal(validarRegistro("turmas", { ...base, status: "concluida" }, { sub: "f" }).status, "concluída");
  assert.equal(validarRegistro("turmas", { ...base, status: "Em Andamento" }, { sub: "f" }).status, "em andamento");
  recusa(() => validarRegistro("turmas", { ...base, status: "cancelada" }, { sub: "f" }));
  recusa(() => validarRegistro("turmas", { ...base, inicio: "25/09/2026" }, { sub: "f" }));
  recusa(() => validarRegistro("turmas", { ...base, inicio: "2026-02-30" }, { sub: "f" }));
  recusa(() => validarRegistro("turmas", { ...base, inicio: "2026-13-01" }, { sub: "f" }));
  assert.equal(validarRegistro("turmas", { ...base, inicio: "2028-02-29" }, { sub: "f" }).inicio, "2028-02-29");
  assert.equal(validarRegistro("turmas", { ...base, inicio: "2026-09-25" }, { sub: "f" }).inicio, "2026-09-25");
});

test("diagnóstico: nota fora de 0 a 4 ou prática desconhecida são recusadas", () => {
  const base = { id: "d1", alvoTipo: "turma", alvoId: "t1", momento: "linha_de_base" };
  recusa(() => validarRegistro("diagnosticos", { ...base, notas: { v1: { nota: 5 } } }, { sub: "f" }), /0 a 4/);
  recusa(() => validarRegistro("diagnosticos", { ...base, notas: { v1: { nota: -1 } } }, { sub: "f" }));
  recusa(() => validarRegistro("diagnosticos", { ...base, notas: { v1: { nota: 2.5 } } }, { sub: "f" }));
  recusa(() => validarRegistro("diagnosticos", { ...base, notas: { x9: { nota: 2 } } }, { sub: "f" }), /Prática desconhecida/);
  recusa(() => validarRegistro("diagnosticos", { ...base, notas: { v6: 2 } }, { sub: "f" }));
  recusa(() => validarRegistro("diagnosticos", { ...base, momento: "dia_45" }, { sub: "f" }));
  recusa(() => validarRegistro("diagnosticos", { ...base, alvoTipo: "pessoa" }, { sub: "f" }));
  const ok = validarRegistro("diagnosticos", {
    ...base, notas: { v1: { nota: "3", evidencia: "Relatório semanal" }, o2: { nota: null }, g5: 4, p1: { nota: 0 } },
  }, { sub: "f" });
  assert.equal(ok.notas.v1.nota, 3);
  assert.equal(ok.notas.v1.evidencia, "Relatório semanal");
  assert.equal(ok.notas.o2.nota, null);
  assert.equal(ok.notas.g5, 4);
  assert.equal(ok.notas.p1.nota, 0);
});

test("diagnóstico: N/A entra como \"na\", solto ou em {nota, evidencia}; outras grafias são recusadas (caderno p. 31)", () => {
  const base = { id: "d1", alvoTipo: "turma", alvoId: "t1", momento: "linha_de_base" };
  const ok = validarRegistro("diagnosticos", {
    ...base, notas: { v1: "na", v2: { nota: "na", evidencia: "A empresa não vende a prazo" }, v3: 2 },
  }, { sub: "f" });
  assert.equal(ok.notas.v1, "na");
  assert.deepEqual(ok.notas.v2, { nota: "na", evidencia: "A empresa não vende a prazo" });
  assert.equal(ok.notas.v3, 2);
  for (const ruim of ["NA ", "n/a", "x", "NA", "N/A", " na", "na ", "nd"]) {
    recusa(() => validarRegistro("diagnosticos", { ...base, notas: { v1: ruim } }, { sub: "f" }), /0 a 4/);
    recusa(() => validarRegistro("diagnosticos", { ...base, notas: { v1: { nota: ruim, evidencia: "x" } } }, { sub: "f" }), /0 a 4/);
  }
});

test("plano: fase do marco segue as quatro fases do ciclo de 90 dias", () => {
  const base = { id: "p1", turmaId: "t1" };
  assert.equal(validarRegistro("planos", { ...base, marcos: [{ fase: "ate dia 30", acao: "x", feito: false }] }, { sub: "f" }).marcos[0].fase, "Até dia 30");
  recusa(() => validarRegistro("planos", { ...base, marcos: [{ fase: "Dia 120" }] }, { sub: "f" }));
  recusa(() => validarRegistro("planos", { ...base, marcos: "fazer tudo" }, { sub: "f" }));
  recusa(() => validarRegistro("planos", { ...base, marcos: [{ feito: "sim" }] }, { sub: "f" }));
  recusa(() => validarRegistro("planos", { ...base, checklist: ["a"] }, { sub: "f" }));
});

test("sala: código curto, slide inteiro e modo conhecido", () => {
  assert.equal(validarRegistro("salas", { id: "AB12", slide: "7", modo: "aplicar" }, { sub: "f" }).slide, 7);
  recusa(() => validarRegistro("salas", { id: "ab", slide: 1 }, { sub: "f" }));
  recusa(() => validarRegistro("salas", { id: "sala.com.ponto", slide: 1 }, { sub: "f" }));
  recusa(() => validarRegistro("salas", { id: "AB12", slide: -3 }, { sub: "f" }));
  recusa(() => validarRegistro("salas", { id: "AB12", modo: "gravar" }, { sub: "f" }));
  recusa(() => validarRegistro("salas", { id: "AB12", slide: 1, lixo: "x".repeat(5000) }, { sub: "f" }), /muito grande/);
});

test("conteúdo: só os quatro documentos do complemento", () => {
  for (const id of ["dinamicas", "insights", "modulos", "checklist"]) validarRegistro("conteudo", { id }, { sub: "leo" });
  recusa(() => validarRegistro("conteudo", { id: "apostila" }, { sub: "leo" }));
});

test("registro grande demais, sem id ou que não é objeto é recusado", () => {
  recusa(() => validarRegistro("empresas", { id: "e1", obs: "x".repeat(600_000) }, { sub: "f" }), /muito grande/);
  recusa(() => validarRegistro("empresas", { nome: "Sem id" }, { sub: "f" }));
  recusa(() => validarRegistro("empresas", [{ id: "e1" }], { sub: "f" }));
  recusa(() => validarRegistro("empresas", null, { sub: "f" }));
});

test("autoria vem do crachá, não do formulário; a máquina preserva a original", () => {
  const enviado = { id: "e1", nome: "Empresa Ficticia", atualizadoPor: "outra.pessoa" };
  assert.equal(validarRegistro("empresas", enviado, { sub: "facilitadora.teste" }).atualizadoPor, "facilitadora.teste");
  assert.equal(validarRegistro("empresas", enviado, { maquina: true }).atualizadoPor, "outra.pessoa");
  assert.equal(enviado.atualizadoPor, "outra.pessoa", "o objeto recebido não é alterado");
});

test("cursor aceita a dupla data/id e recusa lixo", () => {
  assert.equal(cursorValido(undefined), null);
  assert.deepEqual(cursorValido({ em: "2026-09-01T00:00:00+00:00", id: "t1" }), { em: "2026-09-01T00:00:00+00:00", id: "t1" });
  assert.deepEqual(cursorValido("2026-09-01T00:00:00.5Z"), { em: "2026-09-01T00:00:00.5Z", id: null });
  for (const c of [{ em: "ontem", id: "t1" }, { em: "2026-09-01T00:00:00Z", id: "a,b" }, "2026-09-01", 5]) {
    recusa(() => cursorValido(c));
  }
});

test("respostas de erro: 401 pede login, 403 diz sem permissão, 500 não vaza a causa", () => {
  assert.deepEqual(respostaDeErro(new Falha("Entre no sistema.", 401)), { status: 401, corpo: { erro: "Entre no sistema.", semSessao: true } });
  assert.deepEqual(respostaDeErro(new Falha("Não.", 403)).corpo.semPermissao, true);
  const r = respostaDeErro(new TypeError("Cannot read properties of undefined (reading 'service_role')"));
  assert.equal(r.status, 500);
  assert.equal(r.corpo.erro, "Falha interna.");
});

test("erros do banco e do bucket viram mensagem que a pessoa entende", () => {
  assert.equal(falhaDeGravacao({ code: "40001", message: "Item arquivado" }).status, 409);
  assert.match(falhaDeGravacao({ code: "40001", message: "Item arquivado" }).message, /arquivado/);
  assert.match(falhaDeGravacao({ code: "40001", message: "Registro alterado por outra pessoa" }).message, /Outra pessoa/);
  assert.equal(falhaDeGravacao({ code: "XX000", message: "disco cheio" }).status, 500);
  assert.equal(falhaDeArquivo({ message: "Object not found", statusCode: "404" }).status, 404);
  assert.equal(falhaDeArquivo({ message: "fetch failed" }).status, 502);
});

// --------------------------------------------------------------------------
// 5. O handler inteiro (index.ts) com um Supabase de mentira
// --------------------------------------------------------------------------
// Conta do admin no banco (equipe_contas), para as ações que só o admin faz.
const CONTA_ADMIN = { sistema: "vof", usuario: "leo.teste", papel: "admin", ativo: true };

function carregarPorta({ env = {}, revogado = false, revogacaoFalha = false, leituraFalha = false, linhas = [], semApostila = false,
  contas = [CONTA_ADMIN], pessoas = [], papeis = [], falhaEm = [] } = {}) {
  const chamadas = { rpc: [], assinaturas: [], logs: [], tabelas: [] };
  const outras = { equipe_contas: contas, acesso_conta: pessoas, acesso_papel: papeis };
  let handler;
  const sb = {
    rpc: async (nome, args) => {
      if (nome === "acesso_revogado") {
        chamadas.revogacao = args;
        return revogacaoFalha ? { data: null, error: { message: "banco fora" } } : { data: revogado, error: null };
      }
      chamadas.rpc.push({ nome, args });
      if (nome === "vof_gravar") return { data: { ok: true, revision: 2, registro: args.p_registro, apagado: args.p_acao === "delete" }, error: null };
      return { data: { ok: true, config: args.p_patch }, error: null };
    },
    from(tabela) {
      chamadas.tabelas.push(tabela);
      const filtros = [];
      let limite = Infinity, faixa = null, um = false, cabeca = false;
      const cadeia = {
        select(_c, opcoes) { cabeca = !!opcoes?.head; return cadeia; },
        eq(k, v) { filtros.push((r) => r[k] === v); return cadeia; },
        gt(k, v) { filtros.push((r) => r[k] > v); return cadeia; },
        or(expr) {
          const m = expr.match(/^atualizado_em\.gt\.([^,]+),and\(atualizado_em\.eq\.([^,]+),id\.gt\.(.+)\)$/);
          if (!m) throw new Error("cursor não reconhecido: " + expr);
          filtros.push((r) => r.atualizado_em > m[1] || (r.atualizado_em === m[2] && r.id > m[3]));
          return cadeia;
        },
        order() { return cadeia; },
        limit(n) { limite = n; return cadeia; },
        range(a, b) { faixa = [a, b]; return cadeia; },
        maybeSingle() { um = true; return cadeia; },
        then(ok, erro) {
          return Promise.resolve().then(() => {
            if (leituraFalha || falhaEm.includes(tabela)) return { data: null, error: { message: "leitura indisponível" }, count: null };
            let dados = tabela === "vof_config_global" ? [{ id: true, config: { exemplo: 1 } }]
              : tabela === "vof_meta" ? [{ chave: "rev", valor: { rev: 3, porColecao: { turmas: 3 } } }]
              : Object.prototype.hasOwnProperty.call(outras, tabela) ? outras[tabela] : linhas;
            dados = dados.filter((r) => filtros.every((f) => f(r)))
              .sort((a, b) => (a.atualizado_em ?? "").localeCompare(b.atualizado_em ?? "") || String(a.id).localeCompare(String(b.id)));
            const count = dados.length;
            if (faixa) dados = dados.slice(faixa[0], faixa[1] + 1);
            dados = dados.slice(0, limite);
            return { data: cabeca ? null : um ? dados[0] ?? null : dados, error: null, count };
          }).then(ok, erro);
        },
      };
      return cadeia;
    },
    storage: {
      from(bucket) {
        return {
          async createSignedUrl(caminho, segundos) {
            chamadas.assinaturas.push({ bucket, caminho, segundos });
            if (semApostila) return { data: null, error: { message: "Object not found", statusCode: "404" } };
            return { data: { signedUrl: `https://exemplo.test/assinado/${caminho}?token=ficticio` }, error: null };
          },
          async list() {
            return { data: semApostila ? [] : [{ name: "Metodo_VOF_Apostila_Completa.pdf" }], error: null };
          },
        };
      },
    },
  };
  const fonte = fs.readFileSync(new URL("../supabase/functions/vof-sync/index.ts", import.meta.url), "utf8");
  const semSupabase = fonte.replace(/^import \{ createClient \} from "https:\/\/esm\.sh\/@supabase\/supabase-js@[^"]+";$/m, "const createClient = () => __sb;");
  assert.notEqual(semSupabase, fonte, "o import do supabase-js mudou de forma; ajuste o teste");
  const js = semSupabase.replace(/^import \{([^}]*)\} from "\.\/regras\.mjs";$/m, "const {$1} = __regras;");
  assert.notEqual(js, semSupabase, "o import de regras.mjs mudou de forma; ajuste o teste");
  assert.ok(!/^\s*import\s/m.test(js), "sobrou import que o teste não sabe trocar");
  const ambiente = { SUPABASE_URL: "http://exemplo.test", SUPABASE_SERVICE_ROLE_KEY: "chave-ficticia", EQUIPE_JWT_SECRET: SEGREDO, VOF_TOKEN: MAQUINA, ...env };
  const ctx = vm.createContext({
    __sb: sb, __regras: regras,
    Deno: { env: { get: (k) => ambiente[k] }, serve: (fn) => { handler = fn; } },
    crypto: globalThis.crypto, TextEncoder, TextDecoder, atob, btoa, Request, Response,
    console: { error: (...a) => chamadas.logs.push(a.join(" ")) },
  });
  vm.runInContext(js, ctx);
  assert.equal(typeof handler, "function", "o index.ts não registrou o Deno.serve");

  async function chamar(corpo, { payload = {}, cracha = true, xToken, metodo = "POST", token } = {}) {
    const headers = { "content-type": "application/json" };
    if (cracha) headers.authorization = "Bearer " + (token ?? jwt(payload));
    if (xToken !== undefined) headers["x-token"] = xToken;
    const r = await handler(new Request("http://local.test", { method: metodo, headers, ...(metodo === "POST" ? { body: JSON.stringify(corpo) } : {}) }));
    return { status: r.status, corpo: await r.json() };
  }
  const gravacoes = () => chamadas.rpc.filter((c) => c.nome === "vof_gravar");
  return { chamar, chamadas, gravacoes };
}

const ADMIN = { papel: "admin", sub: "leo.teste" };

test("porta: sem credencial é 401 com semSessao", async () => {
  const p = carregarPorta();
  const r = await p.chamar({ action: "ping" }, { cracha: false });
  assert.equal(r.status, 401);
  assert.equal(r.corpo.semSessao, true);
});

test("porta: crachá do próprio sistema abre, de outro sistema não (a prova do padrão)", async () => {
  const p = carregarPorta();
  assert.equal((await p.chamar({ action: "ping" })).status, 200);
  assert.equal((await p.chamar({ action: "ping" }, { payload: { sis: "pops" } })).status, 401);
  assert.equal((await p.chamar({ action: "ping" }, { payload: { papel: "equipe" } })).status, 401);
  assert.equal((await p.chamar({ action: "ping" }, { token: jwt({}, { segredo: "outro" }) })).status, 401);
});

test("porta: acesso revogado fecha mesmo com crachá válido; consulta fora do ar não libera", async () => {
  const revogado = carregarPorta({ revogado: true });
  assert.equal((await revogado.chamar({ action: "ping" })).status, 401);
  assert.equal(revogado.chamadas.revogacao.p_sistema, "vof");
  assert.equal(revogado.chamadas.revogacao.p_papel, "facilitador");
  const fora = carregarPorta({ revogacaoFalha: true });
  const r = await fora.chamar({ action: "upsert", colecao: "turmas", registro: { id: "t1" } });
  assert.equal(r.status, 503);
  assert.equal(fora.gravacoes().length, 0);
});

test("porta: facilitador não grava conteudo e nada chega ao banco", async () => {
  const p = carregarPorta();
  const r = await p.chamar({ action: "upsert", colecao: "conteudo", registro: { id: "dinamicas", itens: [] } });
  assert.equal(r.status, 403);
  assert.equal(r.corpo.semPermissao, true);
  assert.equal(p.gravacoes().length, 0);
});

test("porta: facilitador não apaga nem restaura", async () => {
  const p = carregarPorta();
  for (const action of ["delete", "restore"]) {
    const r = await p.chamar({ action, colecao: "turmas", id: "t1" });
    assert.equal(r.status, 403, action);
  }
  assert.equal(p.gravacoes().length, 0);
});

test("porta: facilitador não muda configuração nem exporta tudo", async () => {
  const p = carregarPorta();
  assert.equal((await p.chamar({ action: "setCfg", config: { a: 1 } })).status, 403);
  assert.equal((await p.chamar({ action: "list" })).status, 403);
  assert.equal(p.chamadas.rpc.length, 0);
});

test("porta: facilitador grava turma com autoria do crachá e participantes como número", async () => {
  const p = carregarPorta();
  const r = await p.chamar({ action: "upsert", colecao: "turmas", registro: { id: "t1", nome: "Turma Ficticia", participantes: "18", atualizadoPor: "outra.pessoa" } });
  assert.equal(r.status, 200);
  const [g] = p.gravacoes();
  assert.equal(g.args.p_acao, "upsert");
  assert.equal(g.args.p_registro.atualizadoPor, "facilitadora.teste");
  assert.equal(g.args.p_registro.participantes, 18);
  assert.equal(g.args.p_expected, 0, "item novo espera revisão 0");
});

test("porta: diagnóstico com N/A chega ao banco como \"na\"", async () => {
  const p = carregarPorta();
  const r = await p.chamar({ action: "upsert", colecao: "diagnosticos", registro: {
    id: "d-na", alvoTipo: "empresa", alvoId: "e1", momento: "linha_de_base",
    notas: { v1: { nota: "na", evidencia: "Sem venda a prazo" }, v2: "na", v3: 3 },
  } });
  assert.equal(r.status, 200);
  const notas = p.gravacoes()[0].args.p_registro.notas;
  assert.deepEqual(notas.v1, { nota: "na", evidencia: "Sem venda a prazo" });
  assert.equal(notas.v2, "na");
  const ruim = await p.chamar({ action: "upsert", colecao: "diagnosticos", registro: { id: "d-x", notas: { v1: "n/a" } } });
  assert.equal(ruim.status, 400);
  assert.equal(p.gravacoes().length, 1, "grafia recusada não chega ao banco");
});

test("porta: turma com nomes de participantes é recusada antes do banco", async () => {
  const p = carregarPorta();
  const r = await p.chamar({ action: "upsert", colecao: "turmas", registro: { id: "t1", participantes: ["Fulano Ficticio"] } });
  assert.equal(r.status, 400);
  assert.equal(p.gravacoes().length, 0);
});

test("porta: admin apaga e restaura", async () => {
  const linhas = [{ colecao: "turmas", id: "t1", registro: { id: "t1" }, apagado: false, revision: 4, atualizado_em: "2026-09-01T00:00:00+00:00" }];
  const p = carregarPorta({ linhas });
  const r = await p.chamar({ action: "delete", colecao: "turmas", id: "t1" }, { payload: ADMIN });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.apagado, true);
  assert.equal(p.gravacoes()[0].args.p_acao, "delete");
  assert.equal(p.gravacoes()[0].args.p_expected, 4);
  assert.equal((await p.chamar({ action: "restore", colecao: "turmas", id: "t1" }, { payload: ADMIN })).status, 200);
});

test("porta: admin grava o conteúdo do complemento", async () => {
  const p = carregarPorta();
  assert.equal((await p.chamar({ action: "upsert", colecao: "conteudo", registro: { id: "insights", itens: [] } }, { payload: ADMIN })).status, 200);
  assert.equal(p.gravacoes()[0].args.p_registro.atualizadoPor, "leo.teste");
});

test("porta: x-token certo entra sem crachá; errado ou vazio não", async () => {
  const p = carregarPorta();
  const ok = await p.chamar({ action: "delete", colecao: "turmas", id: "t1" }, { cracha: false, xToken: MAQUINA });
  assert.equal(ok.status, 200);
  const errado = await p.chamar({ action: "ping" }, { cracha: false, xToken: MAQUINA.slice(0, -1) + "Z" });
  assert.equal(errado.status, 401);
  assert.match(errado.corpo.erro, /máquina/);
  assert.equal((await p.chamar({ action: "ping" }, { cracha: false, xToken: "" })).status, 401);
  // Servidor sem VOF_TOKEN: nenhum x-token entra, nem o vazio.
  const semSegredo = carregarPorta({ env: { VOF_TOKEN: "" } });
  assert.equal((await semSegredo.chamar({ action: "ping" }, { cracha: false, xToken: "" })).status, 401);
  assert.equal((await semSegredo.chamar({ action: "ping" }, { cracha: false, xToken: MAQUINA })).status, 401);
});

test("porta: segredo ausente ou curto grita no log", () => {
  assert.ok(carregarPorta({ env: { EQUIPE_JWT_SECRET: "" } }).chamadas.logs.some((l) => /EQUIPE_JWT_SECRET ausente/.test(l)));
  assert.ok(carregarPorta({ env: { VOF_TOKEN: "curto" } }).chamadas.logs.some((l) => /VOF_TOKEN/.test(l)));
});

test("porta: apostila sai por URL assinada de 10 minutos do bucket privado", async () => {
  const p = carregarPorta();
  const r = await p.chamar({ action: "urlArquivo", nome: "apostila" });
  assert.equal(r.status, 200);
  assert.match(r.corpo.url, /^https:\/\//);
  assert.ok(Date.parse(r.corpo.expira) > Date.now());
  assert.deepEqual(p.chamadas.assinaturas, [{ bucket: "vof-arquivos", caminho: "apostila/Metodo_VOF_Apostila_Completa.pdf", segundos: 600 }]);
});

test("porta: nome de arquivo fora da lista não chega ao bucket; arquivo ausente é 404", async () => {
  const p = carregarPorta();
  assert.equal((await p.chamar({ action: "urlArquivo", nome: "../vof-arquivos/outro.pdf" })).status, 400);
  assert.equal(p.chamadas.assinaturas.length, 0);
  const sem = carregarPorta({ semApostila: true });
  assert.equal((await sem.chamar({ action: "urlArquivo", nome: "apostila" })).status, 404);
  assert.equal((await sem.chamar({ action: "saude" })).corpo.apostila, false);
});

test("porta: falha de leitura não aparece como lista vazia ou saúde normal", async () => {
  for (const action of ["get", "list", "getCfg", "rev", "saude"]) {
    const r = await carregarPorta({ leituraFalha: true }).chamar({ action, colecao: "turmas", id: "t1" });
    assert.equal(r.status, 500, action);
  }
});

test("porta: página seguinte inclui registros com a mesma data de atualização", async () => {
  const linhas = Array.from({ length: 7 }, (_, i) => ({ colecao: "salas", id: "S" + String(i).padStart(3, "0"), registro: { id: "S" + i }, apagado: false, revision: 1, atualizado_em: "2026-09-01T00:00:00+00:00" }));
  const p = carregarPorta({ linhas });
  const a = await p.chamar({ action: "list", colecao: "salas", limite: 5 });
  const b = await p.chamar({ action: "list", colecao: "salas", limite: 5, desde: a.corpo.proximo });
  assert.equal(a.corpo.itens.length + b.corpo.itens.length, 7);
  assert.equal(b.corpo.proximo, null);
});

test("porta: arquivado some do get, mas vem marcado no list para a tela tirar", async () => {
  const linhas = [{ colecao: "empresas", id: "e1", registro: { id: "e1" }, apagado: true, revision: 3, atualizado_em: "2026-09-01T00:00:00+00:00" }];
  const p = carregarPorta({ linhas });
  assert.deepEqual((await p.chamar({ action: "get", colecao: "empresas", id: "e1" })).corpo, { registro: null, revision: 3 });
  assert.equal((await p.chamar({ action: "list", colecao: "empresas" })).corpo.itens[0].apagado, true);
});

test("porta: a lista não devolve ao facilitador o conteúdo do que foi arquivado; admin e máquina veem", async () => {
  const linhas = [
    { colecao: "diagnosticos", id: "d1", registro: { id: "d1", obs: "Nota sigilosa ficticia" }, apagado: true, revision: 3, atualizado_em: "2026-09-01T00:00:00+00:00" },
    { colecao: "diagnosticos", id: "d2", registro: { id: "d2", obs: "Visivel" }, apagado: false, revision: 1, atualizado_em: "2026-09-02T00:00:00+00:00" },
  ];
  const p = carregarPorta({ linhas });
  const fac = (await p.chamar({ action: "list", colecao: "diagnosticos" })).corpo.itens;
  assert.deepEqual(fac.map((l) => [l.id, l.apagado, l.registro]), [["d1", true, { id: "d1" }], ["d2", false, { id: "d2", obs: "Visivel" }]]);
  assert.ok(!JSON.stringify(fac).includes("sigilosa"));
  const adm = (await p.chamar({ action: "list", colecao: "diagnosticos" }, { payload: ADMIN })).corpo.itens;
  assert.equal(adm[0].registro.obs, "Nota sigilosa ficticia");
  const maq = (await p.chamar({ action: "list", colecao: "diagnosticos" }, { cracha: false, xToken: MAQUINA })).corpo.itens;
  assert.equal(maq[0].registro.obs, "Nota sigilosa ficticia");
});

test("porta: admin rebaixado no banco não apaga nem mexe no conteúdo, mesmo com crachá de admin de 30 dias", async () => {
  const p = carregarPorta({ contas: [{ ...CONTA_ADMIN, papel: "facilitador" }] });
  for (const corpo of [
    { action: "delete", colecao: "turmas", id: "t1" },
    { action: "restore", colecao: "turmas", id: "t1" },
    { action: "setCfg", config: { a: 1 } },
    { action: "list" },
    { action: "upsert", colecao: "conteudo", registro: { id: "insights", itens: [] } },
  ]) {
    const r = await p.chamar(corpo, { payload: ADMIN });
    assert.equal(r.status, 403, corpo.action);
    assert.equal(r.corpo.semPermissao, true);
    assert.match(r.corpo.erro, /Entre de novo/);
  }
  assert.equal(p.chamadas.rpc.length, 0, "nada chegou ao banco");
  // O que o facilitador pode continua aberto para ele.
  assert.equal((await p.chamar({ action: "upsert", colecao: "turmas", registro: { id: "t1" } }, { payload: ADMIN })).status, 200);
});

test("porta: conta de admin desativada ou inexistente no banco não faz ação de admin", async () => {
  for (const contas of [[{ ...CONTA_ADMIN, ativo: false }], [], [{ ...CONTA_ADMIN, sistema: "pops" }], [{ ...CONTA_ADMIN, usuario: "outra.pessoa" }]]) {
    const p = carregarPorta({ contas });
    assert.equal((await p.chamar({ action: "delete", colecao: "turmas", id: "t1" }, { payload: ADMIN })).status, 403, JSON.stringify(contas));
    assert.equal(p.gravacoes().length, 0);
  }
});

test("porta: pela entrada única, o admin é confirmado na linha do quadro único", async () => {
  const pessoas = [{ id: "c1", usuario: "leo.teste", ativo: true }];
  const linhas = [{ colecao: "turmas", id: "t1", registro: { id: "t1" }, apagado: false, revision: 2, atualizado_em: "2026-09-01T00:00:00+00:00" }];
  const ok = carregarPorta({ contas: [], pessoas, papeis: [{ conta_id: "c1", sistema: "vof", papel: "admin", ativo: true }], linhas });
  assert.equal((await ok.chamar({ action: "delete", colecao: "turmas", id: "t1" }, { payload: ADMIN })).status, 200);
  for (const papeis of [
    [{ conta_id: "c1", sistema: "vof", papel: "facilitador", ativo: true }],
    [{ conta_id: "c1", sistema: "vof", papel: "admin", ativo: false }],
    [{ conta_id: "c1", sistema: "pops", papel: "admin", ativo: true }],
    [{ conta_id: "c9", sistema: "vof", papel: "admin", ativo: true }],
  ]) {
    const p = carregarPorta({ contas: [], pessoas, papeis, linhas });
    assert.equal((await p.chamar({ action: "delete", colecao: "turmas", id: "t1" }, { payload: ADMIN })).status, 403, JSON.stringify(papeis));
  }
  const inativa = carregarPorta({ contas: [], pessoas: [{ ...pessoas[0], ativo: false }], papeis: [{ conta_id: "c1", sistema: "vof", papel: "admin", ativo: true }], linhas });
  assert.equal((await inativa.chamar({ action: "delete", colecao: "turmas", id: "t1" }, { payload: ADMIN })).status, 403);
});

test("porta: consulta do papel fora do ar não libera ação de admin; leitura comum nem pergunta", async () => {
  for (const tabela of ["equipe_contas", "acesso_conta", "acesso_papel"]) {
    const p = carregarPorta({ contas: [], pessoas: [{ id: "c1", usuario: "leo.teste", ativo: true }], falhaEm: [tabela] });
    const r = await p.chamar({ action: "delete", colecao: "turmas", id: "t1" }, { payload: ADMIN });
    assert.equal(r.status, 503, tabela);
    assert.equal(p.gravacoes().length, 0);
    assert.ok(p.chamadas.logs.some((l) => l.includes("confirmar admin")), tabela);
  }
  const p = carregarPorta({ contas: [], falhaEm: ["equipe_contas"] });
  assert.equal((await p.chamar({ action: "list", colecao: "turmas" }, { payload: ADMIN })).status, 200);
  assert.equal((await p.chamar({ action: "upsert", colecao: "planos", registro: { id: "p1" } }, { payload: ADMIN })).status, 200);
  assert.ok(!p.chamadas.tabelas.includes("equipe_contas"), "ação comum do admin não consulta o papel");
});

test("porta: ação desconhecida, método errado e JSON quebrado", async () => {
  const p = carregarPorta();
  assert.equal((await p.chamar({ action: "inventada" }, { payload: ADMIN })).status, 400);
  assert.equal((await p.chamar(null, { metodo: "GET" })).status, 405);
  assert.equal((await p.chamar([1, 2])).status, 400);
});

test("campo de texto só aceita texto: objeto ou lista no lugar de nome é recusado na porta", () => {
  const opc = { sub: "f" };
  recusa(() => validarRegistro("turmas", { id: "t1", nome: { toString: 1 } }, opc), /nome tem de ser texto/);
  recusa(() => validarRegistro("empresas", { id: "e1", nome: "Empresa Ficticia", cidade: ["x"] }, opc), /cidade tem de ser texto/);
  recusa(() => validarRegistro("diagnosticos", { id: "d1", avaliador: { a: 1 } }, opc), /avaliador tem de ser texto/);
  recusa(() => validarRegistro("planos", { id: "p1", restricao: 5 }, opc), /restricao tem de ser texto/);
  recusa(() => validarRegistro("planos", { id: "p1", marcos: [{ id: "m1", fase: "Dia 0", acao: { x: 1 } }] }, opc), /acao tem de ser texto/);
  recusa(() => validarRegistro("planos", { id: "p1", marcos: [{ id: "m1", fase: "Dia 0", data: "30/02/2026" }] }, opc), /AAAA-MM-DD/);
  recusa(() => validarRegistro("planos", { id: "p1", checklist: { "d0-01": { feito: "sim" } } }, opc), /sim ou não/);
  recusa(() => validarRegistro("planos", { id: "p1", checklist: { "d0-01": { evidencia: ["x"] } } }, opc), /evidencia tem de ser texto/);
  recusa(() => validarRegistro("planos", { id: "p1", checklist: { "d0-01": "feito" } }, opc), /checklist inválido/i);
  const ok = validarRegistro("planos", {
    id: "plano-t1", turmaId: "t1", restricao: "Prazo de entrega", meta: "", dia0: "2026-10-01",
    marcos: [{ id: "m1", fase: "Dia 0", acao: "Medir", evidencia: "", feito: false, data: "" }],
    checklist: { "d0-01": { feito: true, data: "2026-10-02", evidencia: "Foto do quadro" } },
  }, opc);
  assert.equal(ok.marcos[0].acao, "Medir");
});
