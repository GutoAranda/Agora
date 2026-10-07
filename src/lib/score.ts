import { db } from '../db/schema'
import { dayKey, weekDays, weekStartOf } from './time'

/* ==========================================================================
   Placar semanal: o único número que importa, mostrado só no domingo.
   Nunca "você falhou em X". Sempre "você cumpriu N de M".
   ========================================================================== */

export interface WeekScore {
  weekStart: string
  fixedDone: number
  fixedTotal: number
  started: number
  plannedSoft: number
  doneSoft: number
  anchorDays: number // dias com revisão noturna feita
  daysWithActivity: number
  habitsDone: number
  habitsTarget: number
}

export async function weekScore(anchor: Date): Promise<WeekScore> {
  const start = weekStartOf(anchor)
  const days = weekDays(start)
  const todayK = dayKey(new Date())
  const pastDays = days.filter((d) => d <= todayK)

  const blocks = (await Promise.all(days.map((d) => db.blocks.where('day').equals(d).toArray()))).flat()
  const past = blocks.filter((b) => b.day <= todayK)

  const fixed = past.filter((b) => b.kind === 'fixo')
  const fixedDone = fixed.filter((b) => b.status === 'feito' || b.status === 'iniciado').length
  const soft = past.filter((b) => b.kind === 'tarefa' || b.kind === 'estudo' || b.kind === 'rotina')
  const started = soft.filter((b) => b.startedAt || b.status === 'feito').length
  const doneSoft = soft.filter((b) => b.status === 'feito').length

  const reviews = (await db.reviews.where('type').equals('noite').toArray()).filter((r) => days.includes(r.date))
  const activeDays = new Set(past.filter((b) => b.status === 'feito').map((b) => b.day))

  const habits = (await db.habits.toArray()).filter((h) => h.active)
  const logs = (await db.habitLogs.toArray()).filter((l) => days.includes(l.date))
  const habitsTarget = habits.reduce((n, h) => n + Math.min(h.targetPerWeek, 7), 0)

  return {
    weekStart: dayKey(start),
    fixedDone,
    fixedTotal: fixed.length,
    started,
    plannedSoft: soft.length,
    doneSoft,
    anchorDays: new Set(reviews.map((r) => r.date)).size,
    daysWithActivity: activeDays.size || pastDays.length === 0 ? activeDays.size : activeDays.size,
    habitsDone: logs.length,
    habitsTarget,
  }
}

/** Frase de placar sem culpa. */
export function scoreSentence(s: WeekScore): string {
  const parts: string[] = []
  if (s.fixedTotal) parts.push(`cumpriu ${s.fixedDone} de ${s.fixedTotal} compromissos`)
  if (s.plannedSoft) parts.push(`começou ${s.started} de ${s.plannedSoft} blocos`)
  if (s.anchorDays) parts.push(`fechou o dia ${s.anchorDays} ${s.anchorDays === 1 ? 'noite' : 'noites'}`)
  if (!parts.length) return 'Semana ainda sem registros. Vamos só para hoje.'
  return `Nesta semana você ${parts.join(', ')}.`
}
