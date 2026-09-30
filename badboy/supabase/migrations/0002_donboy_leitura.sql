-- Don Boy: leitura dos sistemas das empresas (fase A).
--
-- O Don Boy consulta o banco com SQL, mas SÓ através de donboy.consultar():
--   • roda como o papel donboy_leitor, que só tem SELECT;
--   • é SECURITY DEFINER, então a consulta não consegue trocar de papel
--     (set role / set_config('role') são proibidos nesse tipo de função);
--   • recusa rodar fora de transação somente leitura (o servidor chama por
--     GET, que o PostgREST executa em READ ONLY): nem funções com efeito
--     colateral conseguem gravar;
--   • devolve no máximo 200 linhas, com limite de 20 s.
--
-- Fica de fora tudo que guarda credencial: tabelas *_cfg (integração Omie,
-- tokens, hash de senha), ml_config_global, ml_meta (token Jibble),
-- google_calendar_integrations (refresh token), cmp_acesso, a coluna senha de
-- ml_contas e os grupos cfg/integracoes_privadas do dmd_kv.

create role donboy_leitor nologin bypassrls;

create schema donboy;
revoke all on schema donboy from public;
grant usage on schema public, donboy to donboy_leitor;

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
      and c.relname not like 'badboy\_%'
      and c.relname not like '%\_cfg'
      and c.relname not in (
        'ml_config_global', 'ml_meta', 'google_calendar_integrations',
        'cmp_acesso', 'ml_contas', 'dmd_kv', 'cmp_kv'
      )
  loop
    execute format('grant select on public.%I to donboy_leitor', t);
  end loop;
end $$;

-- ml_contas sem a senha.
grant select (usuario, nome, papel, ativo, criado_em, paginas_consulta) on public.ml_contas to donboy_leitor;

-- dmd_kv sem configuração e integrações privadas. Mesmo nome da tabela, no
-- schema donboy, que vem antes de public no search_path da consulta.
create view donboy.dmd_kv as
  select store, key, valor, atualizado_em
  from public.dmd_kv
  where store not in ('cfg', 'integracoes_privadas');
comment on view donboy.dmd_kv is 'dmd_kv sem os grupos cfg e integracoes_privadas';
revoke all on donboy.dmd_kv from public, anon, authenticated;
grant select on donboy.dmd_kv to donboy_leitor;

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

-- O dono da função é o papel de leitura: a consulta roda com os direitos dele.
-- Para transferir a posse, quem aplica a migração precisa poder assumir o
-- papel por um instante; a permissão é retirada logo depois.
grant donboy_leitor to current_user with set true;
grant create on schema donboy to donboy_leitor;
alter function donboy.consultar(text) owner to donboy_leitor;
revoke create on schema donboy from donboy_leitor;
revoke donboy_leitor from current_user;

revoke all on function donboy.consultar(text) from public, anon, authenticated;
grant usage on schema donboy to service_role;
grant execute on function donboy.consultar(text) to service_role;

-- Porta de entrada pela API (schema public), só para o servidor.
create function public.badboy_consultar(p_sql text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select donboy.consultar(p_sql) $$;

revoke all on function public.badboy_consultar(text) from public, anon, authenticated;
grant execute on function public.badboy_consultar(text) to service_role;

notify pgrst, 'reload schema';
