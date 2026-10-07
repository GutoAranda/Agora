import Dexie, { type EntityTable } from 'dexie'
import { uuid } from '../lib/uuid'

/* ==========================================================================
   Modelo de dados do Agora (versão enxuta).
   Três coisas só: o que fazer (itens), sessões de foco e ajustes.
   Dias são 'yyyy-MM-dd'. Horários são 'HH:mm'.
   ========================================================================== */

export interface Item {
  id?: string
  title: string
  /** Dia em que a coisa acontece. null = "algum dia" (sem data). */
  day: string | null
  /** Horário opcional. Com horário, vira compromisso. */
  time?: string
  /** Quanto tempo deve levar (min). */
  minutes?: number
  /** A menor ação que começa isso. */
  firstStep?: string
  /** Dias da semana em que se repete (0 = domingo). Vazio = não repete. */
  repeat?: number[]
  /** Itens que se repetem: dias em que foi feito / pulado. */
  doneOn?: string[]
  skipOn?: string[]
  /** Trajeto: minutos de ida e de volta, e como vai (ex.: metrô, carro). */
  travelTo?: number
  travelBack?: number
  travelHow?: string
  done: boolean
  doneAt?: string
  createdAt: string
  updatedAt?: string
}

export interface FocusSession {
  id?: string
  day: string
  startedAt: string
  minutes: number
  itemId?: string
  title?: string
  updatedAt?: string
}

export interface Settings {
  id: string // sempre '1'
  name: string
  bedTime: string
  wakeTime: string
  focusMin: number
  breakMin: number
  longBreakMin: number
  roundsUntilLong: number
  sound: boolean
  /** Dia em que "dia difícil" foi ligado. */
  hardDay?: string
  /** Último dia fechado à noite. */
  closedDay?: string
  updatedAt?: string
}

export const DEFAULT_SETTINGS: Settings = {
  id: '1',
  name: '',
  bedTime: '01:30',
  wakeTime: '08:00',
  focusMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  roundsUntilLong: 4,
  sound: true,
}

/** Lápide: registro apagado localmente, ainda não enviado ao servidor. */
export interface Tombstone {
  id: string
  tbl: string
  at: string
}

export interface SyncMeta {
  key: 'meta'
  lastPush: string
  lastPull: string
}

/** Tabelas que sincronizam com a nuvem. */
export const SYNCED_TABLES = ['settings', 'items', 'focus'] as const

class AgoraDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>
  items!: EntityTable<Item, 'id'>
  focus!: EntityTable<FocusSession, 'id'>
  tombstones!: EntityTable<Tombstone, 'id'>
  syncMeta!: EntityTable<SyncMeta, 'key'>

  constructor() {
    // Banco novo: a versão anterior (com áreas e módulos) fica para trás.
    super('agora-enxuto')
    this.version(1).stores({
      settings: 'id',
      items: 'id, day, done, createdAt',
      focus: 'id, day, itemId',
      tombstones: 'id, tbl',
      syncMeta: 'key',
    })
  }
}

export const db = new AgoraDB()

/* ---------- Hooks de sincronização ---------- */

let remoteApplying = false
let changeListener: (() => void) | null = null

export function setRemoteApplying(v: boolean): void {
  remoteApplying = v
}

export function setChangeListener(fn: (() => void) | null): void {
  changeListener = fn
}

function noteChange(): void {
  if (!remoteApplying && changeListener) changeListener()
}

for (const name of SYNCED_TABLES) {
  const table = db.table(name)
  table.hook('creating', function (_primKey, obj) {
    const o = obj as { id?: string; updatedAt?: string }
    if (!o.id) o.id = uuid()
    if (!remoteApplying || !o.updatedAt) o.updatedAt = new Date().toISOString()
    this.onsuccess = () => noteChange()
    return o.id
  })
  table.hook('updating', function (mods) {
    if (remoteApplying) return undefined
    this.onsuccess = () => noteChange()
    return { ...(mods as Record<string, unknown>), updatedAt: new Date().toISOString() }
  })
  table.hook('deleting', function (primKey) {
    if (remoteApplying) return
    const id = String(primKey)
    void Dexie.ignoreTransaction(() => db.tombstones.put({ id, tbl: name, at: new Date().toISOString() }))
    this.onsuccess = () => noteChange()
  })
}

/* ---------- Ajustes ---------- */

export async function ensureSettings(): Promise<Settings> {
  const s = await db.settings.get('1')
  if (s) return { ...DEFAULT_SETTINGS, ...s, id: '1' }
  await db.settings.put(DEFAULT_SETTINGS)
  return DEFAULT_SETTINGS
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const s = await ensureSettings()
  await db.settings.put({ ...s, ...patch, id: '1' })
}

/* ---------- Itens: regras simples ---------- */

export function appliesOn(item: Item, day: string, weekday: number): boolean {
  if (item.repeat?.length) return item.repeat.includes(weekday) && !(item.skipOn ?? []).includes(day)
  return item.day === day
}

export function isDoneOn(item: Item, day: string): boolean {
  return item.repeat?.length ? (item.doneOn ?? []).includes(day) : item.done
}

/** Ordem do dia: com horário primeiro (por hora), depois sem horário (por criação). */
export function byDayOrder(a: Item, b: Item): number {
  if (a.time && b.time) return a.time.localeCompare(b.time)
  if (a.time) return -1
  if (b.time) return 1
  return a.createdAt.localeCompare(b.createdAt)
}

export async function markDone(item: Item, day: string, done = true): Promise<void> {
  if (item.repeat?.length) {
    const set = new Set(item.doneOn ?? [])
    if (done) set.add(day)
    else set.delete(day)
    await db.items.update(item.id!, { doneOn: [...set] })
  } else {
    await db.items.update(item.id!, { done, doneAt: done ? new Date().toISOString() : undefined })
  }
}

/** "Mais tarde": sem culpa. Item avulso vai para amanhã; repetido só sai de hoje. */
export async function moveLater(item: Item, today: string, tomorrow: string): Promise<void> {
  if (item.repeat?.length) {
    await db.items.update(item.id!, { skipOn: [...new Set([...(item.skipOn ?? []), today])] })
  } else {
    await db.items.update(item.id!, { day: tomorrow })
  }
}

/** Coisas avulsas de dias passados que ficaram abertas vão para "algum dia". Nada acumula em vermelho. */
export async function sweepPast(today: string): Promise<number> {
  const open = await db.items.filter((i) => !i.done && !i.repeat?.length && i.day !== null && i.day < today).toArray()
  for (const i of open) await db.items.update(i.id!, { day: null })
  return open.length
}

/* ---------- Backup ---------- */

export async function exportAll(): Promise<string> {
  const out: Record<string, unknown[]> = {}
  for (const name of SYNCED_TABLES) out[name] = await db.table(name).toArray()
  return JSON.stringify({ app: 'agora', version: 2, exportedAt: new Date().toISOString(), data: out }, null, 2)
}

export async function importAll(json: string): Promise<void> {
  const parsed = JSON.parse(json) as { app?: string; data?: Record<string, unknown[]> }
  if (parsed.app !== 'agora' || !parsed.data) throw new Error('Arquivo não é um backup do Agora.')
  const data = parsed.data
  await db.transaction('rw', SYNCED_TABLES.map((n) => db.table(n)), async () => {
    for (const name of SYNCED_TABLES) {
      const rows = data[name]
      if (Array.isArray(rows) && rows.length) await db.table(name).bulkPut(rows as never[])
    }
  })
}
