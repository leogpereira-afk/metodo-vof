-- Aditiva: mantém mensagens, fatos, credenciais e ações existentes.
alter table public.badboy_pendentes add column estado text not null default 'preparado'
 check (estado in ('preparado','executando','concluido','falhou','incerto'));
alter table public.badboy_pendentes add column reservado_em timestamptz;
update public.badboy_pendentes set estado=case when resultado like 'erro:%' or resultado like 'recusad%' then 'falhou' when resultado is null then 'incerto' else 'concluido' end where executado_em is not null;

create table public.badboy_fila(
 id bigint generated always as identity primary key,
 chave text not null unique, chat_id bigint not null, payload jsonb not null,
 estado text not null default 'aguardando' check(estado in ('aguardando','executando','concluido','falhou','incerto')),
 criado_em timestamptz not null default now(), iniciado_em timestamptz, finalizado_em timestamptz,
 erro text
);
create index badboy_fila_pendentes on public.badboy_fila(estado,id);
create unique index badboy_fila_chat_executando on public.badboy_fila(chat_id) where estado='executando';

create table public.badboy_tarefas(
 id bigint generated always as identity primary key,
 titulo text not null check(length(titulo) between 1 and 300),
 assunto text not null default '', responsavel text not null default 'Don Boy',
 prazo date, estado text not null default 'aberta' check(estado in ('aberta','aguardando','concluida','cancelada')),
 proxima_acao text not null default '', evidencia text not null default '',
 atualizado_em timestamptz not null default now()
);
create table public.badboy_turnos(
 id uuid primary key, chat_id bigint not null, estado text not null default 'gerando',
 iniciado_em timestamptz not null default now(), finalizado_em timestamptz,
 resposta text, consultas jsonb, erro text,
 modelo text, custo_usd numeric(12,6), duracao_ms bigint
);

alter table public.badboy_fila enable row level security;
alter table public.badboy_tarefas enable row level security;
alter table public.badboy_turnos enable row level security;
revoke all on public.badboy_fila,public.badboy_tarefas,public.badboy_turnos from public,anon,authenticated;
grant select,insert,update on public.badboy_fila,public.badboy_tarefas,public.badboy_turnos to service_role;
grant usage on sequence public.badboy_fila_id_seq,public.badboy_tarefas_id_seq to service_role;

create function public.badboy_reservar_trabalho()
returns setof public.badboy_fila language plpgsql security invoker set search_path='' as $$
declare escolhido bigint;
begin
 -- Curta trava global na reserva; a execução não mantém conexão nem transação.
 perform pg_advisory_xact_lock(83001926);
 -- Timeout não é sucesso nem autorização para repetir efeitos externos.
 update public.badboy_fila set estado='incerto',erro='Execução interrompida; conferir efeitos antes de repetir.',finalizado_em=now()
 where estado='executando' and iniciado_em < now()-interval '15 minutes';
 select f.id into escolhido from public.badboy_fila f
 where f.estado='aguardando' and not exists(select 1 from public.badboy_fila r where r.chat_id=f.chat_id and r.estado='executando')
 order by f.id limit 1 for update skip locked;
 if escolhido is null then return; end if;
 return query update public.badboy_fila set estado='executando',iniciado_em=now() where id=escolhido returning *;
end $$;
create function public.badboy_reservar_acao(p_id bigint,p_tipo text)
returns table(tipo text,dados jsonb) language sql security invoker set search_path='' as $$
 update public.badboy_pendentes set estado='executando',reservado_em=now()
 where id=p_id and badboy_pendentes.tipo=p_tipo and estado='preparado' and criado_em > now()-interval '10 minutes'
 returning badboy_pendentes.tipo,badboy_pendentes.dados;
$$;
revoke all on function public.badboy_reservar_trabalho(),public.badboy_reservar_acao(bigint,text) from public,anon,authenticated;
grant execute on function public.badboy_reservar_trabalho(),public.badboy_reservar_acao(bigint,text) to service_role;

alter table public.badboy_pendentes drop constraint badboy_pendentes_tipo_check;
alter table public.badboy_pendentes add constraint badboy_pendentes_tipo_check check(tipo in ('email','fatos','compra','central'));

-- Mensagem e fila entram na mesma transação. Reentrega do Telegram não
-- duplica o histórico; mensagens seguidas já ficam visíveis ao agrupador.
create function public.badboy_enfileirar(p_chave text,p_chat_id bigint,p_payload jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare trabalho bigint; mensagem bigint; conteudo text;
begin
 insert into public.badboy_fila(chave,chat_id,payload)
 values(p_chave,p_chat_id,p_payload-'_mensagem_id') on conflict(chave) do nothing returning id into trabalho;
 if trabalho is null then return; end if;
 conteudo=p_payload#>>'{message,text}';
 if conteudo is not null and left(conteudo,1)<>'/' then
  insert into public.badboy_mensagens(chat_id,papel,conteudo) values(p_chat_id,'user',conteudo) returning id into mensagem;
  update public.badboy_fila set payload=jsonb_set(payload,'{_mensagem_id}',to_jsonb(mensagem)) where id=trabalho;
 end if;
end $$;
revoke all on function public.badboy_enfileirar(text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.badboy_enfileirar(text,bigint,jsonb) to service_role;
