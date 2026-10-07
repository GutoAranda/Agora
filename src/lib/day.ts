import { appliesOn, byDayOrder, isDoneOn, type Item } from '../db/schema'
import { addMinutes, atTime } from './time'

/* Regras do "agora": o que mostrar em primeiro lugar. */

export interface Slot {
  item: Item
  start?: Date // horário do compromisso
  end?: Date
  leave?: Date // hora de sair (horário − ida)
}

export function slotOf(item: Item, day: string): Slot {
  if (!item.time) return { item }
  const start = atTime(day, item.time)
  const end = addMinutes(start, item.minutes ?? 60)
  const leave = item.travelTo ? addMinutes(start, -item.travelTo) : undefined
  return { item, start, end, leave }
}

export function todayList(items: Item[], day: string, weekday: number): Item[] {
  return items.filter((i) => appliesOn(i, day, weekday)).sort(byDayOrder)
}

/** Dia difícil: só compromissos com horário e uma única tarefa. */
export function hardDayFilter(list: Item[], day: string): Item[] {
  const timed = list.filter((i) => i.time)
  const firstLoose = list.find((i) => !i.time && !isDoneOn(i, day))
  return [...timed, ...(firstLoose ? [firstLoose] : [])].sort(byDayOrder)
}

export type NowKind = 'emCurso' | 'sair' | 'tarefa' | 'proximo'

/**
 * Decide o cartão principal:
 * 1. compromisso acontecendo agora;
 * 2. hora de sair para um compromisso;
 * 3. primeira tarefa sem horário;
 * 4. próximo compromisso do dia.
 */
export function pickNow(open: Item[], day: string, now: Date): { kind: NowKind; slot: Slot } | null {
  const slots = open.map((i) => slotOf(i, day))
  const t = now.getTime()
  const live = slots.find((s) => s.start && s.end && s.start.getTime() <= t && t < s.end.getTime())
  if (live) return { kind: 'emCurso', slot: live }
  const leaving = slots.find((s) => s.leave && s.start && s.leave.getTime() <= t && t < s.start.getTime())
  if (leaving) return { kind: 'sair', slot: leaving }
  const loose = slots.find((s) => !s.start)
  // Compromisso cuja saída (ou início, sem trajeto) está a ≤ 15 min passa na frente da tarefa solta.
  const soon = slots.find((s) => s.start && s.start.getTime() > t && (s.leave ?? s.start).getTime() - t <= 15 * 60000)
  if (soon) return { kind: 'proximo', slot: soon }
  if (loose) return { kind: 'tarefa', slot: loose }
  const upcoming = slots.find((s) => s.start && s.start.getTime() > t)
  if (upcoming) return { kind: 'proximo', slot: upcoming }
  return null
}
