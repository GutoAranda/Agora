import { db, type Area, type Block, type Recurring, type Reminder, type Settings } from '../db/schema'
import { materializeAround } from './materialize'
import { addDays, dayKey, hhmm, todayKey } from './time'

/* ==========================================================================
   Parser de ICS sem dependências. Cobre o que calendários comuns exportam:
   VEVENT com SUMMARY, DTSTART/DTEND (local, Z ou TZID → tratado como local),
   DESCRIPTION, LOCATION e RRULE semanal (BYDAY, UNTIL, COUNT) ou diária.
   ========================================================================== */

export interface IcsRRule {
  freq: string // WEEKLY | DAILY | MONTHLY | YEARLY ...
  byDay?: number[] // 0 = domingo ... 6 = sábado
  until?: Date
  count?: number
  interval: number
}

export interface IcsEvent {
  uid?: string
  summary: string
  start: Date
  end: Date
  allDay: boolean
  description?: string
  location?: string
  rrule?: IcsRRule
}

interface Prop {
  name: string
  params: Record<string, string>
  value: string
}

/** Junta linhas "dobradas" (continuação começa com espaço ou tab). */
export function unfoldLines(text: string): string[] {
  const raw = text.replace(/^﻿/, '').split(/\r\n|\n|\r/)
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) out[out.length - 1] += line.slice(1)
    else out.push(line)
  }
  return out.filter((l) => l.length > 0)
}

function parseProp(line: string): Prop | null {
  let inQuotes = false
  let idx = -1
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuotes = !inQuotes
    else if (c === ':' && !inQuotes) {
      idx = i
      break
    }
  }
  if (idx < 0) return null
  const head = line.slice(0, idx)
  const value = line.slice(idx + 1)
  const parts = head.split(';')
  const name = parts[0].trim().toUpperCase()
  const params: Record<string, string> = {}
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name, params, value }
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

/** YYYYMMDD, YYYYMMDDTHHMMSS, com Z (UTC) ou com TZID (tratado como local). */
export function parseIcsDate(value: string, params: Record<string, string> = {}): { date: Date; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  const allDay = params.VALUE === 'DATE' || h === undefined
  if (allDay) return { date: new Date(+y, +mo - 1, +d, 0, 0, 0, 0), allDay: true }
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0))), allDay: false }
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +(s ?? 0), 0), allDay: false }
}

/** Duração ISO 8601 simplificada (PnW / PnD / PTnHnMnS) em minutos. */
function parseDuration(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim())
  if (!m) return null
  const [, sign, w, d, h, mi, s] = m
  const min = (+(w ?? 0)) * 7 * 24 * 60 + (+(d ?? 0)) * 24 * 60 + (+(h ?? 0)) * 60 + (+(mi ?? 0)) + Math.round((+(s ?? 0)) / 60)
  return sign === '-' ? -min : min
}

const BYDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

export function parseRRule(v: string): IcsRRule | undefined {
  const r: IcsRRule = { freq: '', interval: 1 }
  for (const part of v.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const k = part.slice(0, eq).toUpperCase()
    const val = part.slice(eq + 1)
    if (k === 'FREQ') r.freq = val.toUpperCase()
    else if (k === 'BYDAY') {
      const days = val
        .split(',')
        .map((d) => BYDAY[d.replace(/^[+-]?\d+/, '').toUpperCase()])
        .filter((n): n is number => n !== undefined)
      if (days.length) r.byDay = [...new Set(days)].sort()
    } else if (k === 'UNTIL') {
      const p = parseIcsDate(val)
      if (p) r.until = p.date
    } else if (k === 'COUNT') {
      const n = parseInt(val, 10)
      if (n > 0) r.count = n
    } else if (k === 'INTERVAL') {
      r.interval = Math.max(1, parseInt(val, 10) || 1)
    }
  }
  return r.freq ? r : undefined
}

export function parseICS(text: string): IcsEvent[] {
  const lines = unfoldLines(text)
  const events: IcsEvent[] = []
  let cur: (Partial<IcsEvent> & { durationMin?: number; cancelled?: boolean }) | null = null
  let nested = 0 // componentes dentro do VEVENT (VALARM) são ignorados

  const finish = () => {
    if (!cur || cur.cancelled || !cur.start) return
    const allDay = cur.allDay ?? false
    let end = cur.end
    if (!end) {
      if (cur.durationMin !== undefined) end = new Date(cur.start.getTime() + cur.durationMin * 60000)
      else end = new Date(cur.start.getTime() + (allDay ? 24 * 60 : 60) * 60000)
    }
    if (end <= cur.start) end = new Date(cur.start.getTime() + 60000 * (allDay ? 24 * 60 : 30))
    events.push({
      uid: cur.uid,
      summary: cur.summary?.trim() || 'Sem título',
      start: cur.start,
      end,
      allDay,
      description: cur.description || undefined,
      location: cur.location || undefined,
      rrule: cur.rrule,
    })
  }

  for (const line of lines) {
    const p = parseProp(line)
    if (!p) continue
    const comp = p.value.trim().toUpperCase()
    if (p.name === 'BEGIN') {
      if (comp === 'VEVENT' && nested === 0) cur = {}
      else if (cur) nested++
      continue
    }
    if (p.name === 'END') {
      if (cur && nested > 0) nested--
      else if (comp === 'VEVENT' && cur) {
        finish()
        cur = null
      }
      continue
    }
    if (!cur || nested > 0) continue
    switch (p.name) {
      case 'UID':
        cur.uid = p.value.trim()
        break
      case 'SUMMARY':
        cur.summary = unescapeText(p.value)
        break
      case 'DESCRIPTION':
        cur.description = unescapeText(p.value).slice(0, 500)
        break
      case 'LOCATION':
        cur.location = unescapeText(p.value)
        break
      case 'DTSTART': {
        const d = parseIcsDate(p.value, p.params)
        if (d) {
          cur.start = d.date
          cur.allDay = d.allDay
        }
        break
      }
      case 'DTEND': {
        const d = parseIcsDate(p.value, p.params)
        if (d) cur.end = d.date
        break
      }
      case 'DURATION': {
        const m = parseDuration(p.value)
        if (m !== null) cur.durationMin = m
        break
      }
      case 'RRULE':
        cur.rrule = parseRRule(p.value)
        break
      case 'STATUS':
        if (comp === 'CANCELLED') cur.cancelled = true
        break
      default:
        break
    }
  }
  return events
}

/** Último dia ('yyyy-MM-dd') de uma regra com COUNT, simulando as ocorrências. */
function untilFromCount(start: Date, weekdays: number[], count: number, interval: number, daily: boolean): string {
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const startWeek = new Date(startDay)
  startWeek.setDate(startWeek.getDate() - startWeek.getDay())
  let n = 0
  let d = startDay
  for (let i = 0; i < 366 * 3; i++) {
    const diffDays = Math.round((d.getTime() - startDay.getTime()) / 86400000)
    const ok = daily
      ? diffDays % interval === 0
      : weekdays.includes(d.getDay()) && Math.floor(Math.round((d.getTime() - startWeek.getTime()) / 86400000) / 7) % interval === 0
    if (ok) {
      n++
      if (n >= count) return dayKey(d)
    }
    d = addDays(d, 1)
  }
  return dayKey(d)
}

export interface IcsImportResult {
  recurring: number
  blocks: number
  /** Eventos de dia inteiro viram lembretes. */
  reminders: number
  skipped: number
}

/**
 * Importa eventos: regras semanais/diárias viram Recurring; eventos únicos viram
 * blocos fixos (só entre hoje e +60 dias); dia inteiro vira lembrete.
 * Duplicados (mesmo título + mesmo início) são ignorados.
 */
export async function importIcsEvents(events: IcsEvent[], area: Area, settings: Settings): Promise<IcsImportResult> {
  const today = todayKey()
  const limit = dayKey(addDays(new Date(), 60))
  const existingRules = await db.recurring.toArray()
  const existingBlocks = await db.blocks.where('day').between(today, limit, true, true).toArray()
  const existingReminders = await db.reminders.toArray()

  const ruleKey = (r: { title: string; startTime: string; weekdays: number[] }) =>
    `${r.title.toLowerCase()}|${r.startTime}|${[...r.weekdays].sort().join(',')}`
  const ruleKeys = new Set(existingRules.map(ruleKey))
  const blockKeys = new Set(existingBlocks.map((b) => `${b.title.toLowerCase()}|${b.start}`))
  const reminderKeys = new Set(existingReminders.map((r) => `${r.title.toLowerCase()}|${r.date}`))

  const newRules: Recurring[] = []
  const newBlocks: Block[] = []
  const newReminders: Reminder[] = []
  let skipped = 0

  for (const ev of events) {
    const rr = ev.rrule
    const weekly = rr?.freq === 'WEEKLY'
    const daily = rr?.freq === 'DAILY'
    if (rr && (weekly || daily) && !ev.allDay) {
      const weekdays = daily ? [0, 1, 2, 3, 4, 5, 6] : rr.byDay?.length ? rr.byDay : [ev.start.getDay()]
      const until = rr.until ? dayKey(rr.until) : rr.count ? untilFromCount(ev.start, weekdays, rr.count, rr.interval, daily) : undefined
      if (until && until < today) {
        skipped++
        continue
      }
      const rule: Recurring = {
        title: ev.summary,
        area,
        kind: 'fixo',
        weekdays,
        startTime: hhmm(ev.start),
        endTime: hhmm(ev.end),
        location: ev.location,
        travelMin: 0,
        active: true,
        from: dayKey(ev.start),
        until,
      }
      const k = ruleKey(rule)
      if (ruleKeys.has(k)) {
        skipped++
        continue
      }
      ruleKeys.add(k)
      newRules.push(rule)
      continue
    }

    // Evento único (ou recorrência que não sabemos expandir: usa a primeira ocorrência).
    const day = dayKey(ev.start)
    if (day < today || day > limit) {
      skipped++
      continue
    }
    if (ev.allDay) {
      const k = `${ev.summary.toLowerCase()}|${day}`
      if (reminderKeys.has(k)) {
        skipped++
        continue
      }
      reminderKeys.add(k)
      newReminders.push({ title: ev.summary, area, date: day, repeat: 'uma', noticeDays: 1, notes: ev.description })
      continue
    }
    const startIso = ev.start.toISOString()
    const k = `${ev.summary.toLowerCase()}|${startIso}`
    if (blockKeys.has(k)) {
      skipped++
      continue
    }
    blockKeys.add(k)
    newBlocks.push({
      title: ev.summary,
      area,
      kind: 'fixo',
      start: startIso,
      end: ev.end.toISOString(),
      status: 'planejado',
      location: ev.location,
      notes: ev.description,
      day,
    })
  }

  if (newRules.length) await db.recurring.bulkAdd(newRules)
  if (newBlocks.length) await db.blocks.bulkAdd(newBlocks)
  if (newReminders.length) await db.reminders.bulkAdd(newReminders)
  await materializeAround(new Date(), settings)

  return { recurring: newRules.length, blocks: newBlocks.length, reminders: newReminders.length, skipped }
}
