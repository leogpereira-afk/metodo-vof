-- Don Boy: leitura do SEGUNDO projeto Supabase (o Don Boy mora no principal).
--
-- Mesmo modelo da migração 0002 do projeto principal:
--   • donboy.consultar() roda como donboy_leitor, que só tem SELECT;
--   • é SECURITY DEFINER (a consulta não troca de papel) e recusa rodar fora
--     de transação somente leitura (o servidor chama por GET);
--   • devolve no máximo 200 linhas, com limite de 20 s.
-- O Don Boy chega aqui pela Edge Function donboy-ponte deste projeto, que
-- confere um token (só o hash fica em donboy_ponte) e chama estas funções.
--
-- Fica de fora o que guarda credencial: leo_config (tokens de Google e
-- Strava), leo_strava_cache (access token do Strava), acesso_senha_legado e
-- painel_senha_operacao, tabelas *_cfg, a própria donboy_ponte, as colunas de
-- hash de equipe_contas e painel_contas, a chave 'mubisys' do pcp_meta (token
-- do ERP) e as coleções planilhas/planilhas_acesso do painel_registros (o id
-- da planilha do Google vale como chave). leo_backups (cópias do estado) não
-- é necessário para consulta.

create role donboy_leitor nologin bypassrls;

create schema donboy;
revoke all on schema donboy from public;
grant usage on schema public, donboy to donboy_leitor;

create table public.donboy_ponte (
  hash text primary key,
  criado_em timestamptz not null default now()
);
comment on table public.donboy_ponte is 'Hash (sha-256) do token da ponte do Don Boy. Só o servidor lê.';
alter table public.donboy_ponte enable row level security;
revoke all on public.donboy_ponte from public, anon, authenticated;

do $$
declare
  t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p')
      and c.relname not like '%\_cfg'
      and c.relname not in (
        'leo_config', 'leo_strava_cache', 'leo_backups', 'acesso_senha_legado',
        'painel_senha_operacao', 'donboy_ponte', 'equipe_contas', 'painel_contas',
        'pcp_meta', 'painel_registros'
      )
  loop
    execute format('grant select on public.%I to donboy_leitor', t);
  end loop;
end $$;

-- Contas de acesso sem o hash da senha.
grant select (sistema, usuario, nome, papel, ativo, trocar_senha, criado_em, atualizado_em)
  on public.equipe_contas to donboy_leitor;
grant select (usuario, nome, permissoes, vendedor_id, atualizado_em)
  on public.painel_contas to donboy_leitor;

-- pcp_meta e painel_registros sem o que vale como credencial. Mesmo nome da
-- tabela, no schema donboy, que vem antes de public no search_path da consulta.
create view donboy.pcp_meta as
  select chave, valor, atualizado_em from public.pcp_meta where chave <> 'mubisys';
comment on view donboy.pcp_meta is 'pcp_meta sem a chave mubisys (token do ERP)';
create view donboy.painel_registros as
  select colecao, id, registro, atualizado_em from public.painel_registros
  where colecao not in ('planilhas', 'planilhas_acesso');
comment on view donboy.painel_registros is 'painel_registros sem as coleções planilhas e planilhas_acesso';
revoke all on donboy.pcp_meta, donboy.painel_registros from public, anon, authenticated;
grant select on donboy.pcp_meta, donboy.painel_registros to donboy_leitor;

create function donboy.consultar(p_sql text)
returns jsonb
language plpgsql
stable
security definer
set search_path = donboy, public, pg_catalog
set statement_timeout = '20s'
as $$
declare
  resultado jsonb;
begin
  if current_setting('transaction_read_only') <> 'on' then
    raise exception 'donboy.consultar só roda em transação somente leitura';
  end if;
  execute format(
    'select coalesce(jsonb_agg(q), ''[]''::jsonb) from (select * from (%s) sub limit 200) q',
    regexp_replace(p_sql, ';\s*$', '')
  ) into resultado;
  return resultado;
end $$;

-- O que mudou nas últimas horas: por tabela visível, quantas linhas têm a
-- data de criação ou de atualização dentro da janela, e a mais recente.
create function donboy.novidades(p_horas integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = donboy, public, pg_catalog
set statement_timeout = '20s'
as $$
declare
  r record;
  v_linhas bigint;
  v_ultima timestamptz;
  saida jsonb := '[]'::jsonb;
  janela interval := make_interval(hours => least(greatest(coalesce(p_horas, 24), 1), 720));
begin
  if current_setting('transaction_read_only') <> 'on' then
    raise exception 'donboy.novidades só roda em transação somente leitura';
  end if;
  -- information_schema só mostra o que o papel de leitura pode ler.
  for r in
    select c.table_schema, c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema in ('public', 'donboy')
      and c.column_name in ('atualizado_em', 'updated_at', 'criado_em', 'created_at', 'criada_em', 'em')
      and c.data_type like 'timestamp%'
    order by 2, 3
  loop
    execute format('select count(*), max(%I) from %I.%I where %I > now() - $1',
      r.column_name, r.table_schema, r.table_name, r.column_name)
      into v_linhas, v_ultima using janela;
    if v_linhas > 0 then
      saida := saida || jsonb_build_object(
        'tabela', r.table_name, 'coluna', r.column_name, 'linhas', v_linhas, 'ultima', v_ultima);
    end if;
  end loop;
  return saida;
end $$;

-- O dono das funções é o papel de leitura: a consulta roda com os direitos
-- dele. Para transferir a posse, quem aplica a migração precisa poder assumir
-- o papel por um instante; a permissão é retirada logo depois.
grant donboy_leitor to current_user with set true;
grant create on schema donboy to donboy_leitor;
alter function donboy.consultar(text) owner to donboy_leitor;
alter function donboy.novidades(integer) owner to donboy_leitor;
revoke create on schema donboy from donboy_leitor;
revoke donboy_leitor from current_user;

revoke all on function donboy.consultar(text) from public, anon, authenticated;
revoke all on function donboy.novidades(integer) from public, anon, authenticated;
grant usage on schema donboy to service_role;
grant execute on function donboy.consultar(text) to service_role;
grant execute on function donboy.novidades(integer) to service_role;

-- Portas de entrada pela API (schema public), só para o servidor.
create function public.badboy_consultar(p_sql text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select donboy.consultar(p_sql) $$;

create function public.badboy_novidades(p_horas integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select donboy.novidades(p_horas) $$;

revoke all on function public.badboy_consultar(text) from public, anon, authenticated;
revoke all on function public.badboy_novidades(integer) from public, anon, authenticated;
grant execute on function public.badboy_consultar(text) to service_role;
grant execute on function public.badboy_novidades(integer) to service_role;

notify pgrst, 'reload schema';
