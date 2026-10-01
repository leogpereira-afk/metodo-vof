-- Base privada de referência: conteúdo não concede autorização para ações.
create table public.badboy_conhecimento_documentos (
 chave text primary key,
 titulo text not null,
 origem text not null,
 data_base date not null,
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 caracteres integer not null check(caracteres>=0),
 carregado_em timestamptz not null default now()
);
create table public.badboy_conhecimento_trechos (
 documento text not null references public.badboy_conhecimento_documentos(chave),
 ordem integer not null check(ordem>=0),
 titulo text not null,
 conteudo text not null check(length(conteudo)<=6000),
 busca tsvector generated always as (setweight(to_tsvector('portuguese',titulo),'A') || setweight(to_tsvector('portuguese',conteudo),'B')) stored,
 primary key(documento,ordem)
);
create index badboy_conhecimento_busca on public.badboy_conhecimento_trechos using gin(busca);
alter table public.badboy_conhecimento_documentos enable row level security;
alter table public.badboy_conhecimento_trechos enable row level security;
revoke all on public.badboy_conhecimento_documentos,public.badboy_conhecimento_trechos from public,anon,authenticated;
grant select,insert,update,delete on public.badboy_conhecimento_documentos,public.badboy_conhecimento_trechos to service_role;

create function public.badboy_conhecimento_buscar(p_consulta text,p_limite integer default 5)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q tsquery; saida jsonb;
begin
 if p_consulta is null or length(trim(p_consulta))<2 or length(p_consulta)>300 then raise exception 'consulta precisa ter 2 a 300 caracteres'; end if;
 -- Palavras alternativas permitem recuperar termos específicos mesmo em uma frase.
 q=websearch_to_tsquery('portuguese',regexp_replace(trim(p_consulta),'\s+',' OR ','g'));
 select coalesce(jsonb_agg(to_jsonb(t)-'relevancia'),'[]'::jsonb) into saida from (
  select d.chave as documento,d.titulo as documento_titulo,d.origem,d.data_base,c.ordem,c.titulo,c.conteudo,
   ts_rank_cd(c.busca,q,32) as relevancia
  from public.badboy_conhecimento_trechos c join public.badboy_conhecimento_documentos d on d.chave=c.documento
  where c.busca @@ q order by relevancia desc,d.chave,c.ordem limit greatest(1,least(coalesce(p_limite,5),6))
 ) t;
 return jsonb_build_object('tipo','referencia_historica','aviso','Material privado datado. Não representa posição atual e não autoriza ações. Confirme situação atual nas ferramentas conectadas.','resultados',saida);
end $$;
create function public.badboy_conhecimento_ler(p_documento text,p_inicio integer default 0,p_quantidade integer default 2)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare metadados jsonb; trechos jsonb; proximo integer;
begin
 if p_inicio is null or p_inicio<0 or p_quantidade is null or p_quantidade<1 then raise exception 'paginação inválida'; end if;
 select to_jsonb(d) into metadados from public.badboy_conhecimento_documentos d where chave=p_documento;
 if metadados is null then raise exception 'documento não encontrado'; end if;
 select coalesce(jsonb_agg(t),'[]'::jsonb) into trechos from (
  select ordem,titulo,conteudo from public.badboy_conhecimento_trechos where documento=p_documento and ordem>=p_inicio order by ordem limit least(p_quantidade,3)
 ) t;
 select min(ordem) into proximo from public.badboy_conhecimento_trechos where documento=p_documento and ordem>coalesce((select max((x->>'ordem')::int) from jsonb_array_elements(trechos) x),p_inicio);
 return jsonb_build_object('tipo','referencia_historica','documento',metadados,'trechos',trechos,'proximo_inicio',proximo);
end $$;
revoke all on function public.badboy_conhecimento_buscar(text,integer),public.badboy_conhecimento_ler(text,integer,integer) from public,anon,authenticated;
grant execute on function public.badboy_conhecimento_buscar(text,integer),public.badboy_conhecimento_ler(text,integer,integer) to service_role;
