// Jornada individual: a identidade vem exclusivamente do crachá conferido.
// Não integra vof_registros, list, exportação global ou credenciais de máquina.
import { Falha, idValido } from "./regras.mjs";

export const MISSOES_JORNADA = Object.freeze([
  "arquitetura", "conscientizar", "ciclo", "times", "diagnostico", "venda", "operacao", "financas", "pessoas", "gestores", "90dias",
  "dono", "venda2", "operacao2", "financas2", "pessoas2", "gestores2", "dinamicas",
]);
const objeto = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function campos(v, permitidos) {
  if (!objeto(v) || Object.keys(v).some((k) => !permitidos.includes(k))) throw new Falha("Campos da jornada inválidos.");
}
function texto(v, limite, rotulo) {
  if (typeof v !== "string" || v.length > limite) throw new Falha(`${rotulo}: informe até ${limite} caracteres.`);
  return v;
}
function dia(v) {
  if (v === "") return v;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Falha("Data da jornada inválida.");
  const d = new Date(`${v}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== v || v.startsWith("0000")) throw new Falha("Data da jornada inválida.");
  return v;
}
export function validarJornada(body) {
  // Campos desconhecidos no envelope (incluindo usuário, XP e dono) são recusados.
  campos(body, ["action", "missao", "registro", "expectedRevision", "mutationId"]);
  if (!MISSOES_JORNADA.includes(body.missao)) throw new Falha("Missão desconhecida.");
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw new Falha("Revisão da jornada inválida.");
  const mutationId = idValido(body.mutationId);
  const r = body.registro;
  campos(r, ["opcao", "texto", "concluida", "data", "desafioVersao", "pratica"]);
  if (!["", "evidencia", "entrega", "ritmo"].includes(r.opcao) || typeof r.concluida !== "boolean") throw new Falha("Resposta da missão inválida.");
  const registro = { opcao: r.opcao, texto: texto(r.texto, 2000, "Resposta"), concluida: r.concluida, data: dia(r.data) };
  if (r.concluida && (!r.opcao || r.texto.trim().length < 12 || !r.data)) throw new Falha("Escolha uma resposta, registre sua evidência e a data para concluir.");
  if (r.desafioVersao !== undefined) {
    if (!Number.isSafeInteger(r.desafioVersao) || r.desafioVersao < 1 || r.desafioVersao > 10000) throw new Falha("Versão do desafio inválida.");
    registro.desafioVersao = r.desafioVersao;
  }
  if (r.pratica !== undefined) {
    campos(r.pratica, ["prazo", "situacao", "resultado", "revisaoEm"]);
    if (!["planejada", "em_pratica", "revisada"].includes(r.pratica.situacao)) throw new Falha("Situação da prática inválida.");
    registro.pratica = { prazo: dia(r.pratica.prazo), situacao: r.pratica.situacao, resultado: texto(r.pratica.resultado, 2000, "Resultado"), revisaoEm: dia(r.pratica.revisaoEm) };
    if (r.pratica.situacao === "revisada" && (r.pratica.resultado.trim().length < 12 || !r.pratica.revisaoEm)) throw new Falha("Registre o resultado e a data da revisão da prática.");
  }
  return { missao: body.missao, registro, expectedRevision: body.expectedRevision, mutationId };
}

export function resumirJornada(usuario, linhas) {
  const respostas = {};
  let xp = 0;
  for (const l of linhas) {
    if (!MISSOES_JORNADA.includes(l.missao)) continue;
    respostas[l.missao] = { registro: l.registro, revision: l.revision, atualizado_em: l.atualizado_em };
    if (l.registro?.concluida === true) xp += 30;
  }
  return { usuario, respostas, xp };
}
