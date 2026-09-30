-- Don Boy: ações que esperam o botão de confirmação do dono.
--
-- O Claude só PREPARA a ação (por enquanto, um e-mail): ela fica aqui até o
-- dono tocar em "Enviar" no Telegram. A execução reserva a linha de forma
-- atômica (executado_em passa de nulo para agora), então dois toques no
-- mesmo botão não enviam duas vezes.

create table public.badboy_pendentes (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('email')),
  dados jsonb not null,
  criado_em timestamptz not null default now(),
  executado_em timestamptz,
  resultado text
);
comment on table public.badboy_pendentes is 'Ações do Don Boy que esperam o botão de confirmação do dono. Só o servidor lê e grava.';

alter table public.badboy_pendentes enable row level security;
revoke all on public.badboy_pendentes from public, anon, authenticated;
grant select, insert, update on public.badboy_pendentes to service_role;
grant usage on sequence public.badboy_pendentes_id_seq to service_role;
