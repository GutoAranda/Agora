import {
  addDays,
  addMinutes,
  differenceInMinutes,
  endOfDay,
  format,
  isSameDay,
  parse,
  parseISO,
  startOfDay,
  startOfWeek,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const DAY = 'yyyy-MM-dd'

export function dayKey(d: Date | string): string {
  return format(typeof d === 'string' ? parseISO(d) : d, DAY)
}

export function todayKey(): string {
  return dayKey(new Date())
}

export function fromDayKey(key: string): Date {
  return parse(key, DAY, new Date())
}

/** Combina 'yyyy-MM-dd' + 'HH:mm' em Date local. */
export function atTime(day: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = fromDayKey(day)
  d.setHours(h, m, 0, 0)
  return d
}

export function hhmm(d: Date | string): string {
  return format(typeof d === 'string' ? parseISO(d) : d, 'HH:mm')
}

export function minutesOf(hhmmStr: string): number {
  const [h, m] = hhmmStr.split(':').map(Number)
  return h * 60 + m
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export function fmtDay(d: Date | string, pattern = "EEE, d 'de' MMM"): string {
  return format(typeof d === 'string' ? parseISO(d) : d, pattern, { locale: ptBR })
}

export function fmtRelativeDays(target: Date | string): string {
  const t = startOfDay(typeof target === 'string' ? parseISO(target) : target)
  const diff = Math.round((t.getTime() - startOfDay(new Date()).getTime()) / 86400000)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'amanhã'
  if (diff === -1) return 'ontem'
  if (diff < 0) return `há ${-diff} dias`
  return `em ${diff} dias`
}

/** Dias úteis (seg-sex) entre hoje e a data, inclusive hoje se útil. */
export function businessDaysUntil(target: Date | string): number {
  const end = startOfDay(typeof target === 'string' ? parseISO(target) : target)
  let d = startOfDay(new Date())
  let n = 0
  while (d < end) {
    const wd = d.getDay()
    if (wd !== 0 && wd !== 6) n++
    d = addDays(d, 1)
  }
  return n
}

export function weekStartOf(d: Date | string): Date {
  return startOfWeek(typeof d === 'string' ? parseISO(d) : d, { weekStartsOn: 1 })
}

export function weekDays(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => dayKey(addDays(start, i)))
}

export function isWeekend(day: string): boolean {
  const wd = fromDayKey(day).getDay()
  return wd === 0 || wd === 6
}

export { addMinutes, differenceInMinutes, endOfDay, isSameDay, parseISO, startOfDay, addDays }

export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const WEEKDAY_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** Intervalo [start,end) em ms. */
export interface Span {
  start: number
  end: number
}

export function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end
}

export function clampSpanToDay(span: Span, day: string): Span | null {
  const s = Math.max(span.start, fromDayKey(day).getTime())
  const e = Math.min(span.end, endOfDay(fromDayKey(day)).getTime() + 1)
  return s < e ? { start: s, end: e } : null
}
