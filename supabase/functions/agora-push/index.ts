// Agora — avisos do pomodoro com o app fechado (Web Push).
// Disparo: pg_cron a cada minuto (supabase/migrations/0003_push_cron.sql).
// Publicar com "Verify JWT" DESLIGADO. A proteção do envio é o cabeçalho
// x-cron-secret, que precisa bater com o segredo CRON_SECRET.
// Segredos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET.
// GET devolve só a chave pública (o app usa para se inscrever).
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-cron-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  if (req.method === 'GET') return Response.json({ publicKey }, { headers: cors })

  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return Response.json({ erro: 'não autorizado' }, { status: 401, headers: cors })
  }

  webpush.setVapidDetails('https://gutoaranda.github.io/Agora/', publicKey, Deno.env.get('VAPID_PRIVATE_KEY')!)
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Pega os avisos que vencem no próximo minuto e marca como "meus".
  const claim = crypto.randomUUID()
  const horizon = new Date(Date.now() + 65_000).toISOString()
  const { data: jobs, error } = await sb
    .from('push_jobs')
    .update({ claim })
    .is('sent_at', null)
    .is('claim', null)
    .lte('send_at', horizon)
    .select()
  if (error) return Response.json({ erro: error.message }, { status: 500, headers: cors })

  let sent = 0
  await Promise.all(
    (jobs ?? []).map(async (j) => {
      // Espera até o segundo exato do fim do pomodoro.
      const wait = new Date(j.send_at).getTime() - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))

      // Se foi pausado ou reagendado enquanto esperava, não envia.
      const { data: cur } = await sb.from('push_jobs').select('claim').eq('id', j.id).maybeSingle()
      if (!cur || cur.claim !== claim) return

      try {
        await webpush.sendNotification(
          { endpoint: j.endpoint, keys: { p256dh: j.p256dh, auth: j.auth } },
          JSON.stringify({ title: j.title, body: j.body, tag: j.tag, url: j.url }),
          { TTL: 600, urgency: 'high' },
        )
        await sb.from('push_jobs').update({ sent_at: new Date().toISOString() }).eq('id', j.id).eq('claim', claim)
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await sb.from('push_jobs').delete().eq('endpoint', j.endpoint)
        else await sb.from('push_jobs').update({ claim: null }).eq('id', j.id)
      }
    }),
  )

  // Faxina: avisos com mais de um dia.
  await sb.from('push_jobs').delete().lt('send_at', new Date(Date.now() - 86_400_000).toISOString())

  return Response.json({ sent }, { headers: cors })
})
