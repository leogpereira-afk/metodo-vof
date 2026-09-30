-- Don Boy: o botão de confirmação passa a servir também para apagar fatos
-- da memória (repetidos, errados ou substituídos por uma versão corrigida).
-- O Claude só propõe; os fatos somem quando o dono toca em "Apagar".

alter table public.badboy_pendentes drop constraint badboy_pendentes_tipo_check;
alter table public.badboy_pendentes add constraint badboy_pendentes_tipo_check check (tipo in ('email', 'fatos'));
