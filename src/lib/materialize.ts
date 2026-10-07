import { db, type Block, type Recurring, type Routine, type Settings } from '../db/schema'
import { atTime, addMinutes, dayKey, fromDayKey, isWeekend, minutesOf, weekDays, weekStartOf } from './time'

/* ==========================================================================
   Materialização: transforma regras (recorrentes, rotinas, sono) em blocos
   concretos por dia. É idempotente: só cria o que ainda não existe.
   ========================================================================== */

function activeOn(r: Recurring, day: string): boolean {
  if (!r.active) return false
  if (!r.weekdays.includes(fromDayKey(day).getDay())) return false
  if (r.from && day < r.from) return false
  if (r.until && day > r.until) return false
  return true
}

/** Cria os blocos fixos de um dia a partir das regras recorrentes. */
export async function materializeDay(day: string, settings: Settings): Promise<void> {
  const existing = await db.blocks.where('day').equals(day).toArray()
  const has = (pred: (b: Block) => boolean) => existing.some(pred)
  const toAdd: Block[] = []

  // Recorrentes
  const rules = await db.recurring.toArray()
  for (const r of rules) {
    if (!activeOn(r, day)) continue
    if (has((b) => b.recurringId === r.id && b.kind !== 'deslocamento')) continue
    const start = atTime(day, r.startTime)
    let end = atTime(day, r.endTime)
    if (end <= start) end = addMinutes(end, 24 * 60)
    toAdd.push({
      title: r.title,
      area: r.area,
      kind: r.kind,
      start: start.toISOString(),
      end: end.toISOString(),
      status: 'planejado',
      location: r.location,
      recurringId: r.id,
      courseId: r.courseId,
      day,
    })
    if (r.travelMin && r.travelMin > 0) {
      toAdd.push({
        title: `Ir: ${r.title}`,
        area: r.area,
        kind: 'deslocamento',
        start: addMinutes(start, -r.travelMin).toISOString(),
        end: start.toISOString(),
        status: 'planejado',
        recurringId: r.id,
        day,
      })
      toAdd.push({
        title: `Voltar: ${r.title}`,
        area: r.area,
        kind: 'deslocamento',
        start: end.toISOString(),
        end: addMinutes(end, r.travelMin).toISOString(),
        status: 'planejado',
        recurringId: r.id,
        day,
      })
    }
  }

  // Rotinas (manhã / noite)
  const routines = await db.routines.where('active').equals(1).toArray().catch(() => [] as Routine[])
  const allRoutines = routines.length ? routines : (await db.routines.toArray()).filter((r) => r.active)
  for (const r of allRoutines) {
    if (!r.weekdays.includes(fromDayKey(day).getDay())) continue
    if (has((b) => b.routineId === r.id)) continue
    const total = r.steps.reduce((n, s) => n + s.minutes, 0)
    if (total <= 0) continue
    const start = atTime(day, r.anchorTime)
    toAdd.push({
      title: r.name,
      area: 'vida',
      kind: 'rotina',
      start: start.toISOString(),
      end: addMinutes(start, total).toISOString(),
      status: 'planejado',
      firstStep: r.steps[0]?.title,
      routineId: r.id,
      day,
    })
  }

  // Sono: bloco que começa na hora de dormir do dia e vai até a hora de acordar do dia seguinte.
  if (!has((b) => b.kind === 'sono')) {
    const win = isWeekend(day) ? settings.sleepWeekend : settings.sleepWeekday
    const nextDay = dayKey(addMinutes(fromDayKey(day), 24 * 60))
    const nextWin = isWeekend(nextDay) ? settings.sleepWeekend : settings.sleepWeekday
    let bed = atTime(day, win.bed)
    // Se a hora de dormir é depois da meia-noite (ex.: 00:30), ela pertence ao dia seguinte.
    if (minutesOf(win.bed) < 12 * 60) bed = addMinutes(bed, 24 * 60)
    const wake = atTime(nextDay, nextWin.wake)
    if (wake > bed) {
      toAdd.push({
        title: 'Dormir',
        area: 'vida',
        kind: 'sono',
        start: bed.toISOString(),
        end: wake.toISOString(),
        status: 'planejado',
        day,
      })
    }
  }

  if (toAdd.length) await db.blocks.bulkAdd(toAdd)
}

/** Materializa a semana que contém `anchor` e a seguinte. */
export async function materializeAround(anchor: Date, settings: Settings): Promise<void> {
  const start = weekStartOf(anchor)
  const days = [...weekDays(start), ...weekDays(addMinutes(start, 7 * 24 * 60))]
  for (const d of days) await materializeDay(d, settings)
}

/** Remove blocos futuros gerados por uma regra (ao editar/apagar a regra). */
export async function dropFutureFromRecurring(recurringId: string, fromDay: string): Promise<void> {
  const rows = await db.blocks.where('recurringId').equals(recurringId).toArray()
  const ids = rows.filter((b) => b.day >= fromDay && b.status === 'planejado').map((b) => b.id!)
  await db.blocks.bulkDelete(ids)
}

export async function dropFutureFromRoutine(routineId: string, fromDay: string): Promise<void> {
  const rows = await db.blocks.where('routineId').equals(routineId).toArray()
  const ids = rows.filter((b) => b.day >= fromDay && b.status === 'planejado').map((b) => b.id!)
  await db.blocks.bulkDelete(ids)
}

/** Remove blocos de sono futuros (ao mudar a janela de sono) para serem regenerados. */
export async function dropFutureSleep(fromDay: string): Promise<void> {
  const rows = await db.blocks.where('kind').equals('sono').toArray()
  const ids = rows.filter((b) => b.day >= fromDay).map((b) => b.id!)
  await db.blocks.bulkDelete(ids)
}
