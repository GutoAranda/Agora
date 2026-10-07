import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Coffee, Plus, Trash2 } from 'lucide-react'
import { db } from '../../db/schema'
import { useUI } from '../../store/ui'
import { addDays, addMinutes, atTime, dayKey, fmtDay, fmtDuration, hhmm, parseISO, todayKey } from '../../lib/time'
import { conflictsWith } from '../../lib/schedule'
import { Button, Empty, Field, Input, Section, Sheet } from '../ui'
import { ChoiceChips } from '../trabalho/ChoiceChips'

const TITLE_OPTIONS = [
  { value: 'Ver série', label: 'Ver série' },
  { value: 'Sair', label: 'Sair' },
  { value: 'Nada', label: 'Nada' },
]
const DURATION_OPTIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1h' },
  { value: 90, label: '1h30' },
  { value: 120, label: '2h' },
]

function roundedNow(): string {
  const d = new Date()
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 30) * 30, 0, 0)
  return hhmm(d)
}

/** Descanso programado: lazer com hora marcada, como qualquer outro bloco. */
export function Descanso() {
  const toast = useUI((s) => s.toast)
  const today = todayKey()
  const until = dayKey(addDays(new Date(), 6))
  const blocks = useLiveQuery(
    async () =>
      (await db.blocks.where('day').between(today, until, true, true).toArray())
        .filter((b) => b.kind === 'descanso' && b.status !== 'pulado')
        .sort((a, b) => a.start.localeCompare(b.start)),
    [today, until],
  )
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('Ver série')
  const [custom, setCustom] = useState('')
  const [day, setDay] = useState(today)
  const [start, setStart] = useState(roundedNow())
  const [duration, setDuration] = useState(60)
  const [clash, setClash] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setTitle('Ver série')
    setCustom('')
    setDay(today)
    setStart(roundedNow())
    setDuration(60)
  }, [open, today])

  useEffect(() => {
    if (!open) return
    let alive = true
    void (async () => {
      const s = atTime(day, start)
      const c = await conflictsWith(s, addMinutes(s, duration))
      if (alive) setClash(c.map((b) => b.title))
    })()
    return () => {
      alive = false
    }
  }, [open, day, start, duration])

  const finalTitle = (custom.trim() || title).trim()

  async function save() {
    if (!finalTitle || !day || !start) return
    const s = atTime(day, start)
    await db.blocks.add({
      title: finalTitle,
      area: 'vida',
      kind: 'descanso',
      start: s.toISOString(),
      end: addMinutes(s, duration).toISOString(),
      status: 'planejado',
      day,
    })
    setOpen(false)
    toast('Descanso na agenda. Lazer marcado não vira culpa.')
  }

  return (
    <Section
      title="Descanso programado"
      right={
        <Button className="min-h-9 px-3 text-sm" onClick={() => setOpen(true)}>
          <Plus size={16} /> Agendar descanso
        </Button>
      }
    >
      <p className="text-sm text-muted mb-2">Lazer na agenda não vira culpa.</p>
      {blocks && blocks.length === 0 && (
        <Empty
          title="Nada marcado nos próximos 7 dias"
          hint="Reserve um horário para não fazer nada, de propósito."
          action={
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Coffee size={18} /> Agendar descanso
            </Button>
          }
        />
      )}
      {blocks && blocks.length > 0 && (
        <ul className="divide-y divide-line border border-line rounded-2xl bg-surface">
          {blocks.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-3 py-2 area-vida">
              <span className="area-dot w-2 h-2 rounded-full shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{b.title}</p>
                <p className="text-xs text-muted tabular">
                  {fmtDay(b.start)} · {hhmm(b.start)}–{hhmm(b.end)} · {fmtDuration(Math.round((parseISO(b.end).getTime() - parseISO(b.start).getTime()) / 60000))}
                  {b.status === 'feito' ? ' · feito' : ''}
                </p>
              </div>
              <button className="p-2 text-muted" aria-label="Remover descanso" onClick={() => void db.blocks.delete(b.id!)}>
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Agendar descanso">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <Field label="O quê">
            <ChoiceChips options={TITLE_OPTIONS} value={custom.trim() ? undefined : title} onChange={(v) => { setTitle(v); setCustom('') }} label="Tipo de descanso" />
          </Field>
          <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="ou escreva outra coisa" aria-label="Outro descanso" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dia">
              <Input type="date" value={day} min={today} onChange={(e) => e.target.value && setDay(e.target.value)} />
            </Field>
            <Field label="Começa">
              <Input type="time" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
            </Field>
          </div>
          <Field label="Duração">
            <ChoiceChips options={DURATION_OPTIONS} value={duration} onChange={setDuration} label="Duração" />
          </Field>
          {clash.length > 0 && <p className="text-sm text-warn">Bate com: {clash.join(', ')}. Pode marcar mesmo assim.</p>}
          <Button type="submit" variant="primary" disabled={!finalTitle}>
            Reservar {fmtDuration(duration)} em {fmtDay(day)}
          </Button>
        </form>
      </Sheet>
    </Section>
  )
}
