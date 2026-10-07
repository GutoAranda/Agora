import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil } from 'lucide-react'
import { db, type Recurring } from '../../db/schema'
import { useUI } from '../../store/ui'
import { minutesOf, todayKey } from '../../lib/time'
import { dropFutureFromRecurring, materializeAround } from '../../lib/materialize'
import { Button, Card, Field, Input, Section, Textarea, cx } from '../ui'

/* ==========================================================================
   Fechar o expediente: dois campos (o que ficou pendente, primeiro passo de
   amanhã). O primeiro passo vira tarefa na entrada com gatilho de lugar.
   ========================================================================== */

export const CLOSE_TITLE = 'Fechar o expediente'

function minusMinutes(hhmm: string, min: number): string {
  const m = (minutesOf(hhmm) - min + 24 * 60) % (24 * 60)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function FecharExpediente() {
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const today = todayKey()
  const close = useLiveQuery(() => db.workCloses.where('date').equals(today).first(), [today])
  const reminder = useLiveQuery(
    async () => (await db.recurring.where('area').equals('trabalho').toArray()).find((r) => r.title === CLOSE_TITLE) ?? null,
    [],
  )
  const estagio = useLiveQuery(
    async () =>
      (await db.recurring.where('area').equals('trabalho').toArray()).find((r) => r.kind === 'fixo' && r.active && r.title !== CLOSE_TITLE) ?? null,
    [],
  )
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState('')
  const [firstStep, setFirstStep] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (close === undefined) return
    setPending(close?.pending ?? '')
    setFirstStep(close?.firstStepTomorrow ?? '')
  }, [close])

  const showForm = close === null || close === undefined || editing

  async function save() {
    const fs = firstStep.trim()
    if (!fs) return
    setBusy(true)
    const changed = !close || close.firstStepTomorrow !== fs
    if (close?.id) await db.workCloses.update(close.id, { pending: pending.trim(), firstStepTomorrow: fs })
    else await db.workCloses.add({ date: today, pending: pending.trim(), firstStepTomorrow: fs })
    if (changed) {
      await db.tasks.add({
        title: fs,
        area: 'trabalho',
        status: 'entrada',
        firstStep: fs,
        trigger: { type: 'lugar', value: 'quando chegar no trabalho' },
        subtasks: [],
        createdAt: new Date().toISOString(),
        rescheduleCount: 0,
      })
    }
    setEditing(false)
    setBusy(false)
    toast('Expediente fechado. Amanhã já começa com um passo pronto.')
  }

  async function toggleReminder() {
    if (reminder) {
      await dropFutureFromRecurring(reminder.id!, today)
      await db.recurring.delete(reminder.id!)
      toast('Lembrete desligado.')
      return
    }
    if (!estagio) {
      toast('Cadastre o horário do estágio primeiro.')
      return
    }
    const rule: Recurring = {
      title: CLOSE_TITLE,
      area: 'trabalho',
      kind: 'fixo',
      weekdays: [...estagio.weekdays],
      startTime: minusMinutes(estagio.endTime, 10),
      endTime: estagio.endTime,
      active: true,
    }
    await db.recurring.add(rule)
    await materializeAround(new Date(), settings)
    toast(`Lembrete às ${rule.startTime}, nos dias do estágio.`)
  }

  return (
    <Section title="Fechar o expediente">
      <Card area="trabalho">
        {!showForm && close ? (
          <div>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Hoje, fechado</p>
              <button className="p-1 -mt-1 text-muted" aria-label="Editar fechamento" onClick={() => setEditing(true)}>
                <Pencil size={18} />
              </button>
            </div>
            {close.pending ? (
              <>
                <p className="text-xs text-muted mt-2">Ficou pendente</p>
                <p className="text-sm whitespace-pre-wrap">{close.pending}</p>
              </>
            ) : (
              <p className="text-sm text-muted mt-2">Nada ficou pendente.</p>
            )}
            <p className="text-xs text-muted mt-2">Primeiro passo de amanhã</p>
            <p className="font-bold">{close.firstStepTomorrow}</p>
          </div>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <p className="text-sm text-muted">Dois campos e pronto. O resto fica para amanhã, de propósito.</p>
            <Field label="O que ficou pendente">
              <Textarea value={pending} onChange={(e) => setPending(e.target.value)} placeholder="ex.: aguardando retorno do RH sobre o aditivo" />
            </Field>
            <Field label="Primeiro passo de amanhã" hint="Vira tarefa na entrada, com gatilho: quando chegar no trabalho.">
              <Input value={firstStep} onChange={(e) => setFirstStep(e.target.value)} placeholder="ex.: abrir o aditivo e conferir a cláusula 3" />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" className="flex-1" disabled={!firstStep.trim() || busy}>
                Fechar o dia
              </Button>
              {editing && (
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        )}
      </Card>
      <button
        type="button"
        role="switch"
        aria-checked={!!reminder}
        onClick={() => void toggleReminder()}
        className="mt-2 w-full flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 min-h-11 text-sm text-left"
      >
        <span>
          Lembrar 10 min antes do fim do estágio
          {reminder && <span className="text-muted"> · {reminder.startTime}</span>}
          {!reminder && !estagio && <span className="block text-xs text-muted">Precisa do horário do estágio cadastrado.</span>}
        </span>
        <span className={cx('relative inline-block w-11 h-6 rounded-full transition shrink-0', reminder ? 'bg-accent' : 'bg-line')} aria-hidden="true">
          <span className={cx('absolute top-0.5 w-5 h-5 rounded-full bg-white transition', reminder ? 'left-[22px]' : 'left-0.5')} />
        </span>
      </button>
    </Section>
  )
}
