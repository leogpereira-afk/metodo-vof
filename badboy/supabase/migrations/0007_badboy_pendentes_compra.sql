-- Don Boy: o botão de confirmação também envia solicitação de material ao
-- módulo Compras (tipo 'compra'). O Claude só prepara; a solicitação sai
-- quando o dono toca em "Solicitar".

alter table public.badboy_pendentes drop constraint badboy_pendentes_tipo_check;
alter table public.badboy_pendentes add constraint badboy_pendentes_tipo_check check (tipo in ('email', 'fatos', 'compra'));
