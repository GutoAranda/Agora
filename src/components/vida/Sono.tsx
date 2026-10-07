import { useEffect, useState } from 'react'
import { Moon } from 'lucide-react'
import { updateSettings, type SleepWindow } from '../../db/schema'
import { useUI } from '../../store/ui'
import { fmtDuration, minutesOf, todayKey } from '../../lib/time'
import { dropFutureSleep, materializeAround } from '../../lib/materialize'
import { Button, Card, Field, Input, Section } from '../ui'

function sleepLength(w: SleepWindow): number {
  return (minutesOf(w.wake) - minutesOf(w.bed) + 24 * 60) % (24 * 60)
}

function WindowEditor({ label, value, onChange }: { label: string; value: SleepWindow; onChange: (w: SleepWindow) => void }) {
  return (
    <div>
      <p className="text-xs font-display font-bold uppercase tracking-wider text-muted mb-1">
        {label} <span className="font-body font-normal normal-case tracking-normal">· {fmtDuration(sleepLength(value))} de sono</span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Dormir">
          <Input type="time" value={value.bed} onChange={(e) => e.target.value && onChange({ ...value, bed: e.target.value })} />
        </Field>
        <Field label="Acordar">
          <Input type="time" value={value.wake} onChange={(e) => e.target.value && onChange({ ...value, wake: e.target.value })} />
        </Field>
      </div>
    </div>
  )
}

/** Sono como âncora: a janela em que o app não agenda nada sem confirmação. */
export function Sono() {
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const [weekday, setWeekday] = useState<SleepWindow>(settings.sleepWeekday)
  const [weekend, setWeekend] = useState<SleepWindow>(settings.sleepWeekend)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setWeekday(settings.sleepWeekday)
    setWeekend(settings.sleepWeekend)
  }, [settings.sleepWeekday, settings.sleepWeekend])

  const dirty =
    weekday.bed !== settings.sleepWeekday.bed ||
    weekday.wake !== settings.sleepWeekday.wake ||
    weekend.bed !== settings.sleepWeekend.bed ||
    weekend.wake !== settings.sleepWeekend.wake

  async function save() {
    setBusy(true)
    await updateSettings({ sleepWeekday: weekday, sleepWeekend: weekend })
    await dropFutureSleep(todayKey())
    await materializeAround(new Date(), { ...settings, sleepWeekday: weekday, sleepWeekend: weekend })
    setBusy(false)
    toast('Janela de sono atualizada.')
  }

  return (
    <Section title="Sono como âncora">
      <Card area="vida">
        <div className="flex items-center gap-2 mb-3">
          <Moon size={18} className="text-muted" />
          <p className="text-sm text-muted">O app não agenda nada dentro dessa janela sem você confirmar.</p>
        </div>
        <div className="grid gap-4">
          <WindowEditor label="Dias de semana" value={weekday} onChange={setWeekday} />
          <WindowEditor label="Fim de semana" value={weekend} onChange={setWeekend} />
        </div>
        {dirty && (
          <div className="flex gap-2 mt-4">
            <Button variant="primary" className="flex-1" disabled={busy} onClick={() => void save()}>
              Salvar janela
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setWeekday(settings.sleepWeekday)
                setWeekend(settings.sleepWeekend)
              }}
            >
              Desfazer
            </Button>
          </div>
        )}
      </Card>
    </Section>
  )
}
