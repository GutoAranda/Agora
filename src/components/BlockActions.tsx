import { useState } from 'react'
import { Check, Clock, Play, Scissors } from 'lucide-react'
import { db, type Block } from '../db/schema'
import { addMinutes, parseISO } from '../lib/time'
import { useUI } from '../store/ui'
import { Button, Input, Sheet } from './ui'

/* ==========================================================================
   Os três botões do loop: Feito · Adiar 10 min · Quebrar (+ Começar).
   Usados na tela Agora, na Semana e nas notificações.
   ========================================================================== */

const CHEERS = [
  'Feito. Isso conta.',
  'Mais um no placar.',
  'Começou e terminou. É assim que funciona.',
  'Boa. Próximo quando quiser.',
  'Fechou. Respira.',
  'Pronto. O dia já valeu.',
]

export async function startBlock(b: Block): Promise<void> {
  await db.blocks.update(b.id!, { status: 'iniciado', startedAt: b.startedAt ?? new Date().toISOString() })
}

export async function finishBlock(b: Block): Promise<void> {
  const now = new Date().toISOString()
  await db.blocks.update(b.id!, { status: 'feito', doneAt: now, startedAt: b.startedAt ?? b.start })
  if (b.taskId) {
    await db.tasks.update(b.taskId, { status: 'feita', doneAt: now })
  }
  if (b.deadlineId && b.notes?.startsWith('marco:')) {
    // Se todos os blocos do marco foram feitos, marca o marco.
    const mid = b.notes.slice(6)
    const siblings = await db.blocks.where('deadlineId').equals(b.deadlineId).toArray()
    const open = siblings.filter((x) => x.notes === b.notes && x.id !== b.id && x.status !== 'feito' && x.status !== 'pulado')
    if (!open.length) {
      const d = await db.deadlines.get(b.deadlineId)
      if (d) await db.deadlines.update(d.id!, { milestones: d.milestones.map((m) => (m.id === mid ? { ...m, done: true } : m)) })
    }
  }
}

export async function postponeBlock(b: Block, minutes = 10): Promise<void> {
  const start = addMinutes(parseISO(b.start), minutes)
  const end = addMinutes(parseISO(b.end), minutes)
  await db.blocks.update(b.id!, { start: start.toISOString(), end: end.toISOString() })
}

export async function skipBlock(b: Block): Promise<void> {
  await db.blocks.update(b.id!, { status: 'pulado' })
  if (b.taskId) {
    const t = await db.tasks.get(b.taskId)
    if (t && t.status === 'planejada') await db.tasks.update(b.taskId, { status: 'entrada', rescheduleCount: (t.rescheduleCount ?? 0) + 1 })
  }
}

/** Quebrar: substitui o bloco por um primeiro passo curto, e devolve o resto à tarefa. */
export async function splitBlock(b: Block, firstStep: string, minutes: number): Promise<void> {
  const start = parseISO(b.start)
  const end = addMinutes(start, minutes)
  await db.blocks.update(b.id!, { title: `${b.title} · ${firstStep}`, firstStep, end: end.toISOString() })
  if (b.taskId) {
    const t = await db.tasks.get(b.taskId)
    if (t) {
      await db.tasks.update(b.taskId, {
        firstStep,
        subtasks: [{ title: firstStep, done: false }, ...t.subtasks.filter((s) => s.title !== firstStep)],
      })
    }
  }
}

export function BlockActions({ block, compact }: { block: Block; compact?: boolean }) {
  const toast = useUI((s) => s.toast)
  const [split, setSplit] = useState(false)
  const [step, setStep] = useState(block.firstStep ?? '')
  const [min, setMin] = useState(10)
  const started = block.status === 'iniciado'

  return (
    <>
      <div className={compact ? 'flex gap-1.5' : 'grid grid-cols-3 gap-2'}>
        {!started && !compact && (
          <Button variant="primary" className="col-span-3" onClick={() => void startBlock(block)}>
            <Play size={18} /> Começar{block.firstStep ? `: ${block.firstStep}` : ''}
          </Button>
        )}
        <Button
          variant={started || compact ? 'primary' : 'secondary'}
          className={compact ? 'px-3 min-h-9 text-sm' : ''}
          onClick={async () => {
            await finishBlock(block)
            toast(CHEERS[Math.floor(Math.random() * CHEERS.length)])
          }}
        >
          <Check size={18} /> Feito
        </Button>
        <Button className={compact ? 'px-3 min-h-9 text-sm' : ''} onClick={() => void postponeBlock(block)}>
          <Clock size={18} /> {compact ? '+10' : 'Adiar 10 min'}
        </Button>
        <Button className={compact ? 'px-3 min-h-9 text-sm' : ''} onClick={() => setSplit(true)}>
          <Scissors size={18} /> Quebrar
        </Button>
      </div>
      <Sheet open={split} onClose={() => setSplit(false)} title="Quebrar em um passo menor">
        <p className="text-sm text-muted mb-3">Qual é a menor coisa que você consegue fazer agora? Só isso vira o bloco.</p>
        <Input id="split-step" autoFocus value={step} onChange={(e) => setStep(e.target.value)} placeholder="ex.: abrir o arquivo e ler a primeira página" />
        <div className="flex gap-2 mt-3">
          {[5, 10, 15, 25].map((m) => (
            <Button key={m} variant={min === m ? 'primary' : 'secondary'} className="flex-1" onClick={() => setMin(m)}>
              {m} min
            </Button>
          ))}
        </div>
        <Button
          variant="primary"
          className="w-full mt-4"
          disabled={!step.trim()}
          onClick={async () => {
            await splitBlock(block, step.trim(), min)
            setSplit(false)
            toast(`Agora é só: ${step.trim()}`)
          }}
        >
          Começar só isso
        </Button>
      </Sheet>
    </>
  )
}
