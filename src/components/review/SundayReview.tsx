import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { subDays } from 'date-fns'
import { db, type Area, type Task } from '../../db/schema'
import { addMinutes, businessDaysUntil, fmtDay, fmtRelativeDays, parseISO, todayKey } from '../../lib/time'
import { autoPlaceTask, placeTaskAt } from '../../lib/schedule'
import { useUI } from '../../store/ui'
import { AreaDot, AreaPicker, Button, Chip, Field, Input, Sheet, cx } from '../ui'
import { describeTrigger } from '../inbox/format'
import { ScoreBoard } from './ScoreBoard'

/* ==========================================================================
   Revisão da semana (domingo), 5 passos:
   placar → esvaziar a entrada → prazos → posicionar → as 3 coisas que importam.
   ========================================================================== */

const STEPS = ['Placar', 'Entrada', 'Prazos', 'Posicionar', 'Foco']

interface Foco {
  title: string
  area?: Area
  firstStep: string
}

const emptyFoco = (): Foco => ({ title: '', firstStep: '' })

/** Semana a avaliar: no fim de semana, a atual; durante a semana, a anterior. */
function reviewAnchor(now: Date): Date {
  const wd = now.getDay()
  return wd === 0 || wd === 6 ? now : subDays(now, 7)
}

export function SundayReview({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Revisão da semana">
      {open && <SundaySteps onClose={onClose} />}
    </Sheet>
  )
}

function SundaySteps({ onClose }: { onClose: () => void }) {
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const [step, setStep] = useState(0)
  const [focos, setFocos] = useState<Foco[]>([emptyFoco(), emptyFoco(), emptyFoco()])
  const [busy, setBusy] = useState(false)
  const [placedReport, setPlacedReport] = useState<string | null>(null)
  const now = useUI((s) => s.now)
  const anchor = useMemo(() => reviewAnchor(now), [now])

  const inbox = useLiveQuery(
    async () => (await db.tasks.where('status').equals('entrada').toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [],
  )
  const deadlines = useLiveQuery(async () => {
    const limit = addMinutes(new Date(), 21 * 24 * 60).getTime()
    const start = new Date(todayKey() + 'T00:00').getTime()
    return (await db.deadlines.toArray())
      .filter((d) => !d.done && parseISO(d.dueAt).getTime() <= limit && parseISO(d.dueAt).getTime() >= start)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  }, [])
  const ready = useMemo(() => (inbox ?? []).filter((t) => t.trigger?.value && t.firstStep && t.area), [inbox])

  async function placeAll() {
    setBusy(true)
    try {
      let placed = 0
      const total = ready.length
      for (const t of ready) {
        const id = await placeOne(t)
        if (id !== null) placed++
      }
      setPlacedReport(placed === total ? `Encaixei ${placed === 1 ? 'a única' : `todas as ${placed}`}.` : `Encaixei ${placed} de ${total}. O resto fica na entrada, sem espaço nos próximos 7 dias.`)
    } finally {
      setBusy(false)
    }
  }

  async function placeOne(t: Task): Promise<string | null> {
    if (t.trigger?.type === 'horario') {
      const start = parseISO(t.trigger.value)
      if (start.getTime() > Date.now()) return placeTaskAt(t, start, t.estimateMin ?? 30)
    }
    return autoPlaceTask(t, settings)
  }

  const focoProblems = focos
    .map((f, i) => {
      if (!f.title.trim()) return null
      if (!f.area) return `${i + 1}: falta área`
      if (!f.firstStep.trim()) return `${i + 1}: falta primeiro passo`
      return null
    })
    .filter((x): x is string => x !== null)
  const anyFoco = focos.some((f) => f.title.trim())

  async function finish() {
    if (focoProblems.length) {
      toast(`Para fechar: ${focoProblems.join(' · ')}.`)
      return
    }
    setBusy(true)
    try {
      const now = new Date().toISOString()
      for (const f of focos) {
        if (!f.title.trim() || !f.area) continue
        await db.tasks.add({
          title: f.title.trim(),
          area: f.area,
          status: 'entrada',
          firstStep: f.firstStep.trim(),
          subtasks: [],
          createdAt: now,
          rescheduleCount: 0,
        })
      }
      await db.reviews.add({
        date: todayKey(),
        type: 'domingo',
        answers: {
          foco1: focos[0].title.trim(),
          foco2: focos[1].title.trim(),
          foco3: focos[2].title.trim(),
          encaixadas: placedReport ?? '',
        },
        createdAt: now,
      })
      toast(anyFoco ? 'Semana revisada. As 3 coisas estão na entrada, prontas para ganhar hora.' : 'Semana revisada.')
      onClose()
    } catch {
      toast('Algo travou ao salvar. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  function update(i: number, patch: Partial<Foco>) {
    setFocos(focos.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  }

  const nav = (
    <div className="grid grid-cols-2 gap-2 mt-2">
      <Button onClick={() => setStep(step - 1)} disabled={step === 0 || busy}>
        Voltar
      </Button>
      {step < 4 ? (
        <Button variant="primary" onClick={() => setStep(step + 1)} disabled={busy}>
          Próximo
        </Button>
      ) : (
        <Button variant="primary" onClick={() => void finish()} disabled={busy}>
          Fechar a semana
        </Button>
      )}
    </div>
  )

  return (
    <div className="grid gap-4">
      <div>
        <div className="flex items-center gap-1.5" aria-label={`Passo ${step + 1} de 5: ${STEPS[step]}`}>
          {STEPS.map((s, i) => (
            <span key={s} className={cx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-accent' : 'bg-line')} />
          ))}
        </div>
        <p className="text-xs text-muted mt-1.5">
          {step + 1} de 5 · {STEPS[step]}
        </p>
      </div>

      {step === 0 && (
        <>
          <h3 className="font-display text-lg font-bold">Placar da semana passada</h3>
          <ScoreBoard anchor={anchor} />
          {nav}
        </>
      )}

      {step === 1 && (
        <>
          <h3 className="font-display text-lg font-bold">Esvaziar a entrada</h3>
          <p className="text-sm text-muted">
            {inbox?.length
              ? `${inbox.length} ${inbox.length === 1 ? 'coisa esperando' : 'coisas esperando'} forma: área, gatilho e primeiro passo.`
              : 'Entrada vazia. Cabeça leve.'}
          </p>
          {(inbox ?? []).length > 0 && (
            <ul className="divide-y divide-line border border-line rounded-2xl max-h-64 overflow-y-auto">
              {(inbox ?? []).map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  {t.area ? <AreaDot area={t.area} /> : <span className="inline-block w-2.5 h-2.5 rounded-full border border-line" />}
                  <span className="truncate flex-1">{t.title}</span>
                  {t.trigger?.value && t.firstStep && t.area ? <Chip tone="ok">pronta</Chip> : <Chip>sem forma</Chip>}
                </li>
              ))}
            </ul>
          )}
          <Link to="/entrada" onClick={onClose} className="text-sm font-semibold text-accent underline">
            Abrir a entrada e dar forma
          </Link>
          {nav}
        </>
      )}

      {step === 2 && (
        <>
          <h3 className="font-display text-lg font-bold">Prazos das próximas 3 semanas</h3>
          {deadlines && deadlines.length === 0 && <p className="text-sm text-muted">Nenhum prazo nas próximas 3 semanas. Respira.</p>}
          {(deadlines ?? []).length > 0 && (
            <ul className="divide-y divide-line border border-line rounded-2xl">
              {(deadlines ?? []).map((d) => {
                const bd = businessDaysUntil(d.dueAt)
                const ms = d.milestones.length
                const msDone = d.milestones.filter((m) => m.done).length
                return (
                  <li key={d.id} className={cx(`area-${d.area}`, 'px-3 py-2.5')}>
                    <div className="flex items-center gap-2">
                      <AreaDot area={d.area} />
                      <span className="font-semibold truncate flex-1">{d.title}</span>
                      <Chip tone={bd <= 3 ? 'accent' : 'muted'}>{bd === 0 ? 'é hoje' : `${bd} ${bd === 1 ? 'dia útil' : 'dias úteis'}`}</Chip>
                    </div>
                    <p className="text-xs text-muted mt-0.5 pl-[18px]">
                      {fmtDay(d.dueAt)} ({fmtRelativeDays(d.dueAt)})
                      {ms > 0 ? ` · ${msDone} de ${ms} marcos feitos` : ' · sem marcos'}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
          <Link to="/areas/faculdade" onClick={onClose} className="text-sm font-semibold text-accent underline">
            Ver prazos e marcos
          </Link>
          {nav}
        </>
      )}

      {step === 3 && (
        <>
          <h3 className="font-display text-lg font-bold">Posicionar</h3>
          <p className="text-sm text-muted">
            {ready.length
              ? `${ready.length} ${ready.length === 1 ? 'tarefa já tem' : 'tarefas já têm'} área, gatilho e primeiro passo. Dá para encaixar na semana.`
              : 'Nada pronto para encaixar. As que ganharem forma na entrada aparecem aqui.'}
          </p>
          {ready.length > 0 && (
            <ul className="divide-y divide-line border border-line rounded-2xl max-h-64 overflow-y-auto">
              {ready.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  {t.area && <AreaDot area={t.area} />}
                  <span className="truncate flex-1">{t.title}</span>
                  <span className="text-xs text-muted truncate max-w-[40%]">{describeTrigger(t.trigger)}</span>
                </li>
              ))}
            </ul>
          )}
          {ready.length > 0 && (
            <Button variant="primary" onClick={() => void placeAll()} disabled={busy}>
              Encaixar todas
            </Button>
          )}
          {placedReport && <p className="text-sm">{placedReport}</p>}
          {nav}
        </>
      )}

      {step === 4 && (
        <>
          <h3 className="font-display text-lg font-bold">As 3 coisas que importam</h3>
          <p className="text-sm text-muted">Se só isso acontecer, a semana valeu. Cada uma precisa de área e primeiro passo.</p>
          {focos.map((f, i) => (
            <div key={i} className="grid gap-2 rounded-2xl border border-line p-3">
              <Field label={`Coisa ${i + 1}`}>
                <Input value={f.title} onChange={(e) => update(i, { title: e.target.value })} placeholder={i === 0 ? 'ex.: fechar o capítulo 2 do TCC' : ''} />
              </Field>
              {f.title.trim() && (
                <>
                  <AreaPicker value={f.area} onChange={(a) => update(i, { area: a })} />
                  <Input
                    value={f.firstStep}
                    onChange={(e) => update(i, { firstStep: e.target.value })}
                    placeholder="primeiro passo: a menor ação que começa isso"
                    aria-label={`Primeiro passo da coisa ${i + 1}`}
                  />
                </>
              )}
            </div>
          ))}
          {focoProblems.length > 0 && <p className="text-xs text-muted">Falta: {focoProblems.join(' · ')}.</p>}
          {nav}
        </>
      )}
    </div>
  )
}
