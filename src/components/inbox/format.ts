import { format } from 'date-fns'
import type { Trigger } from '../../db/schema'
import { fmtDay, fmtRelativeDays, hhmm, parseISO } from '../../lib/time'

/** "hoje às 20:00", "amanhã às 09:00", "sáb, 11 de out às 10:00". */
export function fmtWhen(d: Date): string {
  const rel = fmtRelativeDays(d)
  const day = rel === 'hoje' || rel === 'amanhã' ? rel : fmtDay(d)
  return `${day} às ${hhmm(d)}`
}

/** Resumo curto de um gatilho para listas. */
export function describeTrigger(t?: Trigger): string {
  if (!t || !t.value) return ''
  if (t.type === 'horario') {
    try {
      return format(parseISO(t.value), "EEE d/MM 'às' HH:mm")
    } catch {
      return ''
    }
  }
  return t.value
}
