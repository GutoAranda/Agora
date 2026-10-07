import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { CalendarPlus, Check, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { db, type Deadline, type DeadlineType, type Milestone } from '../../db/schema'
import { useUI } from '../../store/ui'
import { businessDaysUntil, fmtDay, fmtDuration, fmtRelativeDays, parseISO } from '../../lib/time'
import { distributeDeadline, suggestMilestones } from '../../lib/schedule'
import { Button, Card, Chip, Empty, Field, Input, Section, Select, Sheet } from '../ui'
import { ChoiceChips, ESTIMATE_OPTIONS } from './ChoiceChips'

const toLocal = (iso: string) => format(parseISO(iso), "yyyy-MM-dd'T'HH:mm")
const fromLocal = (v: string) => new Date(v).toISOString()
const TYPE_LABEL: Record<DeadlineType, string> = { entrega: 'Entrega', outro: 'Pedido', trabalho: 'Trabalho', prova: 'Prova', leitura: 'Leitura' }

function defaultDue(): string {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  d.setHours(18, 0, 0, 0)
  return d.toISOString()
}

function newId(): string {
  return Math.random().toString(36).slice(2, 9)
}

export function DeadlineSheet({ open, initial, onClose }: { open: boolean; initial: Deadline | null; onClose: () => void }) {
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<DeadlineType>('entrega')
  const [dueAt, setDueAt] = useState(defaultDue())
  const [estimateMin, setEstimateMin] = useState(60)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(initial?.title ?? '')
    setType(initial?.type ?? 'entrega')
    setDueAt(initial?.dueAt ?? defaultDue())
    setEstimateMin(initial?.estimateMin ?? 60)
    setMilestones(initial?.milestones ?? [])
    setBusy(false)
  }, [open, initial])

  const valid = title.trim().length > 0 && !Number.isNaN(parseISO(dueAt).getTime())

  function suggest() {
    setMilestones(suggestMilestones({ type, dueAt, estimateMin, title }))
  }

  function patchMilestone(id: string, patch: Partial<Milestone>) {
    setMilestones((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  async function persist(): Promise<Deadline> {
    const row: Deadline = {
      id: initial?.id,
      title: title.trim(),
      area: 'trabalho',
      type,
      dueAt,
      estimateMin,
      milestones: milestones.filter((m) => m.title.trim()),
      done: initial?.done ?? false,
      notes: initial?.notes,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    }
    if (row.id) {
      await db.deadlines.put(row)
      return row
    }
    delete row.id
    const id = await db.deadlines.add(row)
    return { ...row, id: id as number }
  }

  async function save() {
    if (!valid) return
    setBusy(true)
    await persist()
    toast('Prazo salvo.')
    onClose()
  }

  async function distribute() {
    if (!valid) return
    setBusy(true)
    const d = await persist()
    if (!d.milestones.length) {
      toast('Sugira ou crie marcos antes de distribuir.')
      setBusy(false)
      return
    }
    const n = await distributeDeadline(d, settings)
    toast(n ? `${n} ${n === 1 ? 'bloco entrou' : 'blocos entraram'} na agenda.` : 'Não achei espaço livre antes dos marcos. Tente ajustar as datas.')
    onClose()
  }

  async function conclude() {
    setBusy(true)
    const d = await persist()
    await db.deadlines.update(d.id!, { done: true })
    toast('Entregue. Isso conta.')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={initial?.id ? 'Editar prazo' : 'Nova entrega ou pedido'}>
      <div className="grid gap-3">
        <Field label="O que é">
          <Input id="dl-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: parecer sobre o contrato X" />
        </Field>
        <Field label="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value as DeadlineType)}>
            <option value="entrega">Entrega</option>
            <option value="outro">Pedido / outro</option>
          </Select>
        </Field>
        <Field label="Prazo">
          <Input type="datetime-local" value={toLocal(dueAt)} onChange={(e) => e.target.value && setDueAt(fromLocal(e.target.value))} />
        </Field>
        <Field label="Estimativa total">
          <ChoiceChips options={ESTIMATE_OPTIONS} value={estimateMin} onChange={setEstimateMin} label="Estimativa" />
        </Field>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-display font-bold uppercase tracking-wider text-muted">Marcos</span>
            <div className="flex gap-1">
              <Button variant="ghost" className="min-h-9 px-2 text-sm" onClick={suggest}>
                <Sparkles size={16} /> Sugerir
              </Button>
              <Button
                variant="ghost"
                className="min-h-9 px-2 text-sm"
                onClick={() => setMilestones((ms) => [...ms, { id: newId(), title: '', dueAt, done: false, estimateMin: 30 }])}
              >
                <Plus size={16} /> Marco
              </Button>
            </div>
          </div>
          {milestones.length === 0 && (
            <p className="text-sm text-muted">Sem marcos, o prazo vira um bloco só no fim. Marcos deixam o caminho visível.</p>
          )}
          <div className="grid gap-2">
            {milestones.map((m, i) => (
              <div key={m.id} className="rounded-xl border border-line p-2 grid gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted tabular w-4">{i + 1}.</span>
                  <Input value={m.title} onChange={(e) => patchMilestone(m.id, { title: e.target.value })} placeholder="o que fica pronto neste marco" />
                  <button className="p-2 text-muted" aria-label="Remover marco" onClick={() => setMilestones((ms) => ms.filter((x) => x.id !== m.id))}>
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                  <Input type="datetime-local" value={toLocal(m.dueAt)} onChange={(e) => e.target.value && patchMilestone(m.id, { dueAt: fromLocal(e.target.value) })} />
                  <label className="flex items-center gap-1 text-sm text-muted">
                    <Input
                      type="number"
                      min={5}
                      step={5}
                      className="w-20"
                      value={m.estimateMin}
                      onChange={(e) => patchMilestone(m.id, { estimateMin: Math.max(5, Number(e.target.value) || 5) })}
                    />
                    min
                  </label>
                </div>
                {m.done && <Chip tone="ok">feito</Chip>}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-1">
          <Button onClick={() => void distribute()} disabled={!valid || busy}>
            <CalendarPlus size={18} /> Distribuir na agenda
          </Button>
          <Button onClick={() => void conclude()} disabled={!valid || busy}>
            <Check size={18} /> Concluir
          </Button>
          <Button variant="primary" className="col-span-2" onClick={() => void save()} disabled={!valid || busy}>
            Salvar
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

export function Entregas() {
  const toast = useUI((s) => s.toast)
  const rows = useLiveQuery(async () => (await db.deadlines.where('area').equals('trabalho').toArray()).sort((a, b) => a.dueAt.localeCompare(b.dueAt)), [])
  const [sheet, setSheet] = useState<{ open: boolean; initial: Deadline | null }>({ open: false, initial: null })
  const open = (rows ?? []).filter((d) => !d.done)
  const done = (rows ?? []).filter((d) => d.done)

  return (
    <Section
      title="Entregas e pedidos"
      right={
        <Button className="min-h-9 px-3 text-sm" onClick={() => setSheet({ open: true, initial: null })}>
          <Plus size={16} /> Prazo
        </Button>
      }
    >
      {rows && open.length === 0 && (
        <Empty title="Nada com prazo" hint="Quando pedirem algo com data, registre aqui. O app quebra em marcos e encaixa na agenda." />
      )}
      <div className="grid gap-2">
        {open.map((d) => {
          const bd = businessDaysUntil(d.dueAt)
          const doneMs = d.milestones.filter((m) => m.done).length
          const late = parseISO(d.dueAt).getTime() < Date.now()
          return (
            <Card key={d.id} area="trabalho" className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Chip>{TYPE_LABEL[d.type]}</Chip>
                    <Chip tone={late ? 'warn' : bd <= 2 ? 'accent' : 'muted'}>{fmtRelativeDays(d.dueAt)}</Chip>
                  </div>
                  <p className="font-bold truncate">{d.title}</p>
                  <p className="text-sm text-muted tabular">
                    {fmtDay(d.dueAt, "EEE, d 'de' MMM 'às' HH:mm")} · {late ? 'prazo passou' : `${bd} ${bd === 1 ? 'dia útil' : 'dias úteis'}`} · {fmtDuration(d.estimateMin)}
                    {d.milestones.length ? ` · marcos ${doneMs}/${d.milestones.length}` : ''}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button className="p-2 text-muted" aria-label="Editar" onClick={() => setSheet({ open: true, initial: d })}>
                    <Pencil size={18} />
                  </button>
                  <button
                    className="p-2 text-muted"
                    aria-label="Concluir"
                    onClick={async () => {
                      await db.deadlines.update(d.id!, { done: true })
                      toast('Entregue. Isso conta.')
                    }}
                  >
                    <Check size={18} />
                  </button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
      {done.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs font-bold uppercase tracking-wider text-muted cursor-pointer select-none">Concluídas ({done.length})</summary>
          <ul className="mt-2 text-sm text-muted grid gap-1">
            {done.slice(-10).map((d) => (
              <li key={d.id} className="flex justify-between gap-2">
                <span className="truncate line-through">{d.title}</span>
                <span className="tabular shrink-0">{fmtDay(d.dueAt)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <DeadlineSheet open={sheet.open} initial={sheet.initial} onClose={() => setSheet({ open: false, initial: null })} />
    </Section>
  )
}
