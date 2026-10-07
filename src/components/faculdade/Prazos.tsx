import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarPlus, Check, Plus, Sparkles, Trash2 } from 'lucide-react'
import { db, type Course, type Deadline, type DeadlineType, type Milestone } from '../../db/schema'
import { distributeDeadline, suggestMilestones } from '../../lib/schedule'
import { businessDaysUntil, fmtDay, fmtDuration, fmtRelativeDays } from '../../lib/time'
import { useUI } from '../../store/ui'
import { Button, Card, Chip, Empty, Field, Input, Select, Sheet, Textarea, cx } from '../ui'
import { ESTIMATE_CHIPS, ProgressBar, confirmAsk, fromLocalInput, toLocalInput } from './shared'

/* ==========================================================================
   Prazos da faculdade: trabalhos, provas, entregas. Marcos intermediários e
   distribuição automática de blocos de estudo na agenda.
   ========================================================================== */

const TYPE_LABEL: Record<DeadlineType, string> = {
  trabalho: 'Trabalho',
  prova: 'Prova',
  leitura: 'Leitura',
  entrega: 'Entrega',
  outro: 'Outro',
}

function newId(): string {
  return Math.random().toString(36).slice(2, 9)
}

function defaultDue(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  d.setHours(23, 59, 0, 0)
  return d.toISOString()
}

function DeadlineSheet({ deadline, courses, onClose }: { deadline: Partial<Deadline> | null; courses: Course[]; onClose: () => void }) {
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const [title, setTitle] = useState(deadline?.title ?? '')
  const [type, setType] = useState<DeadlineType>(deadline?.type ?? 'trabalho')
  const [courseId, setCourseId] = useState<number | undefined>(deadline?.courseId)
  const [dueAt, setDueAt] = useState(deadline?.dueAt ?? defaultDue())
  const [estimateMin, setEstimateMin] = useState(deadline?.estimateMin ?? 240)
  const [milestones, setMilestones] = useState<Milestone[]>(deadline?.milestones ?? [])
  const [notes, setNotes] = useState(deadline?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const scheduled = useLiveQuery(
    () => (deadline?.id ? db.blocks.where('deadlineId').equals(deadline.id).filter((b) => b.status !== 'pulado').count() : 0),
    [deadline?.id],
    0,
  )

  if (!deadline) return null
  const isNew = !deadline.id
  const valid = title.trim().length > 0 && !!dueAt

  function suggest() {
    setMilestones(suggestMilestones({ type, dueAt, estimateMin, title }))
  }

  function patchMilestone(id: string, patch: Partial<Milestone>) {
    setMilestones((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  async function persist(): Promise<Deadline | null> {
    if (!valid) return null
    const ms = isNew && milestones.length === 0 ? suggestMilestones({ type, dueAt, estimateMin, title }) : milestones
    const data: Deadline = {
      ...(deadline?.id ? { id: deadline.id } : {}),
      title: title.trim(),
      area: 'faculdade',
      type,
      courseId,
      dueAt,
      estimateMin,
      milestones: ms.map((m) => ({ ...m, title: m.title.trim() || 'Marco' })),
      done: deadline?.done ?? false,
      notes: notes.trim() || undefined,
      createdAt: deadline?.createdAt ?? new Date().toISOString(),
    }
    const id = (await db.deadlines.put(data)) as number
    return { ...data, id }
  }

  async function distribute() {
    if (busy) return
    setBusy(true)
    try {
      const d = await persist()
      if (!d) return
      const n = await distributeDeadline(d, settings)
      toast(n ? `${n} ${n === 1 ? 'bloco de estudo criado' : 'blocos de estudo criados'}.` : 'Não achei espaço livre antes dos marcos. Tente ajustar as datas.')
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function conclude() {
    const d = await persist()
    if (!d) return
    await db.deadlines.update(d.id!, { done: true, milestones: d.milestones.map((m) => ({ ...m, done: true })) })
    toast('Prazo concluído. Isso foi grande.')
    onClose()
  }

  async function remove() {
    if (!deadline?.id || !confirmAsk(`Apagar "${deadline.title}"? Os blocos de estudo já agendados também saem.`)) return
    const blocks = await db.blocks.where('deadlineId').equals(deadline.id).toArray()
    await db.blocks.bulkDelete(blocks.filter((b) => b.status === 'planejado').map((b) => b.id!))
    await db.deadlines.delete(deadline.id)
    toast('Prazo apagado.')
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? 'Novo prazo' : 'Editar prazo'}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const d = await persist()
          if (d) {
            toast(isNew ? 'Prazo criado com marcos sugeridos.' : 'Prazo salvo.')
            onClose()
          }
        }}
      >
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: Relatório do laboratório 3" autoFocus={isNew} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Select value={type} onChange={(e) => setType(e.target.value as DeadlineType)}>
              {(Object.keys(TYPE_LABEL) as DeadlineType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Disciplina">
            <Select value={courseId ?? ''} onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">— nenhuma —</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Entrega / data">
          <Input type="datetime-local" value={toLocalInput(dueAt)} onChange={(e) => e.target.value && setDueAt(fromLocalInput(e.target.value))} required />
        </Field>
        <div>
          <span className="block text-xs font-display font-bold uppercase tracking-wider text-muted mb-1">Estimativa de esforço</span>
          <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="Estimativa">
            {ESTIMATE_CHIPS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={estimateMin === m}
                onClick={() => setEstimateMin(m)}
                className={cx('min-h-10 px-3 rounded-full text-sm font-semibold border', estimateMin === m ? 'bg-accent text-white border-accent' : 'border-line text-muted')}
              >
                {fmtDuration(m)}
              </button>
            ))}
          </div>
        </div>

        <section>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-display font-bold uppercase tracking-wider text-muted">Marcos</span>
            <Button type="button" className="min-h-9 px-3 text-sm" onClick={suggest}>
              <Sparkles size={16} /> Sugerir marcos
            </Button>
          </div>
          {milestones.length === 0 ? (
            <p className="text-sm text-muted">
              {isNew ? 'Ao criar, vou sugerir 2–3 marcos a partir do tipo e da data. Você edita depois.' : 'Nenhum marco. Toque em "Sugerir marcos" ou adicione um.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {milestones.map((m) => (
                <li key={m.id} className={cx('rounded-xl border border-line p-2.5', m.done && 'opacity-60')}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-accent shrink-0"
                      checked={m.done}
                      onChange={(e) => patchMilestone(m.id, { done: e.target.checked })}
                      aria-label={`Marco feito: ${m.title}`}
                    />
                    <Input value={m.title} onChange={(e) => patchMilestone(m.id, { title: e.target.value })} className="min-h-10" aria-label="Título do marco" />
                    <button type="button" className="p-2 text-muted shrink-0" aria-label="Remover marco" onClick={() => setMilestones((ms) => ms.filter((x) => x.id !== m.id))}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Input
                      type="date"
                      className="min-h-10 text-sm"
                      value={toLocalInput(m.dueAt).slice(0, 10)}
                      onChange={(e) => e.target.value && patchMilestone(m.id, { dueAt: new Date(`${e.target.value}T20:00:00`).toISOString() })}
                      aria-label="Data do marco"
                    />
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={5}
                      step={5}
                      className="min-h-10 text-sm"
                      value={m.estimateMin}
                      onChange={(e) => patchMilestone(m.id, { estimateMin: Math.max(5, Number(e.target.value) || 5) })}
                      aria-label="Minutos estimados do marco"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            variant="ghost"
            className="mt-2 min-h-9 px-2 text-sm"
            onClick={() => setMilestones((ms) => [...ms, { id: newId(), title: '', dueAt, done: false, estimateMin: 60 }])}
          >
            <Plus size={16} /> Adicionar marco
          </Button>
        </section>

        <Field label="Notas">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="o que é pedido, links, critérios" />
        </Field>

        {!isNew && (
          <p className="text-sm text-muted tabular">
            Blocos agendados: <strong className="text-fg">{scheduled ?? 0}</strong>
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={() => void distribute()} disabled={!valid || busy}>
            <CalendarPlus size={18} /> Distribuir na agenda
          </Button>
          <Button type="submit" variant="primary" disabled={!valid || busy}>
            {isNew ? 'Criar prazo' : 'Salvar'}
          </Button>
        </div>
        {!isNew && !deadline.done && (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="danger" onClick={() => void remove()}>
              <Trash2 size={18} /> Apagar
            </Button>
            <Button type="button" onClick={() => void conclude()} disabled={!valid}>
              <Check size={18} /> Concluir prazo
            </Button>
          </div>
        )}
      </form>
    </Sheet>
  )
}

export function Prazos({ deadlines, courses }: { deadlines: Deadline[]; courses: Course[] }) {
  const now = useUI((s) => s.now).getTime()
  const [edit, setEdit] = useState<Partial<Deadline> | null>(null)
  const open = deadlines.filter((d) => !d.done).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const courseName = (id?: number) => courses.find((c) => c.id === id)?.name

  return (
    <div>
      {open.length === 0 ? (
        <Empty
          title="Nenhum prazo aberto"
          hint="Quando um trabalho ou prova aparecer, cadastre aqui: eu sugiro marcos e encaixo blocos de estudo na agenda."
          action={
            <Button variant="primary" onClick={() => setEdit({})}>
              <Plus size={18} /> Novo prazo
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {open.map((d) => {
            const bd = businessDaysUntil(d.dueAt)
            const doneMs = d.milestones.filter((m) => m.done).length
            const total = d.milestones.length
            const past = new Date(d.dueAt).getTime() < now
            return (
              <li key={d.id}>
                <button type="button" className="w-full text-left" onClick={() => setEdit(d)}>
                  <Card area="faculdade" className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold truncate">{d.title}</p>
                        <p className="text-xs text-muted tabular">
                          {fmtDay(d.dueAt, "EEE, d 'de' MMM 'às' HH:mm")} · {fmtRelativeDays(d.dueAt)}
                        </p>
                      </div>
                      <Chip tone={past ? 'warn' : bd <= 2 ? 'accent' : 'muted'}>
                        {past ? 'passou' : bd === 0 ? 'é hoje' : `faltam ${bd} ${bd === 1 ? 'dia útil' : 'dias úteis'}`}
                      </Chip>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Chip tone="accent">{TYPE_LABEL[d.type]}</Chip>
                      {courseName(d.courseId) && <Chip>{courseName(d.courseId)}</Chip>}
                      <span className="text-xs text-muted tabular">{fmtDuration(d.estimateMin)}</span>
                    </div>
                    {total > 0 && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-muted mb-1 tabular">
                          <span>marcos</span>
                          <span>
                            {doneMs}/{total}
                          </span>
                        </div>
                        <ProgressBar pct={(doneMs / total) * 100} tone={doneMs === total ? 'ok' : 'accent'} label={`Marcos de ${d.title}`} />
                      </div>
                    )}
                  </Card>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {open.length > 0 && (
        <Button className="w-full mt-3" onClick={() => setEdit({})}>
          <Plus size={18} /> Novo prazo
        </Button>
      )}
      <DeadlineSheet key={edit?.id ?? (edit ? 'new' : 'closed')} deadline={edit} courses={courses} onClose={() => setEdit(null)} />
    </div>
  )
}
