// Classificações de negócio ficam em SQL fixo, não em SQL inventado a cada pergunta.
export function dataValida(data: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(data) && Number.isFinite(Date.parse(data + "T12:00:00Z")) &&
    new Date(data + "T12:00:00Z").toISOString().slice(0, 10) === data;
}
export const literalSql = (texto: string) => "'" + texto.replace(/'/g, "''") + "'";
export function consultaRecebiveis(cliente: string, data: string): string {
  if (!dataValida(data)) throw new Error("Data de referência inválida.");
  if (cliente.length > 200) throw new Error("Filtro de cliente longo demais.");
  const dia = literalSql(data);
  return `with base as (
 select valor,atualizado_em from public.painel_cache where chave='recebiveis'
 ), titulos as (
 select x->>'cliente' cliente,(x->>'valor')::numeric saldo,nullif(x->>'vencimento','')::date vencimento
 from base cross join lateral jsonb_array_elements(valor) x
 where position(lower(${literalSql(cliente)}) in lower(coalesce(x->>'cliente',''))) > 0
 ), resumo as (
 select count(*)::int titulos,coalesce(sum(saldo),0) total,
 coalesce(sum(saldo) filter(where vencimento < ${dia}::date),0) vencido,
 coalesce(sum(saldo) filter(where vencimento = ${dia}::date),0) vence_hoje,
 coalesce(sum(saldo) filter(where vencimento > ${dia}::date),0) a_vencer,
 coalesce(sum(saldo) filter(where vencimento is null),0) sem_vencimento,
 count(*) filter(where saldo is null)::int sem_saldo from titulos
 ) select resumo.*,${dia} as data_referencia,'Central Impresilk — contas a receber' as origem,
 (select max(atualizado_em) from base) atualizado_em,
 (select count(*)=1 from base) as fonte_encontrada,
 (select coalesce(jsonb_agg(q),'[]'::jsonb) from (
 select cliente,sum(saldo) total,sum(saldo) filter(where vencimento < ${dia}::date) vencido
 from titulos group by cliente order by sum(saldo) desc limit 15) q) clientes
 from resumo`;
}
