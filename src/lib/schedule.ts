import { db, type Block, type Deadline, type Settings, type Task } from '../db/schema'
import { addMinutes, atTime, dayKey, fromDayKey, isWeekend, type Span, overlaps, parseISO } from './time'
import { estimateFor } from './calibration'

/* ==========================================================================
   Encaixe: encontra espaços livres respeitando pedras, sono e folgas.
   "Compromissos fixos são pedra, o resto é água."
   ========================================================================== */

export interface FreeSlot {
  day: string
  start: Date
  end: Date
  minutes: number
}

/** Janela útil do dia: entre acordar e dormir, segundo as configurações. */
export function awakeWindow(day: string, s: Settings): Span {
  const win = isWeekend(day) ? s.sleepWeekend : s.sleepWeekday
  const wake = atTime(day, win.wake)
  let bed = atTime(day, win.bed)
  if (bed <= wake) bed = addMinutes(bed, 24 * 60)
  return { start: wake.getTime(), end: bed.getTime() }
}

function blockSpan(b: Block, bufferMs: number): Span {
  return { start: parseISO(b.start).getTime() - bufferMs, end: parseISO(b.end).getTime() + bufferMs }
}

/** Espaços livres de um dia, já descontando folgas em volta de cada bloco. */
export async function freeSlots(day: string, s: Settings, minMinutes = 20, notBefore?: Date): Promise<FreeSlot[]> {
  const blocks = (await db.blocks.where('day').equals(day).toArray()).filter((b) => b.status !== 'pulado')
  // Blocos de outros dias que invadem este (ex.: sono da véspera)
  const prev = dayKey(addMinutes(fromDayKey(day), -24 * 60))
  const prevBlocks = (await db.blocks.where('day').equals(prev).toArray()).filter(
    (b) => parseISO(b.end).getTime() > fromDayKey(day).getTime(),
  )
  const bufferMs = s.bufferMin * 60000
  const busy = [...blocks, ...prevBlocks]
    .filter((b) => b.kind !== 'sono')
    .map((b) => blockSpan(b, bufferMs))
    .sort((a, b) => a.start - b.start)
  const win = awakeWindow(day, s)
  let cursor = Math.max(win.start, notBefore ? notBefore.getTime() : 0)
  const out: FreeSlot[] = []
  for (const b of busy) {
    if (b.end <= cursor) continue
    if (b.start > cursor) {
      const end = Math.min(b.start, win.end)
      const min = Math.floor((end - cursor) / 60000)
      if (min >= minMinutes) out.push({ day, start: new Date(cursor), end: new Date(end), minutes: min })
    }
    cursor = Math.max(cursor, b.end)
    if (cursor >= win.end) break
  }
  if (cursor < win.end) {
    const min = Math.floor((win.end - cursor) / 60000)
    if (min >= minMinutes) out.push({ day, start: new Date(cursor), end: new Date(win.end), minutes: min })
  }
  return out
}

/** Minutos ocupados e disponíveis de um dia (para o aviso de semana lotada). */
export async function dayLoad(day: string, s: Settings): Promise<{ busy: number; awake: number }> {
  const win = awakeWindow(day, s)
  const awake = (win.end - win.start) / 60000
  const blocks = (await db.blocks.where('day').equals(day).toArray()).filter(
    (b) => b.kind !== 'sono' && b.status !== 'pulado',
  )
  let busy = 0
  for (const b of blocks) {
    const sp = { start: Math.max(parseISO(b.start).getTime(), win.start), end: Math.min(parseISO(b.end).getTime(), win.end) }
    if (sp.end > sp.start) busy += (sp.end - sp.start) / 60000
  }
  return { busy, awake }
}

/** Confere se um intervalo conflita com blocos existentes (ignorando o próprio id). */
export async function conflictsWith(start: Date, end: Date, ignoreId?: string): Promise<Block[]> {
  const day = dayKey(start)
  const blocks = await db.blocks.where('day').equals(day).toArray()
  const span: Span = { start: start.getTime(), end: end.getTime() }
  return blocks.filter(
    (b) => b.id !== ignoreId && b.status !== 'pulado' && b.kind !== 'sono' && overlaps(span, blockSpan(b, 0)),
  )
}

/** Cria um bloco para uma tarefa num horário explícito. */
export async function placeTaskAt(task: Task, start: Date, minutes: number): Promise<string> {
  const end = addMinutes(start, minutes)
  const id = await db.blocks.add({
    title: task.title,
    area: task.area ?? 'vida',
    kind: 'tarefa',
    start: start.toISOString(),
    end: end.toISOString(),
    status: 'planejado',
    firstStep: task.firstStep,
    taskId: task.id,
    courseId: task.courseId,
    deadlineId: task.deadlineId,
    day: dayKey(start),
  })
  await db.tasks.update(task.id!, { status: 'planejada' })
  return id as string
}

/** Encaixa automaticamente uma tarefa no primeiro espaço livre a partir de `from`, até `horizonDays`. */
export async function autoPlaceTask(task: Task, s: Settings, from = new Date(), horizonDays = 7): Promise<string | null> {
  const minutes = task.estimateMin ?? (await estimateFor('tarefa', task.title)) ?? 30
  const deadline = task.dueAt ? parseISO(task.dueAt) : null
  for (let i = 0; i < horizonDays; i++) {
    const d = addMinutes(from, i * 24 * 60)
    const day = dayKey(d)
    if (deadline && fromDayKey(day) > deadline) break
    const slots = await freeSlots(day, s, Math.min(minutes, 25), i === 0 ? from : undefined)
    for (const slot of slots) {
      const len = Math.min(minutes, slot.minutes)
      if (len < Math.min(minutes, 25)) continue
      return placeTaskAt(task, slot.start, len)
    }
  }
  return null
}

/** Marcos sugeridos para um prazo: entender → rascunhar → revisar (ou estudar em 3 ondas para prova). */
export function suggestMilestones(d: Pick<Deadline, 'type' | 'dueAt' | 'estimateMin' | 'title'>): Deadline['milestones'] {
  const due = parseISO(d.dueAt)
  const now = new Date()
  const total = Math.max(1, (due.getTime() - now.getTime()) / 86400000)
  const at = (frac: number) => new Date(now.getTime() + total * frac * 86400000)
  const share = (f: number) => Math.max(25, Math.round(d.estimateMin * f))
  const id = () => Math.random().toString(36).slice(2, 9)
  if (d.type === 'prova') {
    return [
      { id: id(), title: 'Levantar o conteúdo e separar material', dueAt: at(0.35).toISOString(), done: false, estimateMin: share(0.2) },
      { id: id(), title: 'Estudar: primeira passada', dueAt: at(0.65).toISOString(), done: false, estimateMin: share(0.45) },
      { id: id(), title: 'Revisar e fazer exercícios', dueAt: at(0.9).toISOString(), done: false, estimateMin: share(0.35) },
    ]
  }
  if (d.type === 'leitura') {
    return [
      { id: id(), title: 'Ler metade', dueAt: at(0.5).toISOString(), done: false, estimateMin: share(0.5) },
      { id: id(), title: 'Terminar e anotar', dueAt: at(0.9).toISOString(), done: false, estimateMin: share(0.5) },
    ]
  }
  return [
    { id: id(), title: 'Entender o que é pedido e listar fontes', dueAt: at(0.25).toISOString(), done: false, estimateMin: share(0.2) },
    { id: id(), title: 'Rascunho completo', dueAt: at(0.65).toISOString(), done: false, estimateMin: share(0.5) },
    { id: id(), title: 'Revisar e entregar', dueAt: at(0.9).toISOString(), done: false, estimateMin: share(0.3) },
  ]
}

/** Distribui blocos de estudo/trabalho para os marcos ainda não feitos de um prazo. */
export async function distributeDeadline(d: Deadline, s: Settings): Promise<number> {
  let created = 0
  const existing = await db.blocks.where('deadlineId').equals(d.id!).toArray()
  for (const m of d.milestones) {
    if (m.done) continue
    const already = existing
      .filter((b) => b.notes === `marco:${m.id}` && b.status !== 'pulado')
      .reduce((n, b) => n + (parseISO(b.end).getTime() - parseISO(b.start).getTime()) / 60000, 0)
    let remaining = m.estimateMin - already
    if (remaining <= 0) continue
    const mDue = parseISO(m.dueAt)
    const from = new Date()
    for (let i = 0; i < 21 && remaining > 0; i++) {
      const dayDate = addMinutes(from, i * 24 * 60)
      if (dayDate > mDue) break
      const day = dayKey(dayDate)
      const slots = await freeSlots(day, s, 25, i === 0 ? from : undefined)
      for (const slot of slots) {
        if (remaining <= 0) break
        const len = Math.min(remaining, slot.minutes, 90) // blocos de no máximo 90 min
        if (len < 25) continue
        await db.blocks.add({
          title: `${d.title}: ${m.title}`,
          area: d.area,
          kind: 'estudo',
          start: slot.start.toISOString(),
          end: addMinutes(slot.start, len).toISOString(),
          status: 'planejado',
          firstStep: 'Abrir o material e ler o último ponto onde parou',
          deadlineId: d.id,
          courseId: d.courseId,
          notes: `marco:${m.id}`,
          day,
        })
        remaining -= len
        created++
      }
    }
  }
  return created
}

/** Dia mínimo: mantém pedras e UMA tarefa; o resto vai para a entrada. */
export async function applyMinimalDay(day: string): Promise<number> {
  const blocks = await db.blocks.where('day').equals(day).toArray()
  const soft = blocks.filter((b) => (b.kind === 'tarefa' || b.kind === 'estudo') && b.status === 'planejado')
  if (soft.length <= 1) return 0
  // Mantém a que começa primeiro; devolve as outras à entrada.
  soft.sort((a, b) => a.start.localeCompare(b.start))
  const drop = soft.slice(1)
  for (const b of drop) {
    await db.blocks.delete(b.id!)
    if (b.taskId) {
      const t = await db.tasks.get(b.taskId)
      if (t && t.status === 'planejada') await db.tasks.update(b.taskId, { status: 'entrada' })
    }
  }
  return drop.length
}

/** Fim do dia: tarefas não feitas voltam para a entrada (sem ficar vermelhas). */
export async function sweepUnfinished(day: string): Promise<number> {
  const blocks = await db.blocks.where('day').equals(day).toArray()
  const left = blocks.filter((b) => (b.kind === 'tarefa' || b.kind === 'estudo') && b.status !== 'feito' && b.status !== 'pulado')
  for (const b of left) {
    await db.blocks.delete(b.id!)
    if (b.taskId) {
      const t = await db.tasks.get(b.taskId)
      if (t && t.status === 'planejada') {
        await db.tasks.update(b.taskId, { status: 'entrada', rescheduleCount: (t.rescheduleCount ?? 0) + 1 })
      }
    }
  }
  return left.length
}
