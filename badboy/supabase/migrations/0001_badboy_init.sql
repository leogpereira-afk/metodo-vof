-- BadBoy: memória persistente (fase 1).
--
-- Acesso SÓ pelo servidor (chave secreta / service_role, que ignora RLS).
-- RLS ligado e sem nenhuma policy: a chave pública (anon) não lê nem escreve.

-- Histórico das conversas. Só texto final: o raciocínio do modelo não é
-- guardado, e o histórico reconstruído a cada turno é sempre o mesmo.
create table public.mensagens (
  id         bigint generated always as identity primary key,
  chat_id    bigint      not null,
  papel      text        not null check (papel in ('user', 'assistant')),
  conteudo   text        not null check (length(conteudo) > 0),
  criada_em  timestamptz not null default now()
);
create index mensagens_chat_id_idx on public.mensagens (chat_id, id);

-- Fatos que a BadBoy sabe sobre o dono. Entram por /lembrar ('comando') ou
-- pela própria conversa, quando o modelo decide salvar ('conversa').
create table public.fatos (
  id         bigint generated always as identity primary key,
  conteudo   text        not null check (length(conteudo) between 1 and 1000),
  origem     text        not null default 'comando' check (origem in ('comando', 'conversa')),
  criado_em  timestamptz not null default now()
);

-- Uma linha por chamada à API do Claude (inclui voltas de ferramenta).
-- custo_usd é calculado no servidor com a tabela de preços do código.
create table public.uso (
  id                   bigint generated always as identity primary key,
  modelo               text          not null,
  input_tokens         integer       not null default 0,
  output_tokens        integer       not null default 0,
  cache_write_tokens   integer       not null default 0,
  cache_read_tokens    integer       not null default 0,
  custo_usd            numeric(12,6) not null default 0,
  criado_em            timestamptz   not null default now()
);
create index uso_criado_em_idx on public.uso (criado_em);

alter table public.mensagens enable row level security;
alter table public.fatos     enable row level security;
alter table public.uso       enable row level security;

-- Resumo do mês corrente no fuso do dono (padrão: horário de Brasília).
create or replace function public.resumo_custo_mes(p_fuso text default 'America/Sao_Paulo')
returns table (
  chamadas            bigint,
  input_tokens        bigint,
  output_tokens       bigint,
  cache_write_tokens  bigint,
  cache_read_tokens   bigint,
  custo_usd           numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*),
    coalesce(sum(u.input_tokens), 0),
    coalesce(sum(u.output_tokens), 0),
    coalesce(sum(u.cache_write_tokens), 0),
    coalesce(sum(u.cache_read_tokens), 0),
    coalesce(sum(u.custo_usd), 0)
  from public.uso u
  where u.criado_em >= (date_trunc('month', now() at time zone p_fuso) at time zone p_fuso);
$$;

-- Função só para o servidor.
revoke execute on function public.resumo_custo_mes(text) from public, anon, authenticated;
