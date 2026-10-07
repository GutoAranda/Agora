import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addMonths, addYears, differenceInCalendarDays } from 'date-fns'
import { Cake, Check, Pencil, Plus, Receipt, Trash2 } from 'lucide-react'
import { db, type Area, type Reminder, type ReminderRepeat } from '../../db/schema'
import { useUI } from '../../store/ui'
import { addDays, dayKey, fmtDay, fmtRelativeDays, fromDayKey, todayKey } from '../../lib/time'
import { AreaPicker, Button, Chip, Empty, Field, Input, Select, Sheet, cx } from '../ui'
import { ChoiceChips, InlineConfirm } from '../trabalho/ChoiceChips'

/* ==========================================================================
   Pessoas e contas: aniversários (anual), contas e consultas (uma/mensal).
   Mostra a próxima ocorrência de cada um; "Resolvido" marca só aquela.
   ========================================================================== */

const NOTICE_OPTIONS = [
  { value: 1, label: '1 dia' },
  { value: 3, label: '3 dias' },
  { value: 7, label: '7 dias' },
]
const REPEAT_LABEL: Record<ReminderRepeat, string> = { uma: 'uma vez', mensal: 'todo mês', anual: 'todo ano' }
const HORIZON_DAYS = 30

/** Próxima ocorrência ('yyyy-MM-dd') ainda não resolvida, a partir de hoje. */
export function nextOccurrence(r: Reminder, today: string): string | null {
  if (r.repeat === 'uma') return r.lastDoneOn ? null : r.date
  const floor = r.lastDoneOn && r.lastDoneOn >= today ? dayKey(addDays(fromDayKey(r.lastDoneOn), 1)) : today
  const base = fromDayKey(r.date)
  if (r.date >= floor) return r.date
  const first = fromDayKey(floor)
  let i = r.repeat === 'mensal' ? (first.getFullYear() - base.getFullYear()) * 12 + first.getMonth() - base.getMonth() - 1 : first.getFullYear() - base.getFullYear() - 1
  i = Math.max(0, i)
  for (let n = 0; n < 40; n++, i++) {
    const d = r.repeat === 'mensal' ? addMonths(base, i) : addYears(base, i)
    const k = dayKey(d)
    if (k >= floor) return k
  }
  return null
}

interface Upcoming {
  r: Reminder
  on: string
  days: number
}

function ReminderSheet({ open, initial, onClose, defaultRepeat }: { open: boolean; initial: Reminder | null; onClose: () => void; defaultRepeat: ReminderRepeat }) {
  const toast = useUI((s) => s.toast)
  const [title, setTitle] = useState('')
  const [area, setArea] = useState<Area>('vida')
  const [date, setDate] = useState(todayKey())
  const [repeat, setRepeat] = useState<ReminderRepeat>(defaultRepeat)
  const [noticeDays, setNoticeDays] = useState(3)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(initial?.title ?? '')
    setArea(initial?.area ?? 'vida')
    setDate(initial?.date ?? todayKey())
    setRepeat(initial?.repeat ?? defaultRepeat)
    setNoticeDays(initial?.noticeDays ?? 3)
    setRemoving(false)
  }, [open, initial, defaultRepeat])

  async function save() {
    const t = title.trim()
    if (!t || !date) return
    if (initial?.id) await db.reminders.update(initial.id, { title: t, area, date, repeat, noticeDays })
    else await db.reminders.add({ title: t, area, date, repeat, noticeDays })
    toast('Lembrete salvo.')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={initial?.id ? 'Editar lembrete' : 'Novo lembrete'}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="O que é">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: aniversário da Ana, conta de luz, dentista" />
        </Field>
        <div>
          <span className="block text-xs font-display font-bold uppercase tracking-wider text-muted mb-1">Área</span>
          <AreaPicker value={area} onChange={setArea} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label="Repete">
            <Select value={repeat} onChange={(e) => setRepeat(e.target.value as ReminderRepeat)}>
              <option value="uma">Uma vez</option>
              <option value="mensal">Todo mês</option>
              <option value="anual">Todo ano</option>
            </Select>
          </Field>
        </div>
        <Field label="Avisar antes">
          <ChoiceChips options={NOTICE_OPTIONS} value={noticeDays} onChange={setNoticeDays} label="Avisar antes" />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" className="flex-1" disabled={!title.trim() || !date}>
            {initial?.id ? 'Salvar' : 'Criar'}
          </Button>
          {initial?.id && !removing && (
            <Button type="button" variant="ghost" onClick={() => setRemoving(true)} aria-label="Apagar lembrete">
              <Trash2 size={18} />
            </Button>
          )}
        </div>
        {initial?.id && removing && (
          <InlineConfirm
            text="Apagar este lembrete?"
            onYes={async () => {
              await db.reminders.delete(initial.id!)
              onClose()
            }}
            onNo={() => setRemoving(false)}
          />
        )}
      </form>
    </Sheet>
  )
}

function UpcomingList({ items, onEdit, onResolve }: { items: Upcoming[]; onEdit: (r: Reminder) => void; onResolve: (u: Upcoming) => void }) {
  const soon = items.filter((u) => u.days <= HORIZON_DAYS)
  const later = items.filter((u) => u.days > HORIZON_DAYS)
  return (
    <>
      {soon.length > 0 && (
        <ul className="divide-y divide-line border border-line rounded-2xl bg-surface">
          {soon.map((u) => {
            const alert = u.days <= u.r.noticeDays
            return (
              <li key={u.r.id} className={cx(`area-${u.r.area}`, 'flex items-center gap-2 px-3 py-2')}>
                <span className="area-dot w-2 h-2 rounded-full shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{u.r.title}</p>
                  <p className="text-xs text-muted tabular">
                    {fmtDay(fromDayKey(u.on))} · {REPEAT_LABEL[u.r.repeat]}
                  </p>
                </div>
                <Chip tone={u.days <= 0 ? 'warn' : alert ? 'accent' : 'muted'}>{fmtRelativeDays(fromDayKey(u.on))}</Chip>
                <button className="p-2 text-muted" aria-label="Editar" onClick={() => onEdit(u.r)}>
                  <Pencil size={18} />
                </button>
                <Button className="min-h-9 px-2.5 text-xs" onClick={() => onResolve(u)}>
                  <Check size={14} /> Resolvido
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {later.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs font-bold uppercase tracking-wider text-muted cursor-pointer select-none">Mais adiante ({later.length})</summary>
          <ul className="mt-2 grid gap-1">
            {later.map((u) => (
              <li key={u.r.id} className="flex items-center justify-between gap-2 text-sm">
                <button className="text-left truncate flex-1" onClick={() => onEdit(u.r)}>
                  {u.r.title}
                </button>
                <span className="text-muted tabular shrink-0">{fmtDay(fromDayKey(u.on), "d 'de' MMM")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

export function Lembretes() {
  const toast = useUI((s) => s.toast)
  const today = todayKey()
  const reminders = useLiveQuery(() => db.reminders.toArray(), [])
  const [sheet, setSheet] = useState<{ open: boolean; initial: Reminder | null; repeat: ReminderRepeat }>({ open: false, initial: null, repeat: 'anual' })

  const upcoming: Upcoming[] = (reminders ?? [])
    .map((r) => {
      const on = nextOccurrence(r, today)
      return on ? { r, on, days: differenceInCalendarDays(fromDayKey(on), fromDayKey(today)) } : null
    })
    .filter((u): u is Upcoming => u !== null)
    .sort((a, b) => a.on.localeCompare(b.on))
  const people = upcoming.filter((u) => u.r.repeat === 'anual')
  const bills = upcoming.filter((u) => u.r.repeat !== 'anual')
  const resolvedOnce = (reminders ?? []).filter((r) => r.repeat === 'uma' && r.lastDoneOn).length

  async function resolve(u: Upcoming) {
    await db.reminders.update(u.r.id!, { lastDoneOn: u.on })
    toast(u.r.repeat === 'uma' ? 'Resolvido.' : 'Resolvido. O próximo já está na fila.')
  }

  const edit = (r: Reminder) => setSheet({ open: true, initial: r, repeat: r.repeat })

  return (
    <>
      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-bold inline-flex items-center gap-2">
            <Cake size={18} className="text-muted" /> Aniversários e pessoas
          </h2>
          <Button className="min-h-9 px-3 text-sm" onClick={() => setSheet({ open: true, initial: null, repeat: 'anual' })}>
            <Plus size={16} /> Pessoa
          </Button>
        </div>
        {reminders && people.length === 0 && <Empty title="Ninguém cadastrado" hint="Aniversários e datas de quem importa. O app avisa antes." />}
        <UpcomingList items={people} onEdit={edit} onResolve={(u) => void resolve(u)} />
      </section>

      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-bold inline-flex items-center gap-2">
            <Receipt size={18} className="text-muted" /> Contas e consultas
          </h2>
          <Button className="min-h-9 px-3 text-sm" onClick={() => setSheet({ open: true, initial: null, repeat: 'mensal' })}>
            <Plus size={16} /> Conta
          </Button>
        </div>
        {reminders && bills.length === 0 && (
          <Empty
            title={resolvedOnce ? 'Tudo resolvido' : 'Nenhuma conta ou consulta'}
            hint="Contas mensais, consultas, renovações. Vence, você resolve, o próximo aparece."
          />
        )}
        <UpcomingList items={bills} onEdit={edit} onResolve={(u) => void resolve(u)} />
      </section>

      <ReminderSheet open={sheet.open} initial={sheet.initial} defaultRepeat={sheet.repeat} onClose={() => setSheet((s) => ({ ...s, open: false, initial: null }))} />
    </>
  )
}
