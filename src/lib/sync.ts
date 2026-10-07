import type { RealtimeChannel } from '@supabase/supabase-js'
import { db, SYNCED_TABLES, setChangeListener, setRemoteApplying, type SyncMeta } from '../db/schema'
import { supabase } from './supabase'

/* ==========================================================================
   Sincronização local-first.
   - Toda linha local tem id (uuid) e updatedAt (ISO). Apagar gera uma lápide.
   - push: envia linhas com updatedAt > lastPush e lápides pendentes.
   - pull: baixa linhas com updated_at > lastPull e aplica (last-writer-wins).
   - Realtime: ao receber mudança de outro aparelho, faz pull.
   ========================================================================== */

export type SyncState = 'local' | 'offline' | 'idle' | 'syncing' | 'error' | 'signed-out'

type Listener = (s: SyncState, detail?: string) => void
const listeners = new Set<Listener>()
let state: SyncState = supabase ? 'signed-out' : 'local'
let detail = ''
let channel: RealtimeChannel | null = null
let pulling = false
let timer: number | null = null


function setState(s: SyncState, d = '') {
  state = s
  detail = d
  for (const l of listeners) l(s, d)
}

export function getSyncState(): { state: SyncState; detail: string } {
  return { state, detail }
}

export function onSyncState(l: Listener): () => void {
  listeners.add(l)
  l(state, detail)
  return () => listeners.delete(l)
}

async function meta(): Promise<SyncMeta> {
  return (await db.syncMeta.get('meta')) ?? { key: 'meta', lastPush: '1970-01-01T00:00:00.000Z', lastPull: '1970-01-01T00:00:00.000Z' }
}

interface RemoteRow {
  id: string
  tbl: string
  data: Record<string, unknown>
  updated_at: string
  deleted: boolean
}

export async function push(): Promise<number> {
  if (!supabase) return 0
  const m = await meta()
  const payload: RemoteRow[] = []
  const nowIso = new Date().toISOString()
  for (const name of SYNCED_TABLES) {
    const rows = (await db.table(name).toArray()) as Array<Record<string, unknown> & { id: string; updatedAt?: string }>
    for (const r of rows) {
      const u = r.updatedAt ?? nowIso
      if (u > m.lastPush) payload.push({ id: r.id, tbl: name, data: r, updated_at: u, deleted: false })
    }
  }
  const tombs = await db.tombstones.toArray()
  for (const t of tombs) payload.push({ id: t.id, tbl: t.tbl, data: {}, updated_at: t.at, deleted: true })
  if (!payload.length) return 0
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.rpc('upsert_records', { payload: payload.slice(i, i + 500) })
    if (error) throw new Error(error.message)
  }
  await db.tombstones.clear()
  await db.syncMeta.put({ ...m, lastPush: nowIso })
  return payload.length
}

export async function pull(): Promise<number> {
  if (!supabase) return 0
  const m = await meta()
  let applied = 0
  let since = m.lastPull
  let newest = since
  // Paginação por updated_at
  for (;;) {
    const { data, error } = await supabase
      .from('records')
      .select('id, tbl, data, updated_at, deleted')
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(1000)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as RemoteRow[]
    if (!rows.length) break
    setRemoteApplying(true)
    try {
      await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.tombstones], async () => {
        for (const r of rows) {
          if (!SYNCED_TABLES.includes(r.tbl as (typeof SYNCED_TABLES)[number])) continue
          const table = db.table(r.tbl)
          const local = (await table.get(r.id)) as { updatedAt?: string } | undefined
          if (r.deleted) {
            if (local && (local.updatedAt ?? '') <= r.updated_at) await table.delete(r.id)
          } else if (!local || (local.updatedAt ?? '') < r.updated_at) {
            await table.put({ ...r.data, id: r.id, updatedAt: r.updated_at })
          }
          applied++
        }
      })
    } finally {
      setRemoteApplying(false)
    }
    newest = rows[rows.length - 1].updated_at
    since = newest
    if (rows.length < 1000) break
  }
  await db.syncMeta.put({ ...(await meta()), lastPull: newest })
  return applied
}

export async function syncNow(): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    setState('signed-out')
    return
  }
  if (!navigator.onLine) {
    setState('offline')
    return
  }
  setState('syncing')
  try {
    await push()
    await pull()
    setState('idle', new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
  } catch (e) {
    setState('error', e instanceof Error ? e.message : String(e))
  }
}

function scheduleSync(delayMs = 1500) {
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(() => void syncNow(), delayMs)
}

/** Chamado pelos hooks do Dexie quando algo muda localmente. */
export function noteLocalChange() {
  if (!supabase) return
  scheduleSync()
}

/** Primeira sincronização de um aparelho: baixa tudo e sobe o que existe localmente. */
export async function initialSync(): Promise<void> {
  await syncNow()
}

export async function startSync(): Promise<() => void> {
  if (!supabase) return () => {}
  setChangeListener(noteLocalChange)
  const sb = supabase
  const { data } = await sb.auth.getSession()
  if (!data.session) {
    setState('signed-out')
  } else {
    void syncNow()
  }
  const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
    if (session) {
      void syncNow()
      subscribeRealtime(session.user.id)
    } else {
      setState('signed-out')
      unsubscribeRealtime()
    }
  })
  if (data.session) subscribeRealtime(data.session.user.id)
  const online = () => void syncNow()
  const visible = () => {
    if (document.visibilityState === 'visible') void syncNow()
  }
  window.addEventListener('online', online)
  document.addEventListener('visibilitychange', visible)
  const interval = window.setInterval(() => void syncNow(), 5 * 60 * 1000)
  return () => {
    sub.subscription.unsubscribe()
    window.removeEventListener('online', online)
    document.removeEventListener('visibilitychange', visible)
    window.clearInterval(interval)
    unsubscribeRealtime()
    setChangeListener(null)
  }
}

function subscribeRealtime(userId: string) {
  if (!supabase || channel) return
  channel = supabase
    .channel('records-' + userId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${userId}` }, () => {
      if (!pulling) {
        pulling = true
        window.setTimeout(() => {
          pulling = false
          void syncNow()
        }, 800)
      }
    })
    .subscribe()
}

function unsubscribeRealtime() {
  if (channel && supabase) {
    void supabase.removeChannel(channel)
    channel = null
  }
}

/* ---------- Autenticação ---------- */

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Modo local: Supabase não configurado.'
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? traduz(error.message) : null
}

export async function signUp(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Modo local: Supabase não configurado.'
  const { error } = await supabase.auth.signUp({ email, password })
  return error ? traduz(error.message) : null
}

export async function signOut(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}

export async function currentEmail(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.email ?? null
}

function traduz(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.'
  if (m.includes('already registered')) return 'Esse e-mail já tem conta. Entre com a senha.'
  if (m.includes('password')) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (m.includes('email not confirmed')) return 'Confirme o e-mail antes de entrar (ou desligue a confirmação no Supabase).'
  if (m.includes('rate limit')) return 'Muitas tentativas. Espere um minuto.'
  return msg
}
