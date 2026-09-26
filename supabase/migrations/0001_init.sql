-- ============================================================================
-- Método V.O.F.: banco do sistema. Prefixo vof em TUDO.
--
-- PROJETO COMPARTILHADO (ref heveemylixartyijxewh). O RH usa nomes CRUS
-- (registros, config_global, meta, perfis, bucket "arquivos", function "sync").
-- Objeto sem prefixo reutilizaria, calado, uma tabela do RH em produção:
-- "create table if not exists" não avisa quando a tabela já existe.
--
-- RLS ligado e SEM policy: só a Edge Function vof-sync (service_role) lê e
-- grava. O navegador nunca fala com o Postgres direto. A única policy desta
-- migração mora em storage.objects, é RESTRITIVA e só TIRA acesso (bucket).
--
-- Idempotente: rodar de novo não apaga nem reescreve dado nenhum.
-- Desenho copiado do POPs (0001 + 0002), sem o espelho de pessoas: aqui o
-- participante das turmas não tem conta e não tem nome guardado.
-- ============================================================================

-- Cofre genérico coleção/id/registro, o mesmo que o backup do Hub já sabe ler.
-- Coleções: turmas, empresas, diagnosticos, planos, salas, conteudo.
create table if not exists public.vof_registros (
  colecao       text not null,
  id            text not null,
  registro      jsonb not null,
  atualizado_em timestamptz not null default now(),
  apagado       boolean not null default false,   -- lápide: apagar é marcar, nunca deletar
  revision      bigint not null default 1,        -- concorrência otimista (vof_gravar)
  mutation_id   text,                             -- reenvio do mesmo envio não grava duas vezes
  primary key (colecao, id)
);
-- Quem já tiver uma versão antiga da tabela ganha as colunas novas sem perder linha.
alter table public.vof_registros add column if not exists revision bigint not null default 1;
alter table public.vof_registros add column if not exists mutation_id text;
-- Pull incremental por (data, id): sem este índice, cada página é varredura completa.
create index if not exists vof_registros_cursor_idx
  on public.vof_registros (colecao, atualizado_em, id);
alter table public.vof_registros enable row level security;

-- Config global do app. UMA linha: check(id) impede a segunda.
create table if not exists public.vof_config_global (
  id            boolean primary key default true check (id),
  config        jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.vof_config_global enable row level security;

-- Chave/valor: o contador "rev" do pull econômico.
create table if not exists public.vof_meta (
  chave         text primary key,
  valor         jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.vof_meta enable row level security;

-- Sem policy e sem privilégio: nem a chave anônima (pública no config.js de
-- qualquer sistema da casa) nem uma sessão do Auth enxergam estas tabelas.
revoke all on table public.vof_registros, public.vof_config_global, public.vof_meta
  from anon, authenticated;
-- A vof-sync (service_role) LÊ as três tabelas direto; escrever, só pelas
-- funções abaixo. Dito aqui, e não herdado do privilégio padrão do schema:
-- se a migração rodar com outro dono, a porta não fica sem ler, calada.
grant select on table public.vof_registros, public.vof_config_global, public.vof_meta
  to service_role;

-- Apostila e demais arquivos pagos. Bucket PRIVADO: só a service_role lê, e o
-- navegador recebe uma URL assinada de 10 minutos (ação urlArquivo).
-- Se alguém tiver virado o bucket para público, rodar de novo fecha.
insert into storage.buckets (id, name, public)
values ('vof-arquivos', 'vof-arquivos', false)
on conflict (id) do update set public = false;

-- Bucket privado só continua privado se NENHUMA policy de storage.objects o
-- abrir. O projeto é compartilhado: uma policy larga criada para outro sistema
-- ("anon lê tudo", sem filtrar bucket) alcançaria a apostila paga.
-- Esta policy é RESTRITIVA: não concede nada a ninguém. Ela só tira o bucket
-- vof-arquivos de anon e authenticated, qualquer que seja a policy permissiva
-- que exista hoje ou venha a existir. Os outros buckets não mudam. A
-- service_role (a vof-sync) ignora RLS e continua gerando a URL assinada.
-- Sem permissão para criar policy em storage.objects, o resto da migração
-- segue e o aviso sai no resultado: aí a conferência é à mão.
do $$
begin
  drop policy if exists vof_arquivos_so_pelo_servidor on storage.objects;
  create policy vof_arquivos_so_pelo_servidor on storage.objects
    as restrictive for all to anon, authenticated
    using (bucket_id is distinct from 'vof-arquivos')
    with check (bucket_id is distinct from 'vof-arquivos');
exception when insufficient_privilege then
  raise warning 'vof: sem permissão para criar a policy restritiva em storage.objects. Confira as policies de storage.objects antes de subir a apostila.';
end $$;

-- ---------------------------------------------------------------------------
-- Revisão e carimbo de data em TODA escrita, inclusive importação feita direto
-- na tabela (fora da vof_gravar).
-- ---------------------------------------------------------------------------
create or replace function public.vof_versionar_registro() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.revision := old.revision + 1;
    if new.registro is distinct from old.registro and new.mutation_id is not distinct from old.mutation_id then
      new.mutation_id := null;
    end if;
  else
    new.revision := 1;
  end if;
  new.atualizado_em := clock_timestamp();
  return new;
end $$;
revoke all on function public.vof_versionar_registro() from public, anon, authenticated;
drop trigger if exists vof_versao_registro on public.vof_registros;
create trigger vof_versao_registro before insert or update on public.vof_registros
  for each row execute function public.vof_versionar_registro();

-- Contador "rev" (global e por coleção): a tela pergunta "mudou algo?" antes de
-- baixar a coleção inteira.
create or replace function public.vof_marcar_revisao() returns trigger
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if tg_table_name = 'vof_config_global' then c := 'cfg'; else c := new.colecao; end if;
  insert into public.vof_meta(chave, valor) values ('rev', '{"rev":0,"porColecao":{}}')
    on conflict (chave) do nothing;
  -- Bloqueio da linha e atualização no mesmo comando: duas coleções gravando ao
  -- mesmo tempo não perdem a revisão uma da outra.
  update public.vof_meta set valor = jsonb_build_object(
    'rev', coalesce((valor->>'rev')::bigint, 0) + 1,
    'porColecao', coalesce(valor->'porColecao', '{}') || jsonb_build_object(c, coalesce((valor->>'rev')::bigint, 0) + 1)
  ), atualizado_em = clock_timestamp() where chave = 'rev';
  return new;
end $$;
revoke all on function public.vof_marcar_revisao() from public, anon, authenticated;
drop trigger if exists vof_rev_registros on public.vof_registros;
create trigger vof_rev_registros after insert or update on public.vof_registros
  for each row execute function public.vof_marcar_revisao();
drop trigger if exists vof_rev_config on public.vof_config_global;
create trigger vof_rev_config after insert or update on public.vof_config_global
  for each row execute function public.vof_marcar_revisao();

-- ---------------------------------------------------------------------------
-- Gravação atômica com revisão otimista. Quem pode gravar o quê é conferido
-- ANTES, na vof-sync (papel do crachá); aqui mora a integridade.
-- A lista de coleções abaixo é conferida contra regras.mjs pelos testes.
-- ---------------------------------------------------------------------------
create or replace function public.vof_gravar(p_colecao text, p_id text, p_registro jsonb, p_acao text,
                                             p_expected bigint default null, p_mutation text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare atual public.vof_registros%rowtype; conteudo jsonb; arq boolean;
begin
  if p_colecao not in ('turmas','empresas','diagnosticos','planos','salas','conteudo') or coalesce(p_id, '') = '' then
    raise exception 'Registro inválido';
  end if;
  if p_acao not in ('upsert','delete','restore') then raise exception 'Ação inválida'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vof:' || p_colecao || ':' || p_id, 0));
  select * into atual from public.vof_registros where colecao = p_colecao and id = p_id for update;
  -- O mesmo envio repetido (resposta perdida na rede) devolve o que já foi gravado.
  if p_mutation is not null and atual.mutation_id = p_mutation then
    return jsonb_build_object('ok', true, 'revision', atual.revision, 'registro', atual.registro, 'apagado', atual.apagado);
  end if;
  if p_expected is not null and p_expected <> coalesce(atual.revision, 0) then
    raise exception 'Registro alterado por outra pessoa' using errcode = '40001';
  end if;
  if p_acao = 'upsert' then
    -- Um envio antigo, feito offline, não ressuscita um item arquivado.
    if atual.apagado then raise exception 'Item arquivado' using errcode = '40001'; end if;
    if jsonb_typeof(p_registro) <> 'object' or p_registro->>'id' is distinct from p_id then
      raise exception 'Conteúdo inválido';
    end if;
    conteudo := p_registro - '_serverRevision' - '_apagado'; arq := false;
  else
    if atual.id is null then raise exception 'Item não encontrado' using errcode = '40001'; end if;
    if p_acao = 'restore' and (atual.registro - 'id' - '_apagado' - 'atualizadoEm') = '{}'::jsonb then
      raise exception 'Registro antigo sem conteúdo; recuperar a cópia de segurança' using errcode = '40001';
    end if;
    -- Arquivar guarda o conteúdo inteiro: restaurar não depende de backup.
    conteudo := atual.registro - '_apagado'; arq := p_acao = 'delete';
  end if;
  conteudo := conteudo || jsonb_build_object('atualizadoEm', clock_timestamp());
  insert into public.vof_registros(colecao, id, registro, apagado, atualizado_em, revision, mutation_id)
    values (p_colecao, p_id, conteudo, arq, clock_timestamp(), coalesce(atual.revision, 0) + 1, p_mutation)
    on conflict (colecao, id) do update
      set registro = excluded.registro, apagado = excluded.apagado, atualizado_em = excluded.atualizado_em,
          revision = excluded.revision, mutation_id = excluded.mutation_id
    returning * into atual;
  return jsonb_build_object('ok', true, 'revision', atual.revision, 'registro', atual.registro, 'apagado', atual.apagado);
end $$;
revoke all on function public.vof_gravar(text, text, jsonb, text, bigint, text) from public, anon, authenticated;
grant execute on function public.vof_gravar(text, text, jsonb, text, bigint, text) to service_role;

-- Config por patch: só os campos enviados mudam; omitir um campo não o apaga.
create or replace function public.vof_configurar(p_patch jsonb, p_anterior jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare atual jsonb; k text;
begin
  if jsonb_typeof(p_patch) <> 'object' then raise exception 'Configuração inválida'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vof:cfg', 0));
  select config into atual from public.vof_config_global where id = true for update;
  atual := coalesce(atual, '{}');
  -- Compara só os campos editados: mudanças independentes feitas por outra pessoa ficam.
  if p_anterior is not null then
    for k in select jsonb_object_keys(p_patch) loop
      if atual->k is distinct from p_anterior->k then
        raise exception 'Configuração alterada' using errcode = '40001';
      end if;
    end loop;
  end if;
  atual := atual || p_patch;
  insert into public.vof_config_global(id, config, atualizado_em) values (true, atual, clock_timestamp())
    on conflict (id) do update set config = excluded.config, atualizado_em = excluded.atualizado_em;
  return jsonb_build_object('ok', true, 'config', atual);
end $$;
revoke all on function public.vof_configurar(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.vof_configurar(jsonb, jsonb) to service_role;
