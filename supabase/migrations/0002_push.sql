-- Agora: avisos com o app fechado (pomodoro).
-- Cada linha é um aviso agendado para um aparelho. O app agenda ao começar um
-- pomodoro e cancela ao pausar. A função agora-push envia na hora certa.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.push_jobs (
  id         bigserial primary key,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  tag        text not null,
  title      text not null,
  body       text not null default '',
  url        text,
  send_at    timestamptz not null,
  claim      uuid,
  sent_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (endpoint, tag)
);

create index if not exists push_jobs_due_idx on public.push_jobs (send_at) where sent_at is null;

-- Sem políticas: ninguém lê ou escreve direto. Só pelas funções abaixo.
alter table public.push_jobs enable row level security;

create or replace function public.schedule_push(
  sub jsonb, p_tag text, p_title text, p_body text, p_send_at timestamptz, p_url text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_send_at > now() + interval '4 hours' then
    raise exception 'aviso muito distante';
  end if;
  if coalesce(sub->>'endpoint', '') not like 'https://%' then
    raise exception 'inscrição inválida';
  end if;
  insert into push_jobs (endpoint, p256dh, auth, tag, title, body, url, send_at)
  values (sub->>'endpoint', sub->'keys'->>'p256dh', sub->'keys'->>'auth',
          left(p_tag, 40), left(p_title, 120), left(coalesce(p_body, ''), 240), left(p_url, 300), p_send_at)
  on conflict (endpoint, tag) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, title = excluded.title, body = excluded.body,
        url = excluded.url, send_at = excluded.send_at, claim = null, sent_at = null;
end $$;

create or replace function public.cancel_push(p_endpoint text, p_tag text) returns void
language sql security definer set search_path = public as $$
  delete from push_jobs where endpoint = p_endpoint and tag = p_tag;
$$;

grant execute on function public.schedule_push(jsonb, text, text, text, timestamptz, text) to anon, authenticated;
grant execute on function public.cancel_push(text, text) to anon, authenticated;
