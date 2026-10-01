-- Identificadores com síntese consolidada não recebem notas parciais como complemento.
-- Os originais continuam disponíveis na leitura explícita do documento.
create or replace function public.badboy_conhecimento_buscar(p_consulta text,p_limite integer default 5)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q tsquery; q_exata tsquery; saida jsonb;
begin
 if p_consulta is null or length(trim(p_consulta))<2 or length(p_consulta)>300 then raise exception 'consulta precisa ter 2 a 300 caracteres'; end if;
 q=websearch_to_tsquery('portuguese',regexp_replace(trim(p_consulta),'\s+',' OR ','g'));
 q_exata=plainto_tsquery('portuguese',p_consulta);
 with candidatas as (
  select d.chave as documento,d.titulo as documento_titulo,d.origem,d.data_base,c.ordem,c.titulo,c.conteudo,
   (d.chave ~ '^(0[1-4]-|guia-operacional)' or d.chave='base-conhecimento/relatorio-final-uso-e-evolucao.md') as fonte_consolidada,
   case when d.chave='guia-operacional-donboy' then 4 when d.chave like '01-%' then 3 when d.chave ~ '^0[2-4]-' or d.chave='base-conhecimento/relatorio-final-uso-e-evolucao.md' then 2 else 1 end as prioridade,
   (select count(*) from regexp_matches(p_consulta,'\m[0-9]{4,}\M','g') r(n) where c.conteudo ~ ('\m'||n[1]||'\M')) as ids_correspondentes,
   c.busca @@ q_exata as exata,
   ts_rank_cd(c.busca,q,32) as relevancia
  from public.badboy_conhecimento_trechos c join public.badboy_conhecimento_documentos d on d.chave=c.documento
  where c.busca @@ q
 ), cobertura as (select coalesce(max(ids_correspondentes) filter (where fonte_consolidada),0) as ids from candidatas)
 select coalesce(jsonb_agg(to_jsonb(t)-'relevancia'-'prioridade'-'ids_correspondentes'-'exata'),'[]'::jsonb) into saida from (
  select c.* from candidatas c cross join cobertura k
  where k.ids=0 or (c.fonte_consolidada and c.ids_correspondentes>=k.ids)
  order by ids_correspondentes desc,prioridade desc,exata desc,relevancia desc,documento,ordem
  limit greatest(1,least(coalesce(p_limite,5),6))
 ) t;
 return jsonb_build_object('tipo','referencia_historica','aviso','Material privado datado. Relatórios consolidados incorporam correções posteriores das notas de estudo. Na busca por identificador com fonte consolidada, notas parciais são omitidas; podem ser lidas explicitamente. Ausência de um detalhe nesta síntese não prova ausência de documento ou ação. Não representa posição atual e não autoriza ações.','resultados',saida);
end $$;
