import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowUp, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { db, type Routine, type RoutineStep } from '../../db/schema'
import { useUI } from '../../store/ui'
import { WEEKDAY_SHORT, fmtDuration, minutesOf, todayKey } from '../../lib/time'
import { dropFutureFromRoutine, materializeAround } from '../../lib/materialize'
import { Button, Card, Chip, Empty, Field, Input, Section, Select, Sheet, WeekdayPicker } from '../ui'
import { InlineConfirm } from '../trabalho/ChoiceChips'
import { RoutineRunner } from './RoutineRunner'

const PERIOD_LABEL: Record<Routine['period'], string> = { manha: 'Manhã', noite: 'Noite', outro: 'Outro' }

function weekdaysLabel(ws: number[]): string {
  const order = [1, 2, 3, 4, 5, 6, 0]
  const on = order.filter((d) => ws.includes(d))
  if (on.length === 7) return 'todos os dias'
  if (on.length === 5 && !ws.includes(0) && !ws.includes(6)) return 'seg a sex'
  return on.map((d) => WEEKDAY_SHORT[d]).join(' · ')
}

function minusMinutes(hhmm: string, min: number): string {
  const m = (minutesOf(hhmm) - min + 24 * 60) % (24 * 60)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

const total = (steps: RoutineStep[]) => steps.reduce((n, s) => n + s.minutes, 0)

function move<T>(xs: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= xs.length) return xs
  const out = [...xs]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/* ----- Editor de passos (usado no cartão e no formulário) ----- */
function StepsEditor({ steps, onChange }: { steps: RoutineStep[]; onChange: (s: RoutineStep[]) => void }) {
  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState(5)

  function add() {
    const t = title.trim()
    if (!t) return
    onChange([...steps, { title: t, minutes: Math.max(1, minutes) }])
    setTitle('')
    setMinutes(5)
  }

  return (
    <div>
      <ol className="grid gap-1.5">
        {steps.map((s, i) => (
          <li key={`${i}-${s.title}`} className="flex items-center gap-1.5 rounded-xl border border-line px-2 min-h-11">
            <span className="text-xs text-muted tabular w-4">{i + 1}.</span>
            <span className="text-sm font-semibold flex-1 min-w-0 truncate">{s.title}</span>
            <span className="text-xs text-muted tabular">{s.minutes} min</span>
            <button type="button" className="p-1.5 text-muted disabled:opacity-30" aria-label="Subir" disabled={i === 0} onClick={() => onChange(move(steps, i, -1))}>
              <ArrowUp size={16} />
            </button>
            <button
              type="button"
              className="p-1.5 text-muted disabled:opacity-30"
              aria-label="Descer"
              disabled={i === steps.length - 1}
              onClick={() => onChange(move(steps, i, 1))}
            >
              <ArrowDown size={16} />
            </button>
            <button type="button" className="p-1.5 text-muted" aria-label="Remover passo" onClick={() => onChange(steps.filter((_, k) => k !== i))}>
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ol>
      <div className="flex gap-2 mt-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="novo passo"
          aria-label="Novo passo"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <Input type="number" min={1} className="w-20" value={minutes} aria-label="Minutos" onChange={(e) => setMinutes(Number(e.target.value) || 1)} />
        <Button type="button" onClick={add} disabled={!title.trim()} aria-label="Adicionar passo">
          <Plus size={18} />
        </Button>
      </div>
    </div>
  )
}

/* ----- Formulário de rotina ----- */
function RoutineSheet({ open, initial, onClose, onSave }: { open: boolean; initial: Partial<Routine> | null; onClose: () => void; onSave: (r: Routine) => Promise<void> }) {
  const [name, setName] = useState('')
  const [period, setPeriod] = useState<Routine['period']>('manha')
  const [anchorTime, setAnchorTime] = useState('07:00')
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [steps, setSteps] = useState<RoutineStep[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setPeriod(initial?.period ?? 'manha')
    setAnchorTime(initial?.anchorTime ?? '07:00')
    setWeekdays(initial?.weekdays ?? [1, 2, 3, 4, 5])
    setSteps(initial?.steps ?? [])
    setBusy(false)
  }, [open, initial])

  const valid = name.trim().length > 0 && weekdays.length > 0 && steps.length > 0 && total(steps) > 0

  return (
    <Sheet open={open} onClose={onClose} title={initial?.id ? 'Editar rotina' : 'Nova rotina'}>
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!valid) return
          setBusy(true)
          await onSave({ id: initial?.id, name: name.trim(), period, anchorTime, weekdays: [...weekdays].sort(), steps, active: initial?.active ?? true })
        }}
      >
        <Field label="Nome">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Manhã" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Período">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as Routine['period'])}>
              <option value="manha">Manhã</option>
              <option value="noite">Noite</option>
              <option value="outro">Outro</option>
            </Select>
          </Field>
          <Field label="Começa às">
            <Input type="time" value={anchorTime} onChange={(e) => e.target.value && setAnchorTime(e.target.value)} />
          </Field>
        </div>
        <div>
          <span className="block text-xs font-display font-bold uppercase tracking-wider text-muted mb-1">Dias</span>
          <WeekdayPicker value={weekdays} onChange={setWeekdays} />
        </div>
        <div>
          <span className="block text-xs font-display font-bold uppercase tracking-wider text-muted mb-1">
            Passos · {fmtDuration(total(steps))}
          </span>
          <StepsEditor steps={steps} onChange={setSteps} />
          {steps.length === 0 && <span className="block text-xs text-muted mt-1">Pelo menos um passo.</span>}
        </div>
        <Button type="submit" variant="primary" disabled={!valid || busy}>
          {initial?.id ? 'Salvar' : 'Criar rotina'}
        </Button>
      </form>
    </Sheet>
  )
}

/* ----- Cartão ----- */
function RoutineCard({ r, onEdit, onPersist }: { r: Routine; onEdit: () => void; onPersist: (r: Routine) => Promise<void> }) {
  const [running, setRunning] = useState(false)
  const [removing, setRemoving] = useState(false)
  const toast = useUI((s) => s.toast)
  const mins = total(r.steps)

  async function remove() {
    await dropFutureFromRoutine(r.id!, todayKey())
    await db.routines.delete(r.id!)
    toast('Rotina removida.')
  }

  return (
    <Card area="vida">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold truncate">{r.name}</p>
            <Chip>{PERIOD_LABEL[r.period]}</Chip>
            {!r.active && <Chip>pausada</Chip>}
          </div>
          <p className="text-sm text-muted tabular">
            {r.anchorTime} · {weekdaysLabel(r.weekdays)} · {fmtDuration(mins)}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button className="p-2 text-muted" aria-label="Editar rotina" onClick={onEdit}>
            <Pencil size={18} />
          </button>
          <button className="p-2 text-muted" aria-label="Remover rotina" onClick={() => setRemoving(true)}>
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      {removing && (
        <div className="mt-2">
          <InlineConfirm text="Remover esta rotina e os blocos futuros?" onYes={() => void remove()} onNo={() => setRemoving(false)} />
        </div>
      )}
      <div className="mt-3">
        <StepsEditor steps={r.steps} onChange={(steps) => void onPersist({ ...r, steps })} />
      </div>
      <Button variant="primary" className="w-full mt-3" disabled={!r.steps.length} onClick={() => setRunning(true)}>
        <Play size={18} /> Rodar agora
      </Button>
      <RoutineRunner routine={r} open={running} onClose={() => setRunning(false)} />
    </Card>
  )
}

/* ----- Seção ----- */
export function Rotinas() {
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const routines = useLiveQuery(() => db.routines.toArray(), [])
  const [sheet, setSheet] = useState<{ open: boolean; initial: Partial<Routine> | null }>({ open: false, initial: null })

  async function persist(r: Routine, quiet = false) {
    const { id, ...rest } = r
    if (id) {
      await db.routines.put({ ...rest, id })
      await dropFutureFromRoutine(id, todayKey())
    } else {
      await db.routines.add(rest)
    }
    await materializeAround(new Date(), settings)
    setSheet({ open: false, initial: null })
    if (!quiet) toast('Rotina salva. Já está na agenda.')
  }

  const templates: { label: string; make: () => Routine }[] = [
    {
      label: 'Manhã (banho 15, café 10, arrumar 10, sair 5)',
      make: () => ({
        name: 'Manhã',
        period: 'manha',
        anchorTime: settings.sleepWeekday.wake,
        weekdays: [1, 2, 3, 4, 5],
        steps: [
          { title: 'Banho', minutes: 15 },
          { title: 'Café', minutes: 10 },
          { title: 'Arrumar', minutes: 10 },
          { title: 'Sair', minutes: 5 },
        ],
        active: true,
      }),
    },
    {
      label: 'Noite (fechar o dia 2, preparar amanhã 10, higiene 10, tela off 5)',
      make: () => ({
        name: 'Noite',
        period: 'noite',
        anchorTime: minusMinutes(settings.sleepWeekday.bed, 30),
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        steps: [
          { title: 'Fechar o dia', minutes: 2 },
          { title: 'Preparar amanhã', minutes: 10 },
          { title: 'Higiene', minutes: 10 },
          { title: 'Tela off', minutes: 5 },
        ],
        active: true,
      }),
    },
  ]

  return (
    <Section
      title="Rotinas de manhã e noite"
      right={
        <Button className="min-h-9 px-3 text-sm" onClick={() => setSheet({ open: true, initial: null })}>
          <Plus size={16} /> Rotina
        </Button>
      }
    >
      {routines && routines.length === 0 && (
        <Empty
          title="Sem rotinas ainda"
          hint="Uma rotina é uma lista curta de passos com minutos. Comece por um modelo e ajuste."
          action={
            <div className="grid gap-2">
              {templates.map((t) => (
                <Button key={t.label} onClick={() => void persist(t.make())}>
                  {t.label}
                </Button>
              ))}
            </div>
          }
        />
      )}
      <div className="grid gap-3">
        {routines?.map((r) => (
          <RoutineCard key={r.id} r={r} onEdit={() => setSheet({ open: true, initial: r })} onPersist={(x) => persist(x, true)} />
        ))}
      </div>
      <RoutineSheet open={sheet.open} initial={sheet.initial} onClose={() => setSheet({ open: false, initial: null })} onSave={persist} />
    </Section>
  )
}
