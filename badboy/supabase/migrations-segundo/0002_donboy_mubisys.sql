-- Don Boy: visões prontas do ERP (Mubisys) e do módulo Compras, no segundo
-- projeto. Os dados já estão aqui: a carga do Painel copia O.S., orçamentos e
-- contas do ERP de hora em hora (painel_ordens e painel_cache), e o Compras
-- grava solicitações, cotações e ordens em compras_registros. As visões tiram
-- o JSON do caminho para o Don Boy montar relatório e orçamento sem errar.
--
-- Só leitura, como o resto do schema donboy. compras_registros deixa de ser
-- lido direto: guarda os tokens dos links públicos de cotação e de ordem de
-- compra, que a visão compras_pedidos não traz.

-- O.S. do ERP desde 2020 (cancelada é apagada pela carga).
create view donboy.mubi_os as
  select numero, data, cliente, cnpj, vendedor, bruto, desconto, valor,
         jsonb_array_length(coalesce(itens, '[]'::jsonb)) as qtd_itens, atualizado_em
  from public.painel_ordens;
comment on view donboy.mubi_os is 'O.S. do Mubisys desde 2020: valor = bruto - desconto (o que o cliente deve).';

-- Um item de O.S. por linha, últimos 2 anos. valor_unit é o preço por m² nos
-- produtos vendidos por área (placa, lona, adesivo, letra) e por unidade nos
-- demais; area_m2_peca = valor_total / (valor_unit x quantidade) estima a
-- área de cada peça (perto de 1 quando o preço é por unidade).
create view donboy.mubi_itens as
  select o.numero, o.data, o.cliente, o.vendedor,
         e->>'categoria' as categoria, e->>'produto' as produto, e->>'modelo' as modelo,
         (e->>'quantidade')::numeric as quantidade,
         (e->>'valorUnit')::numeric as valor_unit,
         (e->>'valorTotal')::numeric as valor_total,
         round(((e->>'valorTotal')::numeric / nullif((e->>'valorUnit')::numeric * (e->>'quantidade')::numeric, 0)), 3) as area_m2_peca
  from public.painel_ordens o, jsonb_array_elements(coalesce(o.itens, '[]'::jsonb)) e
  where o.data >= current_date - interval '2 years';
comment on view donboy.mubi_itens is 'Itens das O.S. dos últimos 2 anos; valor_unit = preço por m² (produtos por área) ou por unidade.';

-- Preço praticado nos últimos 12 meses, por produto e modelo: a base do
-- orçamento. Mediana e faixa (25% a 75%) do valor_unit, não a média, que um
-- desconto grande ou uma peça fora do padrão distorcem.
create view donboy.mubi_precos as
  select categoria, produto, modelo,
         count(distinct numero) as qtd_os,
         round(percentile_cont(0.5) within group (order by valor_unit)::numeric, 2) as preco_mediano,
         round(percentile_cont(0.25) within group (order by valor_unit)::numeric, 2) as preco_p25,
         round(percentile_cont(0.75) within group (order by valor_unit)::numeric, 2) as preco_p75,
         min(valor_unit) as preco_min, max(valor_unit) as preco_max,
         round(percentile_cont(0.5) within group (order by area_m2_peca)::numeric, 3) as area_mediana_peca,
         round(sum(valor_total), 2) as faturado_12m,
         max(data) as ultima_venda
  from donboy.mubi_itens
  where data >= current_date - interval '12 months' and valor_unit > 0
  group by categoria, produto, modelo;
comment on view donboy.mubi_precos is 'Preço praticado em 12 meses por produto/modelo (mediana e faixa p25-p75 do valor_unit).';

-- Orçamentos do ano (o cache do Painel traz o ano corrente).
create view donboy.mubi_orcamentos as
  select e->>'numero' as numero,
         e->>'cliente' as cliente,
         e->>'trabalho' as trabalho,
         (e->>'valor')::numeric as valor,
         (e->>'custo')::numeric as custo,
         round((e->>'valor')::numeric - (e->>'custo')::numeric, 2) as margem,
         round(100 * ((e->>'valor')::numeric - (e->>'custo')::numeric) / nullif((e->>'valor')::numeric, 0), 1) as margem_pct,
         (e->>'desconto')::numeric as desconto,
         e->>'situacao' as situacao,
         e->>'vendedorNome' as vendedor,
         nullif(e->>'dataEnvio', '')::timestamp as enviado_em,
         nullif(e->>'dataFechamento', '')::timestamp as fechado_em,
         nullif(e->>'validade', '')::int as validade_dias,
         e->>'contatoNome' as contato, e->>'email' as email, e->>'celular' as celular,
         c.atualizado_em as cache_em
  from public.painel_cache c, jsonb_array_elements(c.valor) e
  where c.chave = 'orcamentos';
comment on view donboy.mubi_orcamentos is 'Orçamentos do Mubisys no ano: situacao aberto, ganho ou perdido; margem = valor - custo.';

-- Compras: solicitações (SC), cotações (CT) e ordens de compra (OC), sem os
-- tokens dos links públicos.
create view donboy.compras_pedidos as
  select case r.colecao when 'sc' then 'solicitação' when 'cot' then 'cotação' else 'ordem de compra' end as tipo,
         r.registro->>'codigo' as codigo,
         r.registro->>'situacao' as situacao,
         r.registro->>'obra' as obra,
         r.registro->>'setor' as setor,
         r.registro->>'urgencia' as urgencia,
         coalesce(r.registro->'solicitante'->>'nome', r.registro->>'criadoPor') as solicitante,
         nullif(r.registro->>'criadoEm', '')::timestamptz as criado_em,
         nullif(r.registro->>'necessidadeEm', '') as necessidade_em,
         r.registro->>'justificativa' as justificativa,
         coalesce(r.registro->'fornecedor'->>'nome',
                  (select f->>'nome' from jsonb_array_elements(coalesce(r.registro->'fornecedores', '[]'::jsonb)) f
                   where (f->>'escolhido')::boolean limit 1)) as fornecedor,
         coalesce(nullif(r.registro->>'totalLiquido', '')::numeric, nullif(r.registro->>'total', '')::numeric,
                  (select (f->>'total')::numeric from jsonb_array_elements(coalesce(r.registro->'fornecedores', '[]'::jsonb)) f
                   where (f->>'escolhido')::boolean limit 1)) as total,
         r.registro->>'condicaoPagamento' as condicao_pagamento,
         r.registro->>'prazoEntrega' as prazo_entrega,
         nullif(r.registro->>'recebidoEm', '')::timestamptz as recebido_em,
         (select string_agg(concat_ws(' ', i->>'qtd', i->>'unid', i->>'descricao'), '; ')
          from jsonb_array_elements(coalesce(r.registro->'itens', '[]'::jsonb)) i) as itens,
         r.atualizado_em
  from public.compras_registros r
  where r.colecao in ('sc', 'cot', 'oc') and not coalesce(r.apagado, false)
    and r.registro->>'apagadoEm' is null;
comment on view donboy.compras_pedidos is 'Compras: solicitações, cotações e ordens de compra (sem tokens de link público).';

revoke all on donboy.mubi_os, donboy.mubi_itens, donboy.mubi_precos, donboy.mubi_orcamentos, donboy.compras_pedidos
  from public, anon, authenticated;
grant select on donboy.mubi_os, donboy.mubi_itens, donboy.mubi_precos, donboy.mubi_orcamentos, donboy.compras_pedidos
  to donboy_leitor;
revoke select on public.compras_registros from donboy_leitor;
