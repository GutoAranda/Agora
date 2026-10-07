import { useState } from 'react'
import { Plus } from 'lucide-react'
import { db, type Course, type Recurring } from '../../db/schema'
import { Button, Field, Input, Label, WeekdayPicker } from '../ui'

/* Cadastro rápido de disciplina: cria Course + Recurring (fixo, faculdade). */

export interface CourseDraft {
  name: string
  weekdays: number[]
  start: string
  end: string
  room: string
  absenceLimit: number
}

const EMPTY: CourseDraft = { name: '', weekdays: [], start: '19:00', end: '20:40', room: '', absenceLimit: 7 }

export async function addCourseWithRule(d: CourseDraft): Promise<string> {
  const course: Course = { name: d.name.trim(), room: d.room.trim() || undefined, absenceLimit: d.absenceLimit }
  const courseId = (await db.courses.add(course)) as string
  if (d.weekdays.length) {
    const rule: Recurring = {
      title: course.name,
      area: 'faculdade',
      kind: 'fixo',
      weekdays: [...d.weekdays].sort(),
      startTime: d.start,
      endTime: d.end,
      location: course.room,
      travelMin: 0,
      courseId,
      active: true,
    }
    await db.recurring.add(rule)
  }
  return courseId
}

export async function removeCourseWithRules(courseId: string): Promise<void> {
  await db.recurring.where('courseId').equals(courseId).delete()
  await db.courses.delete(courseId)
}

export function CourseForm({ onAdded }: { onAdded?: (id: string) => void }) {
  const [d, setD] = useState<CourseDraft>(EMPTY)
  const [saving, setSaving] = useState(false)
  const valid = d.name.trim().length > 0 && d.weekdays.length > 0 && d.start < d.end

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valid || saving) return
        setSaving(true)
        try {
          const id = await addCourseWithRule(d)
          setD({ ...EMPTY, start: d.start, end: d.end })
          onAdded?.(id)
        } finally {
          setSaving(false)
        }
      }}
    >
      <Field label="Disciplina">
        <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Ex.: Cálculo II" autoComplete="off" />
      </Field>
      <div>
        <Label>Dias</Label>
        <WeekdayPicker value={d.weekdays} onChange={(weekdays) => setD({ ...d, weekdays })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Começa">
          <Input type="time" value={d.start} onChange={(e) => setD({ ...d, start: e.target.value || d.start })} />
        </Field>
        <Field label="Termina">
          <Input type="time" value={d.end} onChange={(e) => setD({ ...d, end: e.target.value || d.end })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sala">
          <Input value={d.room} onChange={(e) => setD({ ...d, room: e.target.value })} placeholder="Opcional" autoComplete="off" />
        </Field>
        <Field label="Limite de faltas">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            value={d.absenceLimit}
            onChange={(e) => setD({ ...d, absenceLimit: Math.max(0, parseInt(e.target.value || '0', 10) || 0) })}
          />
        </Field>
      </div>
      <Button type="submit" variant="primary" className="w-full" disabled={!valid || saving}>
        <Plus size={18} /> Adicionar disciplina
      </Button>
    </form>
  )
}
