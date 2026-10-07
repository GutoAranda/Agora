import { useState } from 'react'
import { format, nextSaturday } from 'date-fns'
import type { Trigger } from '../../db/schema'
import { addDays, atTime, dayKey, parseISO, todayKey } from '../../lib/time'
import { Input } from '../ui'
import { ChoiceChip } from './ChoiceChip'

/* ==========================================================================
   Gatilho "se-então": quando (horário) ou onde (lugar / depois de).
   ========================================================================== */

type TriggerType = Trigger['type']

const TYPES: { type: TriggerType; label: string }[] = [
  { type: 'horario', label: 'Horário' },
  { type: 'lugar', label: 'Lugar' },
  { type: 'depois', label: 'Depois de' },
]

const LUGAR_CHIPS = ['quando chegar no trabalho', 'quando chegar em casa', 'na faculdade']
const DEPOIS_CHIPS = ['depois do almoço', 'depois da aula', 'antes de dormir']

function toLocalInput(iso: string): string {
  try {
    return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm")
  } catch {
    return ''
  }
}

function timeChips(): { label: string; at: Date }[] {
  const now = new Date()
  return [
    { label: 'hoje à noite 20:00', at: atTime(todayKey(), '20:00') },
    { label: 'amanhã de manhã 09:00', at: atTime(dayKey(addDays(now, 1)), '09:00') },
    { label: 'sábado 10:00', at: atTime(dayKey(nextSaturday(now)), '10:00') },
  ]
}

export function TriggerChooser({ value, onChange }: { value?: Trigger; onChange: (t: Trigger | undefined) => void }) {
  const [type, setType] = useState<TriggerType>(value?.type ?? 'horario')
  const current = value?.type === type ? value.value : ''

  function pick(t: TriggerType) {
    setType(t)
    if (value?.type !== t) onChange(undefined)
  }

  function set(v: string) {
    onChange(v ? { type, value: v } : undefined)
  }

  return (
    <div>
      <div className="flex gap-2 mb-2" role="radiogroup" aria-label="Tipo de gatilho">
        {TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            role="radio"
            aria-checked={type === t.type}
            onClick={() => pick(t.type)}
            className={
              type === t.type
                ? 'flex-1 min-h-11 rounded-xl border border-transparent bg-accent/15 text-accent text-sm font-semibold'
                : 'flex-1 min-h-11 rounded-xl border border-line text-muted text-sm font-semibold'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {type === 'horario' && (
        <div className="grid gap-2">
          <Input
            type="datetime-local"
            aria-label="Data e hora"
            value={current ? toLocalInput(current) : ''}
            onChange={(e) => {
              const v = e.target.value
              if (!v) return set('')
              const d = new Date(v)
              set(Number.isNaN(d.getTime()) ? '' : d.toISOString())
            }}
          />
          <div className="flex flex-wrap gap-2">
            {timeChips().map((c) => {
              const iso = c.at.toISOString()
              return (
                <ChoiceChip key={c.label} active={current === iso} onClick={() => set(iso)}>
                  {c.label}
                </ChoiceChip>
              )
            })}
          </div>
        </div>
      )}

      {type !== 'horario' && (
        <div className="grid gap-2">
          <Input
            aria-label={type === 'lugar' ? 'Lugar' : 'Depois de quê'}
            value={current}
            onChange={(e) => set(e.target.value)}
            placeholder={type === 'lugar' ? 'ex.: quando chegar em casa' : 'ex.: depois do almoço'}
          />
          <div className="flex flex-wrap gap-2">
            {(type === 'lugar' ? LUGAR_CHIPS : DEPOIS_CHIPS).map((c) => (
              <ChoiceChip key={c} active={current === c} onClick={() => set(c)}>
                {c}
              </ChoiceChip>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
