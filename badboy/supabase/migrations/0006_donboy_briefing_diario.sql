-- Don Boy: briefing da manhã todo dia às 6h30 de Brasília (9h30 UTC), depois
-- do treino. O pg_cron chama a Edge Function com o token da ponte, lido do
-- Vault na hora (nunca fica escrito aqui). A função responde na hora, monta o
-- briefing em segundo plano e não repete se o de hoje já saiu.

select cron.schedule(
  'donboy-briefing-diario',
  '30 9 * * *',
  $$
  select net.http_post(
    url := 'https://reoghclxripktzpdwhiy.supabase.co/functions/v1/badboy-telegram?rotina=briefing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-donboy-token', (select decrypted_secret from vault.decrypted_secrets where name = 'donboy_ponte_segundo')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
