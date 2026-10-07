import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Inbox } from 'lucide-react'
import { db, type Area, type Block, type Task } from '../../db/schema'
import { conflictsWith, placeTaskAt, type FreeSlot } from '../../lib/schedule'
import { addMinutes, atTime, dayKey, fmtDay, fmtDuration, hhmm } from '../../lib/time'
import { useUI } from '../../store/ui'
import { AreaDot, AreaPicker, Button, Chip, Field, Input, Label, Select, Sheet, cx } from '../ui'
import { KIND_LABEL } from './BlockItem'

/* ==========================================================================
   Toque num espaço livre: encaixar uma tarefa da entrada ou criar um bloco.
   ========================================================================== */

const DURATIONS = [15, 25, 45, 60, 90]
type NewKind = Extract<Block['kind'], 'fixo' | 'tarefa' | 'descanso' | 'estudo'>

function durationsFor(task?: Task | null): number[] {
  const base = task?.estimateMin ? [task.estimateMin, ...DURATIONS] : DURATIONS
  return Array.from(new Set(base)).sort((a, b) => a - b)
}

function ConflictNote({ conflicts }: { conflicts: Block[] }) {
  if (!conflicts.length) return null
  return (
    <p className="text-sm rounded-xl bg-warn/10 text-warn px-3 py-2" role="status">
      Passa por cima de: {conflicts.map((c) => `${c.title} (${hhmm(c.start)}–${hhmm(c.end)})`).join(', ')}. Dá para salvar mesmo assim, mas vai apertar.
    </p>
  )
}

function useConflicts(start: Date | null, end: Date | null, ignoreId?: number): Block[] {
  const [list, setList] = useState<Block[]>([])
  const s = start?.getTime()
  const e = end?.getTime()
  useEffect(() => {
    let alive = true
    if (!s || !e || e <= s) {
      setList([])
      return
    }
    void conflictsWith(new Date(s), new Date(e), ignoreId).then((r) => {
      if (alive) setList(r)
    })
    return () => {
      alive = false
    }
  }, [s, e, ignoreId])
  return list
}

function PlaceTask({ slot, onDone }: { slot: FreeSlot; onDone: () => void }) {
  const toast = useUI((st) => st.toast)
  const tasks = useLiveQuery(async () => {
    const ts = await db.tasks.where('status').anyOf('entrada', 'planejada').toArray()
    const ids = ts.map((t) => t.id!).filter((id) => id != null)
    const placed = ids.length ? await db.blocks.where('taskId').anyOf(ids).toArray() : []
    const busy = new Set(placed.filter((b) => b.status === 'planejado' || b.status === 'iniciado').map((b) => b.taskId))
    return ts
      .filter((t) => !busy.has(t.id))
      .sort((a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9') || a.createdAt.localeCompare(b.createdAt))
  }, [])
  const [taskId, setTaskId] = useState<number | null>(null)
  const task = useMemo(() => tasks?.find((t) => t.id === taskId) ?? null, [tasks, taskId])
  const [minutes, setMinutes] = useState<number>(0)
  useEffect(() => {
    if (!task) return
    // Estimativa da tarefa se couber; senão a maior opção que cabe no espaço.
    const options = durationsFor(task)
    const fits = options.filter((m) => m <= slot.minutes)
    setMinutes(task.estimateMin && task.estimateMin <= slot.minutes ? task.estimateMin : (fits[fits.length - 1] ?? options[0]))
  }, [task, slot.minutes])
  const end = useMemo(() => (task ? addMinutes(slot.start, minutes) : null), [task, slot.start, minutes])
  const conflicts = useConflicts(task ? slot.start : null, end)
  const tooLong = minutes > slot.minutes

  if (!tasks) return <p className="text-sm text-muted">Carregando…</p>
  if (!tasks.length) {
    return (
      <div className="text-center py-6">
        <Inbox className="mx-auto text-muted mb-2" size={28} aria-hidden="true" />
        <p className="font-bold">Entrada vazia</p>
        <p className="text-sm text-muted">Nada esperando para ser encaixado. Pode criar um bloco novo na outra aba.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line border border-line rounded-2xl overflow-hidden max-h-64 overflow-y-auto" role="listbox" aria-label="Tarefas para encaixar">
        {tasks.map((t) => {
          const on = t.id === taskId
          return (
            <li key={t.id}>
              <button
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => setTaskId(t.id!)}
                className={cx('w-full min-h-11 flex items-center gap-3 px-3 py-2 text-left', on ? 'bg-accent/10' : 'bg-surface')}
              >
                {t.area ? <AreaDot area={t.area} /> : <span className="inline-block w-2.5 h-2.5 rounded-full bg-line" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold truncate">{t.title}</span>
                  {t.firstStep && <span className="block text-xs text-muted truncate">{t.firstStep}</span>}
                </span>
                {t.estimateMin && <Chip>{fmtDuration(t.estimateMin)}</Chip>}
              </button>
            </li>
          )
        })}
      </ul>

      {task && (
        <>
          <div>
            <Label>Quanto tempo</Label>
            <div className="flex flex-wrap gap-2">
              {durationsFor(task).map((m) => (
                <Button key={m} variant={minutes === m ? 'primary' : 'secondary'} className="px-3" onClick={() => setMinutes(m)}>
                  {fmtDuration(m)}
                  {task.estimateMin === m && <span className="sr-only"> (estimativa da tarefa)</span>}
                </Button>
              ))}
            </div>
            {tooLong && (
              <p className="text-xs text-muted mt-1">
                O espaço tem {fmtDuration(slot.minutes)}; o bloco vai até {end ? hhmm(end) : ''}.
              </p>
            )}
          </div>
          <ConflictNote conflicts={conflicts} />
          <Button
            variant="primary"
            className="w-full"
            onClick={async () => {
              await placeTaskAt(task, slot.start, minutes)
              toast(`Encaixado: ${task.title} às ${hhmm(slot.start)}.`)
              onDone()
            }}
          >
            Encaixar às {hhmm(slot.start)}
          </Button>
        </>
      )}
    </div>
  )
}

function NewBlock({ slot, onDone }: { slot: FreeSlot; onDone: () => void }) {
  const toast = useUI((st) => st.toast)
  const [title, setTitle] = useState('')
  const [area, setArea] = useState<Area>('vida')
  const [kind, setKind] = useState<NewKind>('tarefa')
  const [time, setTime] = useState(hhmm(slot.start))
  const [minutes, setMinutes] = useState(Math.min(45, slot.minutes))
  const [location, setLocation] = useState('')
  const [firstStep, setFirstStep] = useState('')

  const start = useMemo(() => {
    if (!/^\d{2}:\d{2}$/.test(time)) return null
    let d = atTime(slot.day, time)
    // Horário de madrugada (ex.: 00:30) depois da meia-noite pertence à noite deste dia.
    if (d.getTime() < slot.start.getTime() - 12 * 3600000) d = addMinutes(d, 24 * 60)
    return d
  }, [slot.day, slot.start, time])
  const end = useMemo(() => (start ? addMinutes(start, minutes) : null), [start, minutes])
  const conflicts = useConflicts(start, end)
  const valid = title.trim().length > 0 && start && minutes > 0

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valid || !start || !end) return
        await db.blocks.add({
          title: title.trim(),
          area,
          kind,
          start: start.toISOString(),
          end: end.toISOString(),
          status: 'planejado',
          location: location.trim() || undefined,
          firstStep: firstStep.trim() || undefined,
          day: dayKey(start),
        })
        toast(`Bloco criado: ${title.trim()} às ${hhmm(start)}.`)
        onDone()
      }}
    >
      <Field label="O quê">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: Revisar capítulo 3" required />
      </Field>
      <div>
        <Label>Área</Label>
        <AreaPicker value={area} onChange={setArea} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as NewKind)}>
            {(['tarefa', 'estudo', 'fixo', 'descanso'] as NewKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Começa">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="tabular" required />
        </Field>
      </div>
      <div>
        <Label>Duração</Label>
        <div className="flex flex-wrap gap-2 items-center">
          {DURATIONS.map((m) => (
            <Button key={m} type="button" variant={minutes === m ? 'primary' : 'secondary'} className="px-3" onClick={() => setMinutes(m)}>
              {fmtDuration(m)}
            </Button>
          ))}
          <Input
            type="number"
            min={5}
            step={5}
            value={minutes}
            onChange={(e) => setMinutes(Math.max(5, Number(e.target.value) || 0))}
            className="w-24 tabular"
            aria-label="Duração em minutos"
          />
        </div>
        {end && <p className="text-xs text-muted mt-1 tabular">Termina às {hhmm(end)}.</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Lugar">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="opcional" />
        </Field>
        <Field label="Primeiro passo">
          <Input value={firstStep} onChange={(e) => setFirstStep(e.target.value)} placeholder="a menor ação" />
        </Field>
      </div>
      <ConflictNote conflicts={conflicts} />
      <Button type="submit" variant="primary" className="w-full" disabled={!valid}>
        <Plus size={18} /> Criar bloco
      </Button>
    </form>
  )
}

function SlotBody({ slot, onDone }: { slot: FreeSlot; onDone: () => void }) {
  const [tab, setTab] = useState<'tarefa' | 'novo'>('tarefa')
  return (
    <div>
      <p className="text-sm text-muted mb-3 tabular">
        {fmtDay(slot.start, "EEEE, d 'de' MMM")} · {hhmm(slot.start)}–{hhmm(slot.end)} · {fmtDuration(slot.minutes)} livres
      </p>
      <div className="grid grid-cols-2 gap-2 mb-4" role="tablist" aria-label="O que fazer com o espaço">
        <Button role="tab" aria-selected={tab === 'tarefa'} variant={tab === 'tarefa' ? 'primary' : 'secondary'} onClick={() => setTab('tarefa')}>
          Encaixar tarefa
        </Button>
        <Button role="tab" aria-selected={tab === 'novo'} variant={tab === 'novo' ? 'primary' : 'secondary'} onClick={() => setTab('novo')}>
          Novo bloco
        </Button>
      </div>
      {tab === 'tarefa' ? <PlaceTask slot={slot} onDone={onDone} /> : <NewBlock slot={slot} onDone={onDone} />}
    </div>
  )
}

export function SlotSheet({ slot, onClose }: { slot: FreeSlot | null; onClose: () => void }) {
  return (
    <Sheet open={!!slot} onClose={onClose} title="Espaço livre">
      {slot && <SlotBody key={slot.start.toISOString()} slot={slot} onDone={onClose} />}
    </Sheet>
  )
}

