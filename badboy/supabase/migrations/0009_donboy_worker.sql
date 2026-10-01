-- Recupera trabalhos aguardando mesmo se o webhook terminar cedo.
select cron.schedule('donboy-processar-fila','* * * * *', $$
 select net.http_post(
 url := 'https://reoghclxripktzpdwhiy.supabase.co/functions/v1/badboy-telegram?acao=processar',
 headers := jsonb_build_object('Content-Type','application/json','x-donboy-token',(select decrypted_secret from vault.decrypted_secrets where name='donboy_ponte_segundo')),
 body := '{}'::jsonb,timeout_milliseconds := 30000);
$$);
-- Mantém o horário e a conexão existentes do briefing.
revoke all on function donboy.consultar(text) from public,anon,authenticated;
grant execute on function donboy.consultar(text) to service_role;
