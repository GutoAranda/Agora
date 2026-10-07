import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import { db, type Block, type Settings } from '../../db/schema'
import { useUI } from '../../store/ui'
import { addDays, addMinutes, dayKey, fmtDuration, fromDayKey, hhmm, parseISO, todayKey, type Span } from '../../lib/time'
import { awakeWindow, placeTaskAt, type FreeSlot } from '../../lib/schedule'
import { Button, Field, Input, Sheet } from '../ui'
import { ChoiceChips, ESTIMATE_OPTIONS } from './ChoiceChips'

/* ==========================================================================
   "Entrou algo urgente": acha espaço hoje/amanhã; se não cabe, mostra quais
   blocos de água seriam empurrados para a entrada e pede confirmação.
   ========================================================================== */

/** Igual a freeSlots, mas simulando a remoção de alguns blocos (sem tocar no banco). */
async function simulateSlots(day: string, s: Settings, exclude: Set<string>, notBefore?: Date, minMinutes = 15): Promise<FreeSlot[]> {
  const prev = dayKey(addDays(fromDayKey(day), -1))
  const dayBlocks = await db.blocks.where('day').equals(day).toArray()
  const prevBlocks = (await db.blocks.where('day').equals(prev).toArray()).filter((b) => parseISO(b.end).getTime() > fromDayKey(day).getTime())
  const bufferMs = s.bufferMin * 60000
  const busy: Span[] = [...dayBlocks, ...prevBlocks]
    .filter((b) => b.status !== 'pulado' && b.kind !== 'sono' && !exclude.has(b.id!))
    .map((b) => ({ start: parseISO(b.start).getTime() - bufferMs, end: parseISO(b.end).getTime() + bufferMs }))
    .sort((a, b) => a.start - b.start)
  const win = awakeWindow(day, s)
  let cursor = Math.max(win.start, notBefore ? notBefore.getTime() : 0)
  const out: FreeSlot[] = []
  for (const b of busy) {
    if (b.end <= cursor) continue
    if (b.start > cursor) {
      const end = Math.min(b.start, win.end)
      const min = Math.floor((end - cursor) / 60000)
      if (min >= minMinutes) out.push({ day, start: new Date(cursor), end: new Date(end), minutes: min })
    }
    cursor = Math.max(cursor, b.end)
    if (cursor >= win.end) break
  }
  if (cursor < win.end) {
    const min = Math.floor((win.end - cursor) / 60000)
    if (min >= minMinutes) out.push({ day, start: new Date(cursor), end: new Date(win.end), minutes: min })
  }
  return out
}

export function PedidoUrgente() {
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [firstStep, setFirstStep] = useState('')
  const [estimate, setEstimate] = useState(60)
  const [when, setWhen] = useState<'hoje' | 'amanha'>('hoje')
  const [soft, setSoft] = useState<Block[]>([])
  const [pushed, setPushed] = useState<Set<string>>(new Set())
  const [slot, setSlot] = useState<FreeSlot | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)

  const day = when === 'hoje' ? todayKey() : dayKey(addDays(new Date(), 1))

  useEffect(() => {
    if (!open) return
    setTitle('')
    setFirstStep('')
    setEstimate(60)
    setWhen('hoje')
    setPushed(new Set())
    setBusy(false)
  }, [open])

  // Recalcula o encaixe sempre que muda o dia, a estimativa ou os blocos marcados.
  useEffect(() => {
    if (!open) return
    let alive = true
    setChecking(true)
    void (async () => {
      const notBefore = when === 'hoje' ? new Date() : undefined
      const all = await db.blocks.where('day').equals(day).toArray()
      const candidates = all
        .filter((b) => (b.kind === 'tarefa' || b.kind === 'estudo') && b.status === 'planejado')
        .filter((b) => !notBefore || parseISO(b.end).getTime() > notBefore.getTime())
        .sort((a, b) => a.start.localeCompare(b.start))
      const slots = await simulateSlots(day, settings, pushed, notBefore)
      const fit = slots.find((sl) => sl.minutes >= estimate) ?? null
      if (!alive) return
      setSoft(candidates)
      setSlot(fit)
      setChecking(false)
    })()
    return () => {
      alive = false
    }
  }, [open, day, when, estimate, pushed, settings])

  const needsPush = !slot && soft.length > 0
  const pushedList = soft.filter((b) => pushed.has(b.id!))
  const valid = title.trim().length > 0 && firstStep.trim().length > 0 && !!slot

  function toggle(id: string) {
    setPushed((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function confirm() {
    if (!valid || !slot) return
    setBusy(true)
    for (const b of pushedList) {
      await db.blocks.delete(b.id!)
      if (b.taskId) {
        const t = await db.tasks.get(b.taskId)
        if (t && t.status === 'planejada') await db.tasks.update(b.taskId, { status: 'entrada', rescheduleCount: (t.rescheduleCount ?? 0) + 1 })
      }
    }
    const id = await db.tasks.add({
      title: title.trim(),
      area: 'trabalho',
      status: 'entrada',
      firstStep: firstStep.trim(),
      estimateMin: estimate,
      trigger: { type: 'horario', value: slot.start.toISOString() },
      subtasks: [],
      createdAt: new Date().toISOString(),
      rescheduleCount: 0,
    })
    const task = await db.tasks.get(id)
    if (task) await placeTaskAt(task, slot.start, estimate)
    setOpen(false)
    toast(
      pushedList.length
        ? `Encaixado às ${hhmm(slot.start)}. ${pushedList.length === 1 ? 'Um bloco voltou' : `${pushedList.length} blocos voltaram`} para a entrada.`
        : `Encaixado ${when === 'hoje' ? 'hoje' : 'amanhã'} às ${hhmm(slot.start)}.`,
    )
  }

  return (
    <>
      <Button variant="primary" className="w-full" onClick={() => setOpen(true)}>
        <Zap size={18} /> Entrou algo urgente
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Pedido urgente">
        <div className="grid gap-3">
          <Field label="O que pediram">
            <Input id="urg-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: minuta de resposta ao sindicato" />
          </Field>
          <Field label="Primeiro passo" hint="A menor ação que começa isso.">
            <Input value={firstStep} onChange={(e) => setFirstStep(e.target.value)} placeholder="ex.: abrir o e-mail e listar o que pedem" />
          </Field>
          <Field label="Quanto tempo">
            <ChoiceChips options={ESTIMATE_OPTIONS} value={estimate} onChange={setEstimate} label="Estimativa" />
          </Field>
          <Field label="Preciso">
            <ChoiceChips
              options={[
                { value: 'hoje', label: 'hoje' },
                { value: 'amanha', label: 'amanhã' },
              ]}
              value={when}
              onChange={setWhen}
              label="Quando"
            />
          </Field>

          <div className="rounded-xl bg-bg border border-line p-3 text-sm">
            {checking && <p className="text-muted">Procurando espaço…</p>}
            {!checking && slot && (
              <p>
                Cabe {when === 'hoje' ? 'hoje' : 'amanhã'} às <strong className="tabular">{hhmm(slot.start)}</strong> ({fmtDuration(estimate)} livres até{' '}
                <span className="tabular">{hhmm(addMinutes(slot.start, Math.min(slot.minutes, estimate)))}</span>).
                {pushedList.length > 0 && (
                  <>
                    {' '}
                    Isso empurra: <strong>{pushedList.map((b) => b.title).join(', ')}</strong>. Confirma?
                  </>
                )}
              </p>
            )}
            {!checking && !slot && needsPush && (
              <p className="text-muted">
                Não há {fmtDuration(estimate)} livres {when === 'hoje' ? 'hoje' : 'amanhã'} sem mexer em nada. Marque o que pode voltar para a entrada:
              </p>
            )}
            {!checking && !slot && !needsPush && (
              <p className="text-muted">
                Não cabe {when === 'hoje' ? 'hoje' : 'amanhã'} nem empurrando o que é água. Tente {when === 'hoje' ? 'amanhã' : 'uma estimativa menor'}, ou reduza o
                tempo.
              </p>
            )}
          </div>

          {soft.length > 0 && (
            <ul className="grid gap-1.5" aria-label="Blocos que podem ser empurrados">
              {soft.map((b) => (
                <li key={b.id}>
                  <label className="flex items-center gap-3 rounded-xl border border-line px-3 min-h-11 text-sm">
                    <input type="checkbox" className="w-5 h-5 accent-accent" checked={pushed.has(b.id!)} onChange={() => toggle(b.id!)} />
                    <span className="tabular text-muted w-11">{hhmm(b.start)}</span>
                    <span className="font-semibold truncate">{b.title}</span>
                    <span className="ml-auto text-xs text-muted tabular">
                      {fmtDuration(Math.round((parseISO(b.end).getTime() - parseISO(b.start).getTime()) / 60000))}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <Button variant="primary" className="w-full" disabled={!valid || busy || checking} onClick={() => void confirm()}>
            {pushedList.length ? 'Confirmo, empurra' : 'Encaixar agora'}
          </Button>
        </div>
      </Sheet>
    </>
  )
}
