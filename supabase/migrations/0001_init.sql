-- Agora: esquema de sincronização.
-- Modelo: uma tabela genérica de registros por usuário. Cada linha espelha um
-- registro local (IndexedDB) do app: tabela de origem + conteúdo em JSON.
-- O app consulta os dados localmente; o servidor é a fonte de verdade para
-- sincronizar celular e PC. Last-writer-wins por updated_at.

create table if not exists public.records (
  id          text not null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tbl         text not null,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false,
  primary key (user_id, id)
);

create index if not exists records_user_updated_idx on public.records (user_id, updated_at);
create index if not exists records_user_tbl_idx on public.records (user_id, tbl);

alter table public.records enable row level security;

drop policy if exists "records: owner select" on public.records;
create policy "records: owner select" on public.records
  for select using (auth.uid() = user_id);

drop policy if exists "records: owner insert" on public.records;
create policy "records: owner insert" on public.records
  for insert with check (auth.uid() = user_id);

drop policy if exists "records: owner update" on public.records;
create policy "records: owner update" on public.records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "records: owner delete" on public.records;
create policy "records: owner delete" on public.records
  for delete using (auth.uid() = user_id);

-- Realtime: o PC recebe na hora o que o celular mudou (e vice-versa).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end $$;

-- Função de upsert em lote (uma chamada por sincronização).
create or replace function public.upsert_records(payload jsonb)
returns void
language plpgsql
security invoker
as $$
begin
  insert into public.records (id, user_id, tbl, data, updated_at, deleted)
  select
    r->>'id',
    auth.uid(),
    r->>'tbl',
    coalesce(r->'data', '{}'::jsonb),
    (r->>'updated_at')::timestamptz,
    coalesce((r->>'deleted')::boolean, false)
  from jsonb_array_elements(payload) as r
  on conflict (user_id, id) do update
    set tbl = excluded.tbl,
        data = excluded.data,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted
    where excluded.updated_at >= public.records.updated_at;
end;
$$;

grant execute on function public.upsert_records(jsonb) to authenticated;
