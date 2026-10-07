-- Agora: chama a função agora-push a cada minuto.
-- Troque SEU_CRON_SECRET pelo mesmo valor do segredo CRON_SECRET da função.
-- (A tela Ajustes → Avisos com o app fechado mostra este SQL já preenchido.)

select cron.unschedule('agora-push') where exists (select 1 from cron.job where jobname = 'agora-push');

select cron.schedule('agora-push', '* * * * *', $cron$
  select net.http_post(
    url := 'https://ouahboahemavcoemthaj.supabase.co/functions/v1/agora-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'SEU_CRON_SECRET'),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
$cron$);
