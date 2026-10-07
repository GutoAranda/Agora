import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Plus } from 'lucide-react'
import { db, type Course, type Deadline, type Recurring } from '../db/schema'
import { WEEKDAY_SHORT } from '../lib/time'
import { Button, Card, Chip, Empty, PageHeader, Section } from '../components/ui'
import { CourseSheet } from '../components/faculdade/CourseSheet'
import { Faltas } from '../components/faculdade/Faltas'
import { Prazos } from '../components/faculdade/Prazos'
import { Leituras } from '../components/faculdade/Leituras'
import { ProvasBanner } from '../components/faculdade/ProvasBanner'

/* ==========================================================================
   Faculdade: grade do semestre, faltas, prazos e leituras.
   ========================================================================== */

function ruleSummary(rules: Recurring[]): string {
  if (!rules.length) return 'sem horários'
  return rules
    .map((r) => `${[...r.weekdays].sort().map((d) => WEEKDAY_SHORT[d]).join('/')} ${r.startTime}`)
    .join(' · ')
}

export default function FaculdadePage() {
  const courses = useLiveQuery(() => db.courses.orderBy('name').toArray(), [], [] as Course[])
  const rules = useLiveQuery(() => db.recurring.where('area').equals('faculdade').toArray(), [], [] as Recurring[])
  const deadlines = useLiveQuery(() => db.deadlines.where('area').equals('faculdade').toArray(), [], [] as Deadline[])
  const [courseEdit, setCourseEdit] = useState<Course | null | 'new'>(null)

  const list = courses ?? []
  const dls = deadlines ?? []

  return (
    <div>
      <Link to="/areas" className="inline-flex items-center gap-1 text-sm text-muted mb-2">
        <ChevronLeft size={16} /> Áreas
      </Link>
      <PageHeader
        title="Faculdade"
        sub="Grade, faltas, prazos e leituras."
        right={
          <Button variant="primary" onClick={() => setCourseEdit('new')}>
            <Plus size={18} /> Disciplina
          </Button>
        }
      />

      <ProvasBanner deadlines={dls} courses={list} />

      <Section title="Grade do semestre">
        {list.length === 0 ? (
          <Empty
            title="Nenhuma disciplina ainda"
            hint="Cadastre as disciplinas e os horários das aulas. Elas viram pedras na sua semana."
            action={
              <Button variant="primary" onClick={() => setCourseEdit('new')}>
                <Plus size={18} /> Adicionar disciplina
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {list.map((c) => {
              const mine = (rules ?? []).filter((r) => r.courseId === c.id)
              return (
                <li key={c.id}>
                  <button type="button" className="w-full text-left" onClick={() => setCourseEdit(c)}>
                    <Card area="faculdade" className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold truncate">{c.name}</p>
                          <p className="text-xs text-muted truncate">
                            {[c.code, c.professor, c.room].filter(Boolean).join(' · ') || 'sem detalhes'}
                          </p>
                          <p className="text-xs text-muted tabular mt-1">{ruleSummary(mine)}</p>
                        </div>
                        {mine.length > 0 && <Chip>{mine.length === 1 ? '1 horário' : `${mine.length} horários`}</Chip>}
                      </div>
                    </Card>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section title="Faltas">
        <Faltas courses={list} />
      </Section>

      <Section title="Prazos">
        <Prazos deadlines={dls} courses={list} />
      </Section>

      <Section title="Leituras">
        <Leituras courses={list} />
      </Section>

      {courseEdit !== null && (
        <CourseSheet
          key={courseEdit === 'new' ? 'new' : courseEdit.id}
          open
          course={courseEdit === 'new' ? null : courseEdit}
          onClose={() => setCourseEdit(null)}
        />
      )}
    </div>
  )
}
