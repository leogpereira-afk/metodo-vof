-- Apenas cadastros pessoais selecionados; nenhuma escrita em bancos/ERP.
create table public.donboy_central_operacoes(
 chave text primary key, pedido jsonb not null, resultado jsonb not null, criado_em timestamptz not null default now()
);
alter table public.donboy_central_operacoes enable row level security;
revoke all on public.donboy_central_operacoes from public,anon,authenticated;
grant select,insert on public.donboy_central_operacoes to service_role;
create function public.badboy_central_aplicar(p_chave text,p_tipo text,p_id text,p_esperado jsonb,p_dados jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare estado jsonb; item jsonb; novo jsonb; lista jsonb; indice int; colecao text; permitidos text[]; registro record; versao bigint; pedido jsonb; resultado jsonb;
begin
 if p_tipo is null or p_tipo not in ('viagem','hotel','demanda') then raise exception 'tipo não permitido'; end if;
 if p_chave is null or p_id is null or p_dados is null or length(p_chave) not between 1 and 150 or length(p_id) not between 1 and 150 or jsonb_typeof(p_dados)<>'object' then raise exception 'pedido inválido'; end if;
 pedido=jsonb_build_object('tipo',p_tipo,'id',p_id,'esperado',p_esperado,'dados',p_dados);
 select dados,mt into estado,versao from public.leo_estado where id=true for update;
 if not found then raise exception 'Central não encontrada'; end if;
 select * into registro from public.donboy_central_operacoes where chave=p_chave;
 if found then
  if registro.pedido<>pedido then raise exception 'chave reutilizada com outro conteúdo'; end if;
  return registro.resultado;
 end if;
 colecao=case when p_tipo='demanda' then 'demandas' else 'viagens' end;
 permitidos=case p_tipo
 when 'hotel' then array['id','nome','entrada','saida','reserva','valor','endereco','telefone','cafe','horaEnt','horaSai','obs']
 when 'viagem' then array['id','cidade','ida','volta','tipo','status','obs','internacional','transporte','evento']
 else array['id','titulo','prazo','prioridade','status','obs'] end;
 if exists(select 1 from jsonb_object_keys(p_dados) k where not(k=any(permitidos))) then raise exception 'campo não permitido'; end if;
 if p_dados ? 'valor' and (jsonb_typeof(p_dados->'valor')<>'number' or (p_dados->>'valor')::numeric<0) then raise exception 'valor inválido'; end if;
 if p_dados ? 'entrada' then perform (p_dados->>'entrada')::date; end if;
 if p_dados ? 'saida' then perform (p_dados->>'saida')::date; end if;
 if p_tipo='hotel' and (coalesce(p_dados->>'nome','')='' or coalesce(p_dados->>'id','')='' or coalesce(p_dados->>'entrada','')='' or coalesce(p_dados->>'saida','')='' or (p_dados->>'saida')::date <= (p_dados->>'entrada')::date) then raise exception 'hotel precisa de nome, id e período válido'; end if;
 lista=coalesce(estado->colecao,'[]'::jsonb);
 if (select count(*) from jsonb_array_elements(lista) v where v->>'id'=p_id)>1 then raise exception 'id duplicado na Central'; end if;
 select (n-1)::int,v into indice,item from jsonb_array_elements(lista) with ordinality e(v,n) where v->>'id'=p_id;
 if coalesce(item,'null'::jsonb)<>coalesce(p_esperado,'null'::jsonb) then raise exception 'conflito: cadastro mudou, releia e peça nova confirmação'; end if;
 if p_tipo='hotel' then
  if item is null then raise exception 'viagem não encontrada'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(item->'hoteis','[]')) h where h->>'id'=p_dados->>'id') then raise exception 'hotel já cadastrado'; end if;
  if jsonb_array_length(coalesce(item->'hoteis','[]'))=0 and coalesce(item->>'hotel','')<>'' then
   item=jsonb_set(item,'{hoteis}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'nome',item->>'hotel')));
  end if;
  novo=jsonb_set(item,'{hoteis}',coalesce(item->'hoteis','[]')||jsonb_build_array(p_dados));
  novo=jsonb_set(novo,'{hotel}',to_jsonb((select string_agg(h->>'nome',' · ' order by n) from jsonb_array_elements(novo->'hoteis') with ordinality e(h,n))));
 else
  if p_dados ? 'id' and p_dados->>'id'<>p_id then raise exception 'id não pode mudar'; end if;
  novo=coalesce(item,case when p_tipo='demanda' then jsonb_build_object('status','Aberta','prioridade','Média','criada',(now() at time zone 'America/Sao_Paulo')::date::text,'concluidoEm','') else jsonb_build_object('status','Em Planejamento') end)||p_dados||jsonb_build_object('id',p_id);
  if p_tipo='viagem' and nullif(novo->>'ida','') is not null and nullif(novo->>'volta','') is not null and (novo->>'volta')::date < (novo->>'ida')::date then raise exception 'período inválido: volta anterior à ida'; end if;
  if p_tipo='demanda' then
   if novo->>'status' not in ('Aberta','Fazendo','Parada','Concluída') then raise exception 'status inválido'; end if;
   if novo->>'prioridade' not in ('Alta','Média','Baixa') then raise exception 'prioridade inválida'; end if;
   if p_dados ? 'status' then novo=jsonb_set(novo,'{concluidoEm}',to_jsonb(case when novo->>'status'='Concluída' then (now() at time zone 'America/Sao_Paulo')::date::text else '' end)); end if;
  end if;
  if p_tipo='viagem' and coalesce(novo->>'cidade','')='' then raise exception 'cidade obrigatória'; end if;
  if p_tipo='demanda' and coalesce(novo->>'titulo','')='' then raise exception 'título obrigatório'; end if;
 end if;
 if indice is null then lista=lista||jsonb_build_array(novo); else lista=jsonb_set(lista,array[indice::text],novo); end if;
 versao=greatest(versao+1,(extract(epoch from clock_timestamp())*1000)::bigint);
 update public.leo_estado set dados=jsonb_set(estado,array[colecao],lista),mt=versao,atualizado_em=now() where id=true;
 resultado=jsonb_build_object('gravado',true,'origem','Central do Léo','tipo',p_tipo,'id',p_id,'item',novo,'mt',versao);
 insert into public.donboy_central_operacoes(chave,pedido,resultado) values(p_chave,pedido,resultado);
 return resultado;
end $$;
revoke all on function public.badboy_central_aplicar(text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.badboy_central_aplicar(text,text,text,jsonb,jsonb) to service_role;
-- Defesa adicional: o schema já é privado; a função também fica explícita.
-- Executar após as migrações de leitura nos dois projetos.
