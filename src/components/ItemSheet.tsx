import { useEffect, useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { db, type Item } from '../db/schema'
import { useUI } from '../store/ui'
import { addDays, dayKey, todayKey } from '../lib/time'
import { Button, Field, Input, Sheet, WeekdayPicker, cx } from './ui'

/* ==========================================================================
   Anotar e editar. Por padrão só pede o nome e "quando".
   O resto (horário, primeiro passo, trajeto, repetir) fica em "Mais detalhes".
   ========================================================================== */

type When = 'hoje' | 'amanha' | 'algum' | 'data'

function whenOf(day: string | null): When {
  if (day === null) return 'algum'
  if (day === todayKey()) return 'hoje'
  if (day === dayKey(addDays(new Date(), 1))) return 'amanha'
  return 'data'
}

function Chips<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { v: T; t: string }[]
  value: T | undefined
  onChange: (v: T | undefined) => void
  label: string
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(value === o.v ? undefined : o.v)}
          className={cx(
            'min-h-11 px-4 rounded-full border text-sm font-semibold',
            value === o.v ? 'bg-fg text-bg border-fg' : 'border-line text-muted',
          )}
        >
          {o.t}
        </button>
      ))}
    </div>
  )
}

function MinutesField({ id, label, value, onChange, presets }: { id: string; label: string; value?: number; onChange: (v?: number) => void; presets: number[] }) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={600}
          className="w-24"
          value={value ?? ''}
          placeholder="min"
          onChange={(e) => onChange(e.target.value === '' ? undefined : Math.max(0, Math.min(600, Number(e.target.value))))}
        />
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cx('min-h-11 px-3 rounded-full border text-sm', value === p ? 'bg-fg text-bg border-fg' : 'border-line text-muted')}
          >
            {p}
          </button>
        ))}
      </div>
    </Field>
  )
}

export function ItemSheet({ open, onClose, item, defaultWhen = 'hoje' }: { open: boolean; onClose: () => void; item?: Item; defaultWhen?: When }) {
  const toast = useUI((s) => s.toast)
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState<When>(defaultWhen)
  const [date, setDate] = useState(todayKey())
  const [time, setTime] = useState('')
  const [minutes, setMinutes] = useState<number | undefined>()
  const [firstStep, setFirstStep] = useState('')
  const [repeat, setRepeat] = useState<number[]>([])
  const [travelTo, setTravelTo] = useState<number | undefined>()
  const [travelBack, setTravelBack] = useState<number | undefined>()
  const [travelHow, setTravelHow] = useState('')
  const [more, setMore] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(item?.title ?? '')
    const w = item ? whenOf(item.day) : defaultWhen
    setWhen(w)
    setDate(item?.day ?? todayKey())
    setTime(item?.time ?? '')
    setMinutes(item?.minutes)
    setFirstStep(item?.firstStep ?? '')
    setRepeat(item?.repeat ?? [])
    setTravelTo(item?.travelTo)
    setTravelBack(item?.travelBack)
    setTravelHow(item?.travelHow ?? '')
    setMore(!!(item && (item.time || item.firstStep || item.repeat?.length || item.travelTo || item.travelBack)))
    setConfirmDelete(false)
  }, [open, item, defaultWhen])

  function resolvedDay(): string | null {
    if (when === 'hoje') return todayKey()
    if (when === 'amanha') return dayKey(addDays(new Date(), 1))
    if (when === 'algum') return null
    return date || todayKey()
  }

  async function save() {
    const t = title.trim()
    if (!t) return
    const data: Partial<Item> = {
      title: t,
      day: repeat.length ? (item?.day ?? todayKey()) : resolvedDay(),
      time: time || undefined,
      minutes,
      firstStep: firstStep.trim() || undefined,
      repeat: repeat.length ? repeat : undefined,
      travelTo: time ? travelTo : undefined,
      travelBack: time ? travelBack : undefined,
      travelHow: time && (travelTo || travelBack) ? travelHow.trim() || undefined : undefined,
    }
    if (item?.id) {
      await db.items.update(item.id, data)
      toast('Salvo.')
    } else {
      await db.items.add({ ...(data as Item), done: false, createdAt: new Date().toISOString() })
      toast('Anotado.')
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={item ? 'Editar' : 'Anotar'}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Input id="item-title" autoFocus={!item} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que surgiu na cabeça?" />

        {!repeat.length && (
          <div className="grid gap-2">
            <Chips
              label="Quando"
              value={when}
              onChange={(v) => setWhen(v ?? 'hoje')}
              options={[
                { v: 'hoje', t: 'Hoje' },
                { v: 'amanha', t: 'Amanhã' },
                { v: 'algum', t: 'Algum dia' },
                { v: 'data', t: 'Escolher dia' },
              ]}
            />
            {when === 'data' && <Input id="item-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </div>
        )}

        <button type="button" onClick={() => setMore(!more)} className="flex items-center gap-1 text-sm font-semibold text-muted min-h-11" aria-expanded={more}>
          <ChevronDown size={16} className={cx('transition', more && 'rotate-180')} /> Mais detalhes
        </button>

        {more && (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Horário">
                <Input id="item-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
              <MinutesField id="item-min" label="Duração" value={minutes} onChange={setMinutes} presets={[]} />
            </div>

            <Field label="Primeiro passo" hint="A menor ação que começa isso.">
              <Input id="item-step" value={firstStep} onChange={(e) => setFirstStep(e.target.value)} placeholder="ex.: abrir o arquivo" />
            </Field>

            {time && (
              <div className="grid gap-3 rounded-2xl border border-line p-3">
                <p className="text-sm font-bold">Trajeto</p>
                <MinutesField id="item-to" label="Ida (min)" value={travelTo} onChange={setTravelTo} presets={[10, 20, 30, 45, 60]} />
                <MinutesField id="item-back" label="Volta (min)" value={travelBack} onChange={setTravelBack} presets={[10, 20, 30, 45, 60]} />
                <Field label="Como vai">
                  <Input id="item-how" value={travelHow} onChange={(e) => setTravelHow(e.target.value)} placeholder="ex.: metrô, carro, a pé" />
                </Field>
              </div>
            )}

            <Field label="Repetir toda semana">
              <WeekdayPicker value={repeat} onChange={setRepeat} />
            </Field>
          </div>
        )}

        <Button type="submit" variant="primary" className="min-h-12" disabled={!title.trim()}>
          {item ? 'Salvar' : 'Guardar'}
        </Button>

        {item?.id &&
          (confirmDelete ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="danger"
                className="flex-1"
                onClick={async () => {
                  await db.items.delete(item.id!)
                  onClose()
                }}
              >
                Apagar mesmo
              </Button>
              <Button type="button" className="flex-1" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} /> Apagar
            </Button>
          ))}
      </form>
    </Sheet>
  )
}
