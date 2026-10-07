import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Area } from '../../db/schema'
import { addDays, addMinutes, atTime, dayKey, hhmm, isWeekend, minutesOf, parseISO } from '../../lib/time'
import { autoPlaceTask, sweepUnfinished } from '../../lib/schedule'
import { useUI } from '../../store/ui'
import { AreaPicker, Button, Field, Input, Sheet } from '../ui'

/* ==========================================================================
   Fechar o dia: três perguntas em menos de dois minutos.
   1) A que horas vai dormir?  2) Primeiro compromisso de amanhã?
   3) A única coisa que faria amanhã valer?
   ========================================================================== */

interface Result {
  swept: number
  placedAt: string | null
  created: boolean
}

export function NightReview({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Fechar o dia">
      {open && <NightSteps onClose={onClose} />}
    </Sheet>
  )
}

function NightSteps({ onClose }: { onClose: () => void }) {
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const now = useUI((s) => s.now)
  const today = dayKey(now)
  const tomorrow = dayKey(addDays(now, 1))
  const initialBed = (isWeekend(today) ? settings.sleepWeekend : settings.sleepWeekday).bed

  const [step, setStep] = useState(0)
  const [bed, setBed] = useState(initialBed)
  const [firstInput, setFirstInput] = useState<string | null>(null)
  const [one, setOne] = useState('')
  const [firstStep, setFirstStep] = useState('')
  const [area, setArea] = useState<Area | undefined>()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const tomorrowBlocks = useLiveQuery(() => db.blocks.where('day').equals(tomorrow).toArray(), [tomorrow])
  const firstAuto = (() => {
    const b = (tomorrowBlocks ?? [])
      .filter((x) => (x.kind === 'fixo' || x.kind === 'rotina') && x.status !== 'pulado')
      .sort((a, c) => a.start.localeCompare(c.start))[0]
    return b ? `${b.title} às ${hhmm(b.start)}` : ''
  })()
  const first = firstInput ?? firstAuto

  async function finish() {
    setBusy(true)
    try {
      // 1) Só o sono de hoje muda; a janela padrão fica como está.
      if (bed !== initialBed && /^\d{2}:\d{2}$/.test(bed)) {
        const sono = (await db.blocks.where('day').equals(today).toArray()).find((b) => b.kind === 'sono')
        if (sono) {
          let start = atTime(today, bed)
          if (minutesOf(bed) < 12 * 60) start = addMinutes(start, 24 * 60)
          if (start < parseISO(sono.end)) await db.blocks.update(sono.id!, { start: start.toISOString() })
        }
      }

      // 3) A única coisa de amanhã vira tarefa e tenta ganhar lugar.
      let placedAt: string | null = null
      const title = one.trim()
      let created = false
      if (title) {
        const task = {
          title,
          area,
          status: 'entrada' as const,
          firstStep: firstStep.trim() || undefined,
          subtasks: [],
          createdAt: new Date().toISOString(),
          rescheduleCount: 0,
        }
        const id = (await db.tasks.add(task)) as string
        created = true
        const blockId = await autoPlaceTask({ ...task, id }, settings, new Date(tomorrow + 'T00:00'))
        if (blockId !== null) {
          const b = await db.blocks.get(blockId)
          placedAt = b ? hhmm(b.start) : null
        }
      }

      const swept = await sweepUnfinished(today)
      if (settings.minimalDayOn === today) await db.settings.update('1', { minimalDayOn: undefined })

      await db.reviews.add({
        date: today,
        type: 'noite',
        answers: { dormir: bed, primeiroAmanha: first, umaCoisa: title, primeiroPasso: firstStep.trim() },
        createdAt: new Date().toISOString(),
      })
      setResult({ swept, placedAt, created })
      setStep(3)
    } catch {
      toast('Algo travou ao salvar. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  if (step === 3 && result) {
    const n = result.swept
    return (
      <div className="grid gap-3">
        <p className="font-display text-xl font-bold">Dia fechado.</p>
        <p className="text-[15px]">
          {n === 0 ? 'Nada ficou para trás hoje.' : `${n} ${n === 1 ? 'coisa voltou' : 'coisas voltaram'} para a entrada, sem drama.`}
        </p>
        {result.created && (
          <p className="text-sm text-muted">
            {result.placedAt
              ? `A coisa que importa amanhã já tem lugar: ${result.placedAt}.`
              : 'A coisa que importa amanhã ficou na entrada. Sem espaço livre amanhã; abra a Semana para escolher.'}
          </p>
        )}
        <p className="text-sm text-muted">Dormir às {bed}. Boa noite.</p>
        <Button variant="primary" onClick={onClose}>
          Fechar
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2" aria-label={`Pergunta ${step + 1} de 3`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={i <= step ? 'h-1.5 flex-1 rounded-full bg-accent' : 'h-1.5 flex-1 rounded-full bg-line'} />
        ))}
      </div>

      {step === 0 && (
        <>
          <Field label="1 de 3" hint="Só muda o sono de hoje. A janela padrão fica em Configurações.">
            <span className="block font-display text-lg font-bold mb-2">A que horas vai dormir hoje?</span>
            <Input type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
          </Field>
          <Button variant="primary" onClick={() => setStep(1)}>
            Próxima
          </Button>
        </>
      )}

      {step === 1 && (
        <>
          <Field label="2 de 3" hint={firstAuto ? 'Peguei da sua agenda. Pode confirmar ou corrigir.' : 'Nada fixo na agenda de amanhã. Pode escrever, se houver.'}>
            <span className="block font-display text-lg font-bold mb-2">Qual o primeiro compromisso de amanhã?</span>
            <Input value={first} onChange={(e) => setFirstInput(e.target.value)} placeholder="ex.: aula às 08:00" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setStep(0)}>Voltar</Button>
            <Button variant="primary" onClick={() => setStep(2)}>
              {firstAuto && firstInput === null ? 'Confirmar' : 'Próxima'}
            </Button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <Field label="3 de 3" hint="Uma só. Se fizer isso, o dia valeu.">
            <span className="block font-display text-lg font-bold mb-2">Qual a única coisa que faria amanhã valer?</span>
            <Input autoFocus value={one} onChange={(e) => setOne(e.target.value)} placeholder="ex.: entregar o relatório do estágio" />
          </Field>
          {one.trim() && (
            <>
              <Field label="Primeiro passo" hint="a menor ação que começa isso">
                <Input value={firstStep} onChange={(e) => setFirstStep(e.target.value)} placeholder="ex.: abrir o documento e escrever o título" />
              </Field>
              <div>
                <span className="block text-xs font-display font-bold uppercase tracking-wider text-muted mb-1">Área (opcional)</span>
                <AreaPicker value={area} onChange={setArea} allowEmpty />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setStep(1)} disabled={busy}>
              Voltar
            </Button>
            <Button variant="primary" onClick={() => void finish()} disabled={busy}>
              Fechar o dia
            </Button>
          </div>
          <p className="text-xs text-muted">
            Ao fechar, o que não foi feito hoje volta para a <Link to="/entrada" className="underline">entrada</Link>. Sem vermelho, sem culpa.
          </p>
        </>
      )}
    </div>
  )
}
