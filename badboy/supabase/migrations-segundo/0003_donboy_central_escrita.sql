-- Don Boy: lançar na Central do Léo (leo_estado), a pedido do dono.
--
-- A Central guarda tudo numa linha (leo_estado.dados) e grava com trava
-- otimista: o navegador manda a versão que viu (mt) e o servidor só aceita se
-- ela ainda for a atual. Estas funções seguem a mesma regra, de dentro do
-- banco, numa transação só:
--   • travam a linha (FOR UPDATE), mudam UM item de UMA lista e sobem as duas
--     versões (a coluna mt e o _mt dentro dos dados);
--   • a tela aberta no navegador vê a versão nova e adota a da nuvem (a edição
--     local que estiver em curso fica em Configurações → Versão descartada);
--   • cada lançamento fica em donboy_central_log com o antes e o depois, e
--     pode ser desfeito enquanto ninguém mexer no item depois.
--
-- Operações: adicionar um item a uma lista (ou a uma sublista de um item, como
-- o hotel de uma viagem) e atualizar campos de um item. Apagar não existe aqui.
-- A ponte (donboy-ponte) escolhe o id novo no formato da Central e confere
-- quais listas e sublistas podem ser mexidas; estas funções conferem de novo
-- o que não pode quebrar a Central (lista existente, item objeto).

create table public.donboy_central_log (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  operacao text not null check (operacao in ('adicionar', 'atualizar')),
  lista text not null,
  item_id text not null,
  sublista text,
  novo_id text,
  antes jsonb,
  depois jsonb not null,
  mt_antes bigint not null,
  mt_depois bigint not null,
  desfeito_em timestamptz
);
comment on table public.donboy_central_log is 'Lançamentos do Don Boy na Central do Léo, com o antes e o depois de cada item, para conferir e desfazer.';
alter table public.donboy_central_log enable row level security;
revoke all on public.donboy_central_log from public, anon, authenticated;
grant select on public.donboy_central_log to donboy_leitor;

-- Sobe as duas versões da Central (coluna mt e dados._mt) além de qualquer
-- valor já visto, para o navegador reconhecer o dado novo como mais recente.
create function public.donboy_central_versao(p_mt bigint, p_dados jsonb)
returns bigint
language sql
volatile
set search_path = ''
as $$
  select greatest(
    (extract(epoch from clock_timestamp()) * 1000)::bigint,
    p_mt + 1,
    coalesce((p_dados ->> '_mt')::numeric::bigint, 0) + 1
  )
$$;

create function public.donboy_central_gravar(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_op text := p ->> 'operacao';
  v_nome text := p ->> 'lista';
  v_id text := nullif(p ->> 'id', '');
  v_sub text := nullif(p ->> 'sublista', '');
  v_novo_id text := nullif(p ->> 'novo_id', '');
  v_mt bigint;
  v_dados jsonb;
  v_lista jsonb;
  v_idx int;
  v_elem jsonb;
  v_depois jsonb;
  v_sublista jsonb;
  v_mt_novo bigint;
  v_log bigint;
begin
  if v_op not in ('adicionar', 'atualizar') then raise exception 'operação inválida'; end if;
  if v_nome is null or v_nome !~ '^[A-Za-z][A-Za-z0-9]{1,40}$' then raise exception 'lista inválida'; end if;

  select mt, dados into v_mt, v_dados from public.leo_estado where id = true for update;
  if not found then raise exception 'a Central ainda não tem dados'; end if;
  v_lista := v_dados -> v_nome;
  if v_lista is null or jsonb_typeof(v_lista) <> 'array' then
    raise exception 'a lista % não existe na Central', v_nome;
  end if;

  if v_op = 'adicionar' and v_id is null then
    if jsonb_typeof(p -> 'item') is distinct from 'object' or v_novo_id is null then raise exception 'item inválido'; end if;
    v_depois := (p -> 'item') || jsonb_build_object('id', v_novo_id);
    v_dados := jsonb_set(v_dados, array[v_nome], v_lista || jsonb_build_array(v_depois));
    v_elem := null;
    v_id := v_novo_id;
  else
    select (t.ord - 1)::int, t.e into v_idx, v_elem
      from jsonb_array_elements(v_lista) with ordinality as t(e, ord)
      where t.e ->> 'id' = v_id
      limit 1;
    if v_idx is null then raise exception 'item % não encontrado na lista %', v_id, v_nome; end if;
    if v_op = 'atualizar' then
      if jsonb_typeof(p -> 'campos') is distinct from 'object' then raise exception 'campos inválidos'; end if;
      v_depois := v_elem || ((p -> 'campos') - 'id');
    else
      if v_sub is null or v_sub !~ '^[A-Za-z][A-Za-z0-9]{1,40}$' then raise exception 'sublista inválida'; end if;
      if jsonb_typeof(p -> 'item') is distinct from 'object' or v_novo_id is null then raise exception 'item inválido'; end if;
      v_sublista := coalesce(v_elem -> v_sub, '[]'::jsonb);
      if jsonb_typeof(v_sublista) <> 'array' then raise exception 'a sublista % não é uma lista', v_sub; end if;
      v_depois := jsonb_set(v_elem, array[v_sub],
        v_sublista || jsonb_build_array((p -> 'item') || jsonb_build_object('id', v_novo_id)));
    end if;
    v_dados := jsonb_set(v_dados, array[v_nome, v_idx::text], v_depois);
  end if;

  v_mt_novo := public.donboy_central_versao(v_mt, v_dados);
  v_dados := jsonb_set(v_dados, '{_mt}', to_jsonb(v_mt_novo));
  update public.leo_estado set dados = v_dados, mt = v_mt_novo, atualizado_em = now() where id = true;

  insert into public.donboy_central_log (operacao, lista, item_id, sublista, novo_id, antes, depois, mt_antes, mt_depois)
  values (v_op, v_nome, v_id, v_sub, v_novo_id, v_elem, v_depois, v_mt, v_mt_novo)
  returning id into v_log;

  return jsonb_build_object('lancamento', v_log, 'lista', v_nome, 'item_id', v_id, 'novo_id', v_novo_id, 'item', v_depois);
end $$;

-- Desfaz um lançamento: o item volta ao que era (ou sai da lista, se foi
-- criado pelo lançamento). Só se ninguém mexeu nele depois.
create function public.donboy_central_desfazer(p_lancamento bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  r public.donboy_central_log;
  v_mt bigint;
  v_dados jsonb;
  v_lista jsonb;
  v_idx int;
  v_atual jsonb;
  v_mt_novo bigint;
begin
  select * into r from public.donboy_central_log where id = p_lancamento for update;
  if not found then raise exception 'lançamento % não existe', p_lancamento; end if;
  if r.desfeito_em is not null then raise exception 'esse lançamento já foi desfeito'; end if;

  select mt, dados into v_mt, v_dados from public.leo_estado where id = true for update;
  v_lista := v_dados -> r.lista;
  select (t.ord - 1)::int, t.e into v_idx, v_atual
    from jsonb_array_elements(coalesce(v_lista, '[]'::jsonb)) with ordinality as t(e, ord)
    where t.e ->> 'id' = r.item_id
    limit 1;
  if v_idx is null then raise exception 'o item não está mais na Central'; end if;
  if v_atual is distinct from r.depois then
    raise exception 'o item foi alterado depois do lançamento; ajuste direto na Central';
  end if;

  if r.antes is null then
    v_dados := jsonb_set(v_dados, array[r.lista], v_lista - v_idx);
  else
    v_dados := jsonb_set(v_dados, array[r.lista, v_idx::text], r.antes);
  end if;
  v_mt_novo := public.donboy_central_versao(v_mt, v_dados);
  v_dados := jsonb_set(v_dados, '{_mt}', to_jsonb(v_mt_novo));
  update public.leo_estado set dados = v_dados, mt = v_mt_novo, atualizado_em = now() where id = true;
  update public.donboy_central_log set desfeito_em = now() where id = p_lancamento;
  return jsonb_build_object('desfeito', p_lancamento, 'lista', r.lista, 'item_id', r.item_id);
end $$;

revoke all on function public.donboy_central_versao(bigint, jsonb) from public, anon, authenticated;
revoke all on function public.donboy_central_gravar(jsonb) from public, anon, authenticated;
revoke all on function public.donboy_central_desfazer(bigint) from public, anon, authenticated;
grant execute on function public.donboy_central_versao(bigint, jsonb) to service_role;
grant execute on function public.donboy_central_gravar(jsonb) to service_role;
grant execute on function public.donboy_central_desfazer(bigint) to service_role;

notify pgrst, 'reload schema';
