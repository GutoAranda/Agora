import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { db, type Course, type Recurring } from '../../db/schema'
import { dropFutureFromRecurring, materializeAround } from '../../lib/materialize'
import { WEEKDAY_SHORT, addDays, todayKey } from '../../lib/time'
import { useUI } from '../../store/ui'
import { Button, Field, Input, Sheet, Textarea } from '../ui'
import { RecurringForm } from '../RecurringForm'
import { confirmAsk } from './shared'

/* ==========================================================================
   Sheet de disciplina: dados básicos + horários semanais (regras recorrentes).
   ========================================================================== */

export async function deleteCourseCascade(courseId: string): Promise<void> {
  const rules = await db.recurring.where('courseId').equals(courseId).toArray()
  const today = todayKey()
  for (const r of rules) {
    await dropFutureFromRecurring(r.id!, today)
    await db.recurring.delete(r.id!)
  }
  await db.absences.where('courseId').equals(courseId).delete()
  await db.readings.where('courseId').equals(courseId).delete()
  const dls = await db.deadlines.where('courseId').equals(courseId).toArray()
  for (const d of dls) await db.deadlines.update(d.id!, { courseId: undefined })
  await db.courses.delete(courseId)
}

function fmtRule(r: Recurring): string {
  const days = [...r.weekdays].sort().map((d) => WEEKDAY_SHORT[d]).join(', ')
  return `${days} · ${r.startTime}–${r.endTime}`
}

export function CourseSheet({ open, course, onClose }: { open: boolean; course: Course | null; onClose: () => void }) {
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const [name, setName] = useState(course?.name ?? '')
  const [code, setCode] = useState(course?.code ?? '')
  const [professor, setProfessor] = useState(course?.professor ?? '')
  const [room, setRoom] = useState(course?.room ?? '')
  const [absenceLimit, setAbsenceLimit] = useState<number>(course?.absenceLimit ?? 7)
  const [semesterEnd, setSemesterEnd] = useState(course?.semesterEnd ?? '')
  const [notes, setNotes] = useState(course?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [ruleEdit, setRuleEdit] = useState<Partial<Recurring> | null>(null)

  const rules = useLiveQuery(() => (course?.id ? db.recurring.where('courseId').equals(course.id).toArray() : []), [course?.id], [] as Recurring[])

  const valid = name.trim().length > 0 && absenceLimit >= 0

  async function save(): Promise<string | undefined> {
    if (!valid || saving) return
    setSaving(true)
    try {
      const data: Course = {
        ...(course?.id ? { id: course.id } : {}),
        name: name.trim(),
        code: code.trim() || undefined,
        professor: professor.trim() || undefined,
        room: room.trim() || undefined,
        absenceLimit: Math.max(0, Math.round(absenceLimit)),
        semesterEnd: semesterEnd || undefined,
        notes: notes.trim() || undefined,
      }
      const id = (await db.courses.put(data)) as string
      // Mantém os títulos das aulas alinhados com o nome da disciplina.
      if (course?.id && course.name !== data.name) {
        const rs = await db.recurring.where('courseId').equals(course.id).toArray()
        for (const r of rs) if (r.title === course.name) await db.recurring.update(r.id!, { title: data.name })
      }
      return id
    } finally {
      setSaving(false)
    }
  }

  async function saveRule(r: Recurring) {
    const editing = !!r.id
    const id = (await db.recurring.put(r)) as string
    if (editing) await dropFutureFromRecurring(id, todayKey())
    await materializeAround(new Date(), settings)
    await materializeAround(addDays(new Date(), 7), settings)
    setRuleEdit(null)
    toast(editing ? 'Horário atualizado na agenda.' : 'Aulas colocadas na agenda.')
  }

  async function removeRule(r: Recurring) {
    if (!confirmAsk(`Remover o horário "${fmtRule(r)}"? As aulas futuras saem da agenda.`)) return
    await dropFutureFromRecurring(r.id!, todayKey())
    await db.recurring.delete(r.id!)
    toast('Horário removido.')
  }

  async function removeCourse() {
    if (!course?.id) return
    if (!confirmAsk(`Apagar "${course.name}"? Horários, faltas e leituras vão junto. Os prazos ficam, sem a disciplina.`)) return
    await deleteCourseCascade(course.id)
    toast('Disciplina apagada.')
    onClose()
  }

  if (ruleEdit) {
    return (
      <Sheet open={open} onClose={() => setRuleEdit(null)} title={ruleEdit.id ? 'Editar horário' : 'Novo horário de aula'}>
        <RecurringForm
          initial={ruleEdit}
          fixedArea="faculdade"
          fixedKind="fixo"
          courseId={course?.id}
          onSave={saveRule}
          onCancel={() => setRuleEdit(null)}
        />
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title={course?.id ? 'Editar disciplina' : 'Nova disciplina'}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const id = await save()
          if (id) {
            toast(course?.id ? 'Disciplina salva.' : 'Disciplina criada. Agora adicione os horários.')
            onClose()
          }
        }}
      >
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Cálculo II" autoFocus={!course?.id} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ex.: MAT201" />
          </Field>
          <Field label="Sala">
            <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="ex.: B-204" />
          </Field>
        </div>
        <Field label="Professor(a)">
          <Input value={professor} onChange={(e) => setProfessor(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Limite de faltas" hint="Limite de faltas no semestre, geralmente 25% das aulas.">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={absenceLimit}
              onChange={(e) => setAbsenceLimit(Number(e.target.value))}
            />
          </Field>
          <Field label="Fim do semestre">
            <Input type="date" value={semesterEnd} onChange={(e) => setSemesterEnd(e.target.value)} />
          </Field>
        </div>
        <Field label="Notas">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="critérios de avaliação, links, o que for útil" />
        </Field>

        <div className="flex gap-2">
          <Button type="button" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={!valid || saving}>
            {course?.id ? 'Salvar' : 'Criar disciplina'}
          </Button>
        </div>
      </form>

      {course?.id ? (
        <section className="mt-6 pt-4 border-t border-line">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold">Horários de aula</h3>
            <Button
              type="button"
              className="min-h-9 px-3 text-sm"
              onClick={() => setRuleEdit({ title: name.trim() || course.name, location: room.trim() || course.room, weekdays: [] })}
            >
              <Plus size={16} /> Horário
            </Button>
          </div>
          {rules && rules.length > 0 ? (
            <ul className="divide-y divide-line border border-line rounded-2xl">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold tabular">{fmtRule(r)}</p>
                    <p className="text-xs text-muted truncate">
                      {r.location ?? 'sem local'}
                      {r.travelMin ? ` · ${r.travelMin} min de deslocamento` : ''}
                      {!r.active ? ' · pausado' : ''}
                    </p>
                  </div>
                  <button type="button" className="p-2 text-muted" aria-label="Editar horário" onClick={() => setRuleEdit(r)}>
                    <Pencil size={18} />
                  </button>
                  <button type="button" className="p-2 text-muted" aria-label="Remover horário" onClick={() => void removeRule(r)}>
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nenhum horário ainda. Adicione os dias e horas das aulas para elas entrarem na agenda.</p>
          )}
        </section>
      ) : (
        <p className="text-xs text-muted mt-4">Depois de criar, você adiciona os horários das aulas aqui mesmo.</p>
      )}

      {course?.id && (
        <div className="mt-6">
          <Button type="button" variant="danger" className="w-full" onClick={() => void removeCourse()}>
            <Trash2 size={18} /> Apagar disciplina
          </Button>
        </div>
      )}
    </Sheet>
  )
}
