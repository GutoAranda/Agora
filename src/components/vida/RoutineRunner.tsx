import { useEffect, useState } from 'react'
import { Check, SkipForward } from 'lucide-react'
import { db, type Routine } from '../../db/schema'
import { fmtDuration, todayKey } from '../../lib/time'
import { Button, Sheet } from '../ui'

/* ==========================================================================
   Rodar rotina: um passo por vez, barra encolhendo, Feito / Pular.
   Sem cronômetro punitivo: passar do tempo só muda o texto.
   ========================================================================== */

export function RoutineRunner({ routine, open, onClose }: { routine: Routine; open: boolean; onClose: () => void }) {
  const [idx, setIdx] = useState(0)
  const [runStart, setRunStart] = useState(0)
  const [stepStart, setStepStart] = useState(0)
  const [now, setNow] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [closedAt, setClosedAt] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    const t = Date.now()
    setIdx(0)
    setRunStart(t)
    setStepStart(t)
    setNow(t)
    setSkipped(0)
    setClosedAt(null)
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [open])

  const steps = routine.steps
  const step = steps[idx]
  const finished = idx >= steps.length

  async function advance(skip: boolean) {
    if (skip) setSkipped((n) => n + 1)
    const next = idx + 1
    setIdx(next)
    setStepStart(Date.now())
    if (next >= steps.length) {
      setClosedAt(Date.now())
      // Marca o bloco de hoje desta rotina como feito, se existir.
      const today = todayKey()
      const blocks = (await db.blocks.where('day').equals(today).toArray()).filter((b) => b.routineId === routine.id && b.status !== 'feito')
      const nowIso = new Date().toISOString()
      for (const b of blocks) await db.blocks.update(b.id!, { status: 'feito', doneAt: nowIso, startedAt: b.startedAt ?? new Date(runStart).toISOString() })
    }
  }

  const totalMs = step ? Math.max(1, step.minutes * 60000) : 1
  const elapsed = now - stepStart
  const left = totalMs - elapsed
  const pct = Math.min(100, Math.max(0, (left / totalMs) * 100))
  const leftMin = Math.ceil(left / 60000)
  const ranMin = Math.max(1, Math.round(((closedAt ?? now) - runStart) / 60000))

  return (
    <Sheet open={open} onClose={onClose} title={routine.name}>
      {finished ? (
        <div className="text-center py-6">
          <p className="text-2xl font-extrabold font-display">Rotina fechada em {ranMin} min</p>
          <p className="text-sm text-muted mt-1">
            {steps.length - skipped} de {steps.length} passos feitos{skipped ? `, ${skipped} ${skipped === 1 ? 'pulado' : 'pulados'}. Tudo bem.` : '.'}
          </p>
          <Button variant="primary" className="mt-5 w-full" onClick={onClose}>
            Fechar
          </Button>
        </div>
      ) : (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted mb-1">
            Passo {idx + 1} de {steps.length}
          </p>
          <h3 className="text-3xl font-extrabold font-display leading-tight mb-4">{step.title}</h3>
          <div className="meter" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted mt-1.5 tabular">
            <span>{left > 0 ? `faltam ${fmtDuration(Math.max(1, leftMin))}` : 'passou do tempo, sem drama'}</span>
            <span>{fmtDuration(step.minutes)} previstos</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-5">
            <Button variant="primary" className="min-h-14 text-lg" onClick={() => void advance(false)}>
              <Check size={22} /> Feito
            </Button>
            <Button className="min-h-14" onClick={() => void advance(true)}>
              <SkipForward size={20} /> Pular
            </Button>
          </div>
          {steps[idx + 1] && <p className="text-sm text-muted mt-4">Depois: {steps[idx + 1].title}</p>}
        </div>
      )}
    </Sheet>
  )
}
