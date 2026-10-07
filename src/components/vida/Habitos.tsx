import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, Check, Pencil, Plus } from 'lucide-react'
import { db, type Habit } from '../../db/schema'
import { useUI } from '../../store/ui'
import { WEEKDAY_SHORT, fromDayKey, todayKey, weekDays, weekStartOf } from '../../lib/time'
import { Button, Card, Empty, Field, Input, Section, Sheet, cx } from '../ui'
import { ChoiceChips } from '../trabalho/ChoiceChips'

const MAX_ACTIVE = 3
const TARGET_OPTIONS = [
  { value: 3, label: '3x' },
  { value: 5, label: '5x' },
  { value: 7, label: '7x' },
]

function HabitSheet({ open, initial, onClose }: { open: boolean; initial: Habit | null; onClose: () => void }) {
  const toast = useUI((s) => s.toast)
  const [name, setName] = useState('')
  const [target, setTarget] = useState(5)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setTarget(initial?.targetPerWeek ?? 5)
  }, [open, initial])

  async function save() {
    const n = name.trim()
    if (!n) return
    if (initial?.id) await db.habits.update(initial.id, { name: n, targetPerWeek: target })
    else await db.habits.add({ name: n, targetPerWeek: target, active: true })
    toast(initial?.id ? 'Hábito atualizado.' : 'Hábito criado. Um dia de cada vez.')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={initial?.id ? 'Editar hábito' : 'Novo hábito'}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="Hábito">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: caminhar 20 min" />
        </Field>
        <Field label="Meta por semana" hint="Não precisa ser todo dia. O que conta é aparecer.">
          <ChoiceChips options={TARGET_OPTIONS} value={target} onChange={setTarget} label="Meta por semana" />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" className="flex-1" disabled={!name.trim()}>
            {initial?.id ? 'Salvar' : 'Criar'}
          </Button>
          {initial?.id && (
            <Button
              type="button"
              onClick={async () => {
                await db.habits.update(initial.id!, { active: false })
                toast('Hábito guardado. Pode voltar quando quiser.')
                onClose()
              }}
            >
              <Archive size={18} /> Guardar
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  )
}

/** Hábitos: no máximo 3 ativos, visão semanal, sem sequência que quebra. */
export function Habitos() {
  const now = useUI((s) => s.now)
  const toast = useUI((s) => s.toast)
  const today = todayKey()
  const days = weekDays(weekStartOf(now))
  const habits = useLiveQuery(async () => (await db.habits.toArray()).filter((h) => h.active), [])
  const archived = useLiveQuery(async () => (await db.habits.toArray()).filter((h) => !h.active), [])
  const logs = useLiveQuery(() => db.habitLogs.where('date').between(days[0], days[6], true, true).toArray(), [days[0]])
  const [sheet, setSheet] = useState<{ open: boolean; initial: Habit | null }>({ open: false, initial: null })

  const full = (habits?.length ?? 0) >= MAX_ACTIVE

  async function toggle(habitId: string, date: string) {
    const existing = await db.habitLogs.where('[habitId+date]').equals([habitId, date]).first()
    if (existing) await db.habitLogs.delete(existing.id!)
    else await db.habitLogs.add({ habitId, date })
  }

  function openNew() {
    if (full) {
      toast('Três é o limite. Troque um.')
      return
    }
    setSheet({ open: true, initial: null })
  }

  return (
    <Section
      title="Hábitos"
      right={
        <Button className="min-h-9 px-3 text-sm" onClick={openNew} aria-disabled={full}>
          <Plus size={16} /> Hábito
        </Button>
      }
    >
      {full && <p className="text-xs text-muted mb-2">Três é o limite. Troque um.</p>}
      {habits && habits.length === 0 && (
        <Empty
          title="Nenhum hábito ativo"
          hint="Até três. Marque os dias em que aconteceu; não existe sequência para quebrar."
          action={
            <Button variant="primary" onClick={openNew}>
              <Plus size={18} /> Criar hábito
            </Button>
          }
        />
      )}
      <div className="grid gap-2">
        {habits?.map((h) => {
          const done = new Set((logs ?? []).filter((l) => l.habitId === h.id).map((l) => l.date))
          return (
            <Card key={h.id} area="vida" className="py-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="font-bold truncate">{h.name}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-sm text-muted tabular">
                    {done.size} de 7 dias · meta {h.targetPerWeek}
                  </span>
                  <button className="p-2 -mr-2 text-muted" aria-label="Editar hábito" onClick={() => setSheet({ open: true, initial: h })}>
                    <Pencil size={18} />
                  </button>
                </div>
              </div>
              <div className="flex justify-between" role="group" aria-label={`Dias da semana: ${h.name}`}>
                {days.map((d) => {
                  const on = done.has(d)
                  const future = d > today
                  const wd = fromDayKey(d).getDay()
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${WEEKDAY_SHORT[wd]} ${d}`}
                      disabled={future}
                      onClick={() => void toggle(h.id!, d)}
                      className={cx(
                        'flex flex-col items-center justify-center w-11 h-12 rounded-xl border text-xs font-bold transition',
                        on ? 'bg-ok/15 border-ok text-ok' : 'border-line text-muted',
                        d === today && !on && 'border-accent',
                        future && 'opacity-40',
                      )}
                    >
                      <span>{WEEKDAY_SHORT[wd]}</span>
                      {on ? <Check size={14} /> : <span className="w-1.5 h-1.5 rounded-full bg-line" aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
              {done.size >= h.targetPerWeek && <p className="text-xs text-ok mt-2">Meta da semana batida.</p>}
            </Card>
          )
        })}
      </div>
      {archived && archived.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs font-bold uppercase tracking-wider text-muted cursor-pointer select-none">Guardados ({archived.length})</summary>
          <ul className="mt-2 grid gap-1">
            {archived.map((h) => (
              <li key={h.id} className="flex items-center justify-between text-sm">
                <span className="text-muted truncate">{h.name}</span>
                <Button
                  className="min-h-9 px-3 text-xs"
                  onClick={async () => {
                    if (full) {
                      toast('Três é o limite. Troque um.')
                      return
                    }
                    await db.habits.update(h.id!, { active: true })
                  }}
                >
                  Reativar
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <HabitSheet open={sheet.open} initial={sheet.initial} onClose={() => setSheet({ open: false, initial: null })} />
    </Section>
  )
}
