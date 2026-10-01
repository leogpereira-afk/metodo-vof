-- Metadados privados: arquivos permanecem no Telegram, sem URLs com token nem base64 no banco.
alter table public.badboy_mensagens add column anexos jsonb not null default '[]'::jsonb check(jsonb_typeof(anexos)='array');
create table public.badboy_midia_uso(
 id bigint generated always as identity primary key,
 tipo text not null check(tipo in ('imagem','transcricao')),
 modelo text not null, uso jsonb not null default '{}', criado_em timestamptz not null default now()
);
alter table public.badboy_midia_uso enable row level security;
revoke all on public.badboy_midia_uso from public,anon,authenticated;
grant select,insert on public.badboy_midia_uso to service_role;
grant usage on sequence public.badboy_midia_uso_id_seq to service_role;
create or replace function public.badboy_enfileirar(p_chave text,p_chat_id bigint,p_payload jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare trabalho bigint; mensagem bigint; conteudo text; anexos_recebidos jsonb;
begin
 insert into public.badboy_fila(chave,chat_id,payload)
 values(p_chave,p_chat_id,p_payload-'_mensagem_id') on conflict(chave) do nothing returning id into trabalho;
 if trabalho is null then return; end if;
 anexos_recebidos=coalesce(p_payload->'_anexos','[]'::jsonb);
 if jsonb_typeof(anexos_recebidos)<>'array' or jsonb_array_length(anexos_recebidos)>3 then raise exception 'Metadados de anexo inválidos'; end if;
 conteudo=coalesce(p_payload#>>'{message,text}',nullif(p_payload#>>'{message,caption}',''));
 if conteudo is null and jsonb_array_length(anexos_recebidos)>0 then
  conteudo=case when anexos_recebidos->0->>'tipo'='audio' then 'Áudio recebido: transcreva e responda ao pedido falado, se houver.' else 'Analise o arquivo enviado e apresente o conteúdo e os pontos principais.' end;
 end if;
 if conteudo is not null and left(conteudo,1)<>'/' then
  insert into public.badboy_mensagens(chat_id,papel,conteudo,anexos) values(p_chat_id,'user',conteudo,anexos_recebidos) returning id into mensagem;
  update public.badboy_fila set payload=jsonb_set(payload,'{_mensagem_id}',to_jsonb(mensagem)) where id=trabalho;
 end if;
end $$;
revoke all on function public.badboy_enfileirar(text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.badboy_enfileirar(text,bigint,jsonb) to service_role;
