import { useState } from 'react'
import type { Area, BlockKind, Recurring } from '../db/schema'
import { AreaPicker, Button, Field, Input, Select, WeekdayPicker, cx } from './ui'

/* ==========================================================================
   Formulário reutilizável de regra recorrente (aula, estágio, treino, rotina).
   Usado em Faculdade (aulas), Trabalho (expediente) e Vida (compromissos fixos).
   ========================================================================== */

export interface RecurringFormProps {
  initial?: Partial<Recurring>
  onSave: (r: Recurring) => Promise<void> | void
  onCancel: () => void
  /** Trava a área (esconde o seletor). */
  fixedArea?: Area
  /** Trava o tipo de bloco (esconde o seletor). */
  fixedKind?: BlockKind
  courseId?: number
}

const KIND_OPTIONS: { value: BlockKind; label: string }[] = [
  { value: 'fixo', label: 'Fixo (aula, estágio, consulta)' },
  { value: 'descanso', label: 'Descanso (lazer programado)' },
  { value: 'rotina', label: 'Rotina' },
]

const TRAVEL_OPTIONS = [0, 15, 30, 45, 60]

export function RecurringForm({ initial, onSave, onCancel, fixedArea, fixedKind, courseId }: RecurringFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [area, setArea] = useState<Area>(fixedArea ?? initial?.area ?? 'vida')
  const [kind, setKind] = useState<BlockKind>(fixedKind ?? initial?.kind ?? 'fixo')
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? [])
  const [startTime, setStartTime] = useState(initial?.startTime ?? '08:00')
  const [endTime, setEndTime] = useState(initial?.endTime ?? '10:00')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [travelMin, setTravelMin] = useState<number>(initial?.travelMin ?? 0)
  const [active, setActive] = useState(initial?.active ?? true)
  const [from, setFrom] = useState(initial?.from ?? '')
  const [until, setUntil] = useState(initial?.until ?? '')
  const [saving, setSaving] = useState(false)

  const valid = title.trim().length > 0 && weekdays.length > 0 && !!startTime && !!endTime

  async function submit() {
    if (!valid || saving) return
    setSaving(true)
    try {
      const r: Recurring = {
        ...(initial?.id ? { id: initial.id } : {}),
        title: title.trim(),
        area: fixedArea ?? area,
        kind: fixedKind ?? kind,
        weekdays: [...weekdays].sort(),
        startTime,
        endTime,
        location: location.trim() || undefined,
        travelMin: travelMin > 0 ? travelMin : undefined,
        courseId: courseId ?? initial?.courseId,
        active,
        from: from || undefined,
        until: until || undefined,
      }
      await onSave(r)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field label="Título">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: Cálculo II, Estágio, Academia" autoFocus />
      </Field>

      {!fixedArea && (
        <div>
          <span className="block text-xs font-display font-bold uppercase tracking-wider text-muted mb-1">Área</span>
          <AreaPicker value={area} onChange={setArea} />
        </div>
      )}

      {!fixedKind && (
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as BlockKind)}>
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div>
        <span className="block text-xs font-display font-bold uppercase tracking-wider text-muted mb-1">Dias da semana</span>
        <WeekdayPicker value={weekdays} onChange={setWeekdays} />
        {weekdays.length === 0 && <span className="block text-xs text-muted mt-1">Escolha pelo menos um dia.</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Começa">
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
        </Field>
        <Field label="Termina">
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
        </Field>
      </div>

      <Field label="Local" hint="Opcional. Aparece no bloco para você não precisar lembrar.">
        <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="ex.: Bloco B, sala 204" />
      </Field>

      <div>
        <span className="block text-xs font-display font-bold uppercase tracking-wider text-muted mb-1">Deslocamento</span>
        <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="Minutos de deslocamento">
          {TRAVEL_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={travelMin === m}
              onClick={() => setTravelMin(m)}
              className={cx(
                'min-h-10 px-3 rounded-full text-sm font-semibold border',
                travelMin === m ? 'bg-accent text-white border-accent' : 'border-line text-muted',
              )}
            >
              {m === 0 ? 'nenhum' : `${m} min`}
            </button>
          ))}
        </div>
        <span className="block text-xs text-muted mt-1">Cria blocos de ida e volta em volta do compromisso.</span>
      </div>

      <label className="flex items-center justify-between gap-3 min-h-11 cursor-pointer">
        <span className="text-sm font-semibold">Ativo</span>
        <span className="flex items-center gap-2 text-sm text-muted">
          {active ? 'gerando blocos' : 'pausado'}
          <input type="checkbox" className="w-5 h-5 accent-accent" checked={active} onChange={(e) => setActive(e.target.checked)} />
        </span>
      </label>

      <details>
        <summary className="text-xs font-bold uppercase tracking-wider text-muted cursor-pointer select-none">Vigência (opcional)</summary>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <Field label="De">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Até">
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        </div>
      </details>

      <div className="flex gap-2 pt-1">
        <Button type="button" className="flex-1" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" className="flex-1" disabled={!valid || saving}>
          {initial?.id ? 'Salvar' : 'Adicionar'}
        </Button>
      </div>
    </form>
  )
}
