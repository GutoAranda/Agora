import type { SleepWindow } from '../../db/schema'
import { Field, Input } from '../ui'

/* Janelas de sono: semana e fim de semana. */

function Window({ title, value, onChange }: { title: string; value: SleepWindow; onChange: (w: SleepWindow) => void }) {
  return (
    <div>
      <p className="text-sm font-bold mb-2">{title}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Dormir">
          <Input type="time" value={value.bed} onChange={(e) => onChange({ ...value, bed: e.target.value || value.bed })} />
        </Field>
        <Field label="Acordar">
          <Input type="time" value={value.wake} onChange={(e) => onChange({ ...value, wake: e.target.value || value.wake })} />
        </Field>
      </div>
    </div>
  )
}

export function SleepFields({
  weekday,
  weekend,
  onChange,
}: {
  weekday: SleepWindow
  weekend: SleepWindow
  onChange: (v: { weekday: SleepWindow; weekend: SleepWindow }) => void
}) {
  return (
    <div className="space-y-4">
      <Window title="Dias de semana" value={weekday} onChange={(w) => onChange({ weekday: w, weekend })} />
      <Window title="Fim de semana" value={weekend} onChange={(w) => onChange({ weekday, weekend: w })} />
    </div>
  )
}
