-- Jornada por conta autenticada. Nenhuma migração de progresso do navegador:
-- a importação legada depende de conferência da pessoa na interface.
-- O dono é cracha.sub, definido no servidor. Não é a turma nem um nome digitado.
create table if not exists public.vof_jornada_pessoal (
  usuario text not null check (length(btrim(usuario)) between 1 and 200),
  missao text not null check (missao in ('arquitetura','conscientizar','ciclo','times','diagnostico','venda','operacao','financas','pessoas','gestores','90dias','dono','venda2','operacao2','financas2','pessoas2','gestores2','dinamicas')),
  registro jsonb not null check (jsonb_typeof(registro) = 'object'),
  revision bigint not null check (revision > 0),
  atualizado_em timestamptz not null default now(),
  primary key (usuario, missao)
);
-- Retém recibos por envio: retry tardio não regrava uma resposta mais recente.
create table if not exists public.vof_jornada_envios (
  usuario text not null,
  mutation_id text not null,
  missao text not null,
  pedido jsonb not null,
  resposta jsonb not null,
  criado_em timestamptz not null default now(),
  primary key (usuario, mutation_id)
);
alter table public.vof_jornada_pessoal enable row level security;
alter table public.vof_jornada_envios enable row level security;
revoke all on public.vof_jornada_pessoal, public.vof_jornada_envios from public, anon, authenticated;
-- SECURITY INVOKER: só service_role (bypassrls do Supabase) tem os privilégios.
-- Não há policy pública, nem acesso direto do navegador.
grant select, insert, update on public.vof_jornada_pessoal to service_role;
grant select, insert on public.vof_jornada_envios to service_role;

create or replace function public.vof_jornada_salvar(
  p_usuario text, p_missao text, p_registro jsonb, p_expected bigint, p_mutation text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  atual public.vof_jornada_pessoal%rowtype;
  envio public.vof_jornada_envios%rowtype;
  novo jsonb := p_registro;
  pedido jsonb := jsonb_build_object('missao', p_missao, 'registro', p_registro, 'expectedRevision', p_expected);
  resposta jsonb;
  versao bigint;
  carimbo timestamptz := clock_timestamp();
  data_texto text;
  pratica jsonb;
  alternativa_correta text;
begin
  if p_usuario is null or length(btrim(p_usuario)) not between 1 and 200
    or p_missao is null or p_missao not in ('arquitetura','conscientizar','ciclo','times','diagnostico','venda','operacao','financas','pessoas','gestores','90dias','dono','venda2','operacao2','financas2','pessoas2','gestores2','dinamicas')
    or p_expected is null or p_expected < 0
    or p_mutation is null or p_mutation !~ '^[a-zA-Z0-9._:-]{1,160}$'
    or p_registro is null or jsonb_typeof(p_registro) <> 'object' then
    raise exception using errcode = '22023', message = 'Jornada inválida';
  end if;
  if exists (select 1 from jsonb_object_keys(p_registro) k where k not in ('opcao','texto','concluida','data','desafioVersao','pratica'))
    or not (p_registro ?& array['opcao','texto','concluida','data'])
    or jsonb_typeof(p_registro->'opcao') <> 'string'
    or p_registro->>'opcao' not in ('','evidencia','entrega','ritmo')
    or jsonb_typeof(p_registro->'texto') <> 'string' or length(p_registro->>'texto') > 2000
    or jsonb_typeof(p_registro->'concluida') <> 'boolean'
    or jsonb_typeof(p_registro->'data') <> 'string' then
    raise exception using errcode = '22023', message = 'Resposta inválida';
  end if;
  if p_registro ? 'desafioVersao' and (jsonb_typeof(p_registro->'desafioVersao') <> 'number'
    or (p_registro->>'desafioVersao') !~ '^[1-9][0-9]{0,4}$'
    or (p_registro->>'desafioVersao')::numeric > 10000) then
    raise exception using errcode = '22023', message = 'Versão inválida';
  end if;
  pratica := p_registro->'pratica';
  if p_registro ? 'pratica' then
    if jsonb_typeof(pratica) <> 'object' then
      raise exception using errcode = '22023', message = 'Prática inválida';
    end if;
    if exists (select 1 from jsonb_object_keys(pratica) k where k not in ('prazo','situacao','resultado','revisaoEm'))
      or not (pratica ?& array['prazo','situacao','resultado','revisaoEm'])
      or jsonb_typeof(pratica->'prazo') <> 'string'
      or jsonb_typeof(pratica->'revisaoEm') <> 'string'
      or jsonb_typeof(pratica->'situacao') <> 'string'
      or pratica->>'situacao' not in ('planejada','em_pratica','revisada')
      or jsonb_typeof(pratica->'resultado') <> 'string' or length(pratica->>'resultado') > 2000 then
      raise exception using errcode = '22023', message = 'Prática inválida';
    end if;
    if pratica->>'situacao' = 'revisada' and (length(btrim(pratica->>'resultado')) < 12 or pratica->>'revisaoEm' = '') then
      raise exception using errcode = '22023', message = 'Falta resultado da revisão';
    end if;
  end if;
  foreach data_texto in array array[p_registro->>'data', pratica->>'prazo', pratica->>'revisaoEm'] loop
    if data_texto is not null and data_texto <> '' then
      if data_texto !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char(data_texto::date, 'YYYY-MM-DD') <> data_texto then
        raise exception using errcode = '22023', message = 'Data inválida';
      end if;
    end if;
  end loop;
  if (p_registro->>'concluida')::boolean and (p_registro->>'opcao' = '' or length(btrim(p_registro->>'texto')) < 12 or p_registro->>'data' = '') then
    raise exception using errcode = '22023', message = 'Falta evidência para concluir';
  end if;

  -- Serializa somente os envios desta conta, inclusive criação da primeira linha.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vof-jornada:' || p_usuario, 0));
  select * into envio from public.vof_jornada_envios where usuario = p_usuario and mutation_id = p_mutation;
  if found then
    if envio.pedido <> pedido then
      raise exception using errcode = '40001', message = 'Envio já usado com outra resposta';
    end if;
    return envio.resposta;
  end if;
  select * into atual from public.vof_jornada_pessoal where usuario = p_usuario and missao = p_missao for update;
  if coalesce(atual.revision, 0) <> p_expected then
    raise exception using errcode = '40001', message = 'Missão mudou em outro aparelho';
  end if;
  -- Regra didática versionada. O teste compara este mapa à versão 1 de
  -- jornada-conteudo.js: alterar as alternativas exige nova versão e migração.
  -- Tentativas ficam como rascunho; somente a primeira conclusão versionada
  -- exige a alternativa coerente. O legado importado explicitamente não tinha
  -- gabarito e permanece compatível. XP registra estudo, não é certificação.
  if p_registro ? 'desafioVersao' then
    if p_registro->>'desafioVersao' <> '1' then
      raise exception using errcode = '22023', message = 'Versão do desafio desconhecida';
    end if;
    if p_registro->>'concluida' = 'true' and coalesce(atual.registro->>'concluida', 'false') <> 'true' then
      alternativa_correta := case p_missao
        when 'arquitetura' then 'evidencia'
        when 'conscientizar' then 'entrega'
        when 'ciclo' then 'ritmo'
        when 'times' then 'evidencia'
        when 'diagnostico' then 'entrega'
        when 'venda' then 'ritmo'
        when 'operacao' then 'evidencia'
        when 'financas' then 'entrega'
        when 'pessoas' then 'ritmo'
        when 'gestores' then 'evidencia'
        when '90dias' then 'entrega'
        when 'dono' then 'ritmo'
        when 'venda2' then 'evidencia'
        when 'operacao2' then 'entrega'
        when 'financas2' then 'ritmo'
        when 'pessoas2' then 'evidencia'
        when 'gestores2' then 'entrega'
        when 'dinamicas' then 'ritmo'
        else null
      end;
      if alternativa_correta is null or p_registro->>'opcao' <> alternativa_correta then
        raise exception using errcode = '22023', message = 'Confira a explicação e escolha outro caminho antes de concluir';
      end if;
    end if;
  end if;
  -- Conclusão e data originais são duráveis; editar não dá XP outra vez.
  if atual.registro->>'concluida' = 'true' then
    if novo->>'opcao' = '' or length(btrim(novo->>'texto')) < 12 then
      raise exception using errcode = '22023', message = 'Preserve a evidência da missão concluída';
    end if;
    novo := jsonb_set(jsonb_set(novo, '{concluida}', 'true'::jsonb), '{data}', atual.registro->'data');
  end if;
  versao := coalesce(atual.revision, 0) + 1;
  insert into public.vof_jornada_pessoal(usuario, missao, registro, revision, atualizado_em)
    values(p_usuario, p_missao, novo, versao, carimbo)
    on conflict (usuario, missao) do update set registro = excluded.registro, revision = excluded.revision, atualizado_em = excluded.atualizado_em;
  resposta := jsonb_build_object('usuario', p_usuario, 'missao', p_missao, 'registro', novo, 'revision', versao, 'atualizado_em', carimbo);
  insert into public.vof_jornada_envios(usuario, mutation_id, missao, pedido, resposta)
    values(p_usuario, p_mutation, p_missao, pedido, resposta);
  return resposta;
end;
$$;
revoke all on function public.vof_jornada_salvar(text,text,jsonb,bigint,text) from public, anon, authenticated;
grant execute on function public.vof_jornada_salvar(text,text,jsonb,bigint,text) to service_role;
