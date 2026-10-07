import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { db, type Area, type Subtask, type Task, type TaskStatus, type Trigger } from '../../db/schema'
import { addMinutes, atTime, dayKey, parseISO } from '../../lib/time'
import { autoPlaceTask, conflictsWith, placeTaskAt } from '../../lib/schedule'
import { useUI } from '../../store/ui'
import { AreaPicker, Button, Chip, Field, Input, Sheet, cx } from '../ui'
import { ChoiceChip } from './ChoiceChip'
import { TriggerChooser } from './TriggerChooser'
import { fmtWhen } from './format'

/* ==========================================================================
   Triagem: a tarefa só sai da entrada com área + gatilho + primeiro passo.
   Ações: Encaixar agora · Só salvar · Espera · Soltar.
   ========================================================================== */

const ESTIMATES = [15, 25, 45, 60, 90]

export function TriageSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  return (
    <Sheet open={!!task} onClose={onClose} title="Dar forma">
      {task && <TriageForm key={task.id} task={task} onClose={onClose} />}
    </Sheet>
  )
}

function TriageForm({ task, onClose }: { task: Task; onClose: () => void }) {
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const [title, setTitle] = useState(task.title)
  const [area, setArea] = useState<Area | undefined>(task.area)
  const [trigger, setTrigger] = useState<Trigger | undefined>(task.trigger)
  const [firstStep, setFirstStep] = useState(task.firstStep ?? '')
  const [estimateMin, setEstimate] = useState<number | undefined>(task.estimateMin)
  const [dueDay, setDueDay] = useState(task.dueAt ? dayKey(task.dueAt) : '')
  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks ?? [])
  const [newSub, setNewSub] = useState('')
  const returned = (task.rescheduleCount ?? 0) >= 2
  const [showSub, setShowSub] = useState(returned || subtasks.length > 0)
  const [confirmDrop, setConfirmDrop] = useState(false)
  const [busy, setBusy] = useState(false)

  const missing: string[] = []
  if (!area) missing.push('área')
  if (!trigger?.value) missing.push('gatilho')
  if (!firstStep.trim()) missing.push('primeiro passo')

  function patch(): Partial<Task> {
    return {
      title: title.trim() || task.title,
      area,
      trigger: trigger?.value ? trigger : undefined,
      firstStep: firstStep.trim() || undefined,
      estimateMin,
      dueAt: dueDay ? atTime(dueDay, '23:59').toISOString() : undefined,
      subtasks,
    }
  }

  async function save(status?: TaskStatus): Promise<Task> {
    const p = patch()
    await db.tasks.update(task.id!, status ? { ...p, status } : p)
    return { ...task, ...p, status: status ?? task.status }
  }

  async function place() {
    if (missing.length) {
      toast(`Para encaixar ainda falta: ${missing.join(', ')}.`)
      return
    }
    setBusy(true)
    try {
      const fresh = await save()
      const minutes = estimateMin ?? 30
      if (fresh.trigger?.type === 'horario') {
        const start = parseISO(fresh.trigger.value)
        if (start.getTime() < Date.now()) {
          toast('Esse horário já passou. Escolha outro ou troque o gatilho.')
          return
        }
        const clash = await conflictsWith(start, addMinutes(start, minutes))
        await placeTaskAt(fresh, start, minutes)
        toast(clash.length ? `Encaixado ${fmtWhen(start)}, junto com "${clash[0].title}".` : `Encaixado ${fmtWhen(start)}.`)
      } else {
        const id = await autoPlaceTask(fresh, settings)
        if (id === null) {
          toast('Sem espaço nos próximos 7 dias. Abra a Semana para escolher.')
          return
        }
        const b = await db.blocks.get(id)
        toast(b ? `Encaixado ${fmtWhen(parseISO(b.start))}.` : 'Encaixado.')
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function justSave() {
    await save()
    toast('Salvo. Continua na entrada.')
    onClose()
  }

  async function wait() {
    await save('espera')
    toast('Em espera. Volta quando você quiser.')
    onClose()
  }

  async function drop() {
    await save('solta')
    toast('Solto. Menos uma coisa na cabeça.')
    onClose()
  }

  return (
    <div className="grid gap-4">
      {returned && (
        <div className="flex items-center gap-2">
          <Chip tone="accent">voltou {task.rescheduleCount}x: quebrar ou soltar?</Chip>
        </div>
      )}

      <Field label="O quê">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <div>
        <span className="block text-xs font-display font-bold uppercase tracking-wider text-muted mb-1">Área</span>
        <AreaPicker value={area} onChange={setArea} />
      </div>

      <div>
        <span className="block text-xs font-display font-bold uppercase tracking-wider text-muted mb-1">Gatilho: quando ou onde</span>
        <TriggerChooser value={trigger} onChange={setTrigger} />
      </div>

      <Field label="Primeiro passo" hint="a menor ação que começa isso">
        <Input
          value={firstStep}
          onChange={(e) => setFirstStep(e.target.value)}
          placeholder="ex.: abrir o arquivo e ler o título"
          className={cx(returned && !firstStep.trim() && 'border-accent/60')}
        />
      </Field>

      <div>
        <span className="block text-xs font-display font-bold uppercase tracking-wider text-muted mb-1">Quanto tempo</span>
        <div className="flex flex-wrap gap-2">
          {ESTIMATES.map((m) => (
            <ChoiceChip key={m} active={estimateMin === m} onClick={() => setEstimate(estimateMin === m ? undefined : m)}>
              {m} min
            </ChoiceChip>
          ))}
        </div>
      </div>

      <Field label="Prazo (opcional)">
        <Input type="date" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
      </Field>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-display font-bold uppercase tracking-wider text-muted">Passos menores (opcional)</span>
          {!showSub && (
            <button type="button" className="text-sm text-accent font-semibold" onClick={() => setShowSub(true)}>
              Quebrar em partes
            </button>
          )}
        </div>
        {showSub && (
          <div className="grid gap-2">
            {subtasks.length > 0 && (
              <ul className="divide-y divide-line border border-line rounded-xl">
                {subtasks.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 px-3 py-2">
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-accent"
                      checked={s.done}
                      aria-label={`Feito: ${s.title}`}
                      onChange={(e) => setSubtasks(subtasks.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))}
                    />
                    <span className={cx('flex-1 text-sm', s.done && 'line-through text-muted')}>{s.title}</span>
                    <button
                      type="button"
                      className="p-1 text-muted"
                      aria-label={`Remover ${s.title}`}
                      onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))}
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                placeholder="um pedaço pequeno"
                aria-label="Novo passo"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (newSub.trim()) {
                      setSubtasks([...subtasks, { title: newSub.trim(), done: false }])
                      setNewSub('')
                    }
                  }
                }}
              />
              <Button
                type="button"
                className="px-3"
                aria-label="Adicionar passo"
                disabled={!newSub.trim()}
                onClick={() => {
                  setSubtasks([...subtasks, { title: newSub.trim(), done: false }])
                  setNewSub('')
                }}
              >
                <Plus size={18} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {missing.length > 0 && (
        <p className="text-xs text-muted">Para sair da entrada ainda falta: {missing.join(', ')}.</p>
      )}

      <div className="grid gap-2">
        <Button variant="primary" disabled={busy || missing.length > 0} onClick={() => void place()}>
          Encaixar agora
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={busy} onClick={() => void justSave()}>
            Só salvar
          </Button>
          <Button disabled={busy} onClick={() => void wait()}>
            Espera
          </Button>
        </div>
        {confirmDrop ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
            <span className="text-sm">Soltar de vez? Sem culpa.</span>
            <div className="flex gap-2">
              <Button variant="ghost" className="min-h-9 px-3 text-sm" onClick={() => setConfirmDrop(false)}>
                Não
              </Button>
              <Button variant="danger" className="min-h-9 px-3 text-sm" onClick={() => void drop()}>
                Soltar
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDrop(true)}>
            Soltar
          </Button>
        )}
      </div>
    </div>
  )
}
