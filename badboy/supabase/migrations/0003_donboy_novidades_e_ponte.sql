-- Don Boy: "o que há de novo" nos sistemas e a ponte para o segundo projeto.
--
-- 1. donboy.novidades(horas): por tabela que o papel de leitura enxerga,
--    quantas linhas foram criadas ou atualizadas na janela e a mais recente.
--    Mesmas travas de donboy.consultar (dono donboy_leitor, só em transação
--    somente leitura).
-- 2. badboy_segredo(nome): lê do Vault o token da ponte para o segundo
--    projeto (Edge Function donboy-ponte de lá). Só segredos com prefixo
--    donboy_, só para o servidor. O token é criado direto no Vault, nunca
--    no código nem no repositório.

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

grant donboy_leitor to current_user with set true;
grant create on schema donboy to donboy_leitor;
alter function donboy.novidades(integer) owner to donboy_leitor;
revoke create on schema donboy from donboy_leitor;
revoke donboy_leitor from current_user;

revoke all on function donboy.novidades(integer) from public, anon, authenticated;
grant execute on function donboy.novidades(integer) to service_role;

create function public.badboy_novidades(p_horas integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select donboy.novidades(p_horas) $$;

revoke all on function public.badboy_novidades(integer) from public, anon, authenticated;
grant execute on function public.badboy_novidades(integer) to service_role;

create function public.badboy_segredo(p_nome text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = p_nome and p_nome like 'donboy\_%'
$$;

revoke all on function public.badboy_segredo(text) from public, anon, authenticated;
grant execute on function public.badboy_segredo(text) to service_role;

notify pgrst, 'reload schema';
