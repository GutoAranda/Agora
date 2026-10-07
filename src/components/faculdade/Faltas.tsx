import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ListChecks, Plus, Trash2 } from 'lucide-react'
import { db, type Absence, type Course } from '../../db/schema'
import { fmtDay, fromDayKey, todayKey } from '../../lib/time'
import { useUI } from '../../store/ui'
import { Button, Card, Chip, Empty, Field, Input, Sheet } from '../ui'
import { ProgressBar, confirmAsk } from './shared'

/* ==========================================================================
   Faltas por disciplina: "N de LIMITE faltas", barra, tom calmo até 69%,
   aviso a partir de 70%, frase clara no limite. Nunca culpa.
   ========================================================================== */

function statusOf(count: number, limit: number): { pct: number; tone: 'muted' | 'warn'; text: string } {
  if (limit <= 0) return { pct: 0, tone: 'muted', text: 'sem limite definido' }
  const pct = (count / limit) * 100
  if (count >= limit) return { pct: 100, tone: 'warn', text: count === limit ? 'chegou no limite' : 'passou do limite' }
  if (pct >= 70) return { pct, tone: 'warn', text: `perto do limite · ainda ${limit - count === 1 ? 'cabe 1' : `cabem ${limit - count}`}` }
  return { pct, tone: 'muted', text: `ainda ${limit - count === 1 ? 'cabe 1' : `cabem ${limit - count}`}` }
}

function RegisterSheet({ course, onClose }: { course: Course | null; onClose: () => void }) {
  const toast = useUI((s) => s.toast)
  const [date, setDate] = useState(todayKey())
  const [note, setNote] = useState('')
  if (!course) return null
  return (
    <Sheet open onClose={onClose} title={`Registrar falta · ${course.name}`}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!date) return
          await db.absences.add({ courseId: course.id!, date, note: note.trim() || undefined })
          toast('Falta registrada. Acontece.')
          onClose()
        }}
      >
        <Field label="Dia">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Nota" hint="Opcional. Ex.: consulta, atraso, decidi descansar.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button type="button" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" className="flex-1">
            Registrar
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function ListSheet({ course, absences, onClose }: { course: Course | null; absences: Absence[]; onClose: () => void }) {
  const toast = useUI((s) => s.toast)
  if (!course) return null
  const mine = absences.filter((a) => a.courseId === course.id).sort((a, b) => b.date.localeCompare(a.date))
  return (
    <Sheet open onClose={onClose} title={`Faltas · ${course.name}`}>
      {mine.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma falta registrada.</p>
      ) : (
        <ul className="divide-y divide-line border border-line rounded-2xl">
          {mine.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{fmtDay(fromDayKey(a.date), "EEE, d 'de' MMM 'de' yyyy")}</p>
                {a.note && <p className="text-xs text-muted truncate">{a.note}</p>}
              </div>
              <button
                type="button"
                className="p-2 text-muted"
                aria-label="Apagar falta"
                onClick={async () => {
                  if (!confirmAsk('Apagar esta falta?')) return
                  await db.absences.delete(a.id!)
                  toast('Falta apagada.')
                }}
              >
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}

export function Faltas({ courses }: { courses: Course[] }) {
  const absences = useLiveQuery(() => db.absences.toArray(), [], [] as Absence[])
  const [register, setRegister] = useState<Course | null>(null)
  const [listing, setListing] = useState<Course | null>(null)

  if (!courses.length) return <Empty title="Sem disciplinas" hint="Cadastre a grade do semestre para acompanhar as faltas." />

  return (
    <div className="space-y-2">
      {courses.map((c) => {
        const count = (absences ?? []).filter((a) => a.courseId === c.id).length
        const st = statusOf(count, c.absenceLimit)
        return (
          <Card key={c.id} area="faculdade" className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold truncate">{c.name}</p>
                <p className="text-sm tabular">
                  <strong>{count}</strong> de {c.absenceLimit} faltas{' '}
                  <span className={st.tone === 'warn' ? 'text-warn' : 'text-muted'}>· {st.text}</span>
                </p>
              </div>
              {st.tone === 'warn' && <Chip tone="warn">{count >= c.absenceLimit ? 'limite' : 'atenção'}</Chip>}
            </div>
            <div className="mt-2">
              <ProgressBar pct={st.pct} tone={st.tone} label={`Faltas em ${c.name}`} />
            </div>
            {count >= c.absenceLimit && c.absenceLimit > 0 && (
              <p className="text-xs text-warn mt-2">
                Você {count > c.absenceLimit ? 'passou do' : 'chegou ao'} limite de faltas desta disciplina. Vale conferir com a coordenação o que ainda dá pra fazer.
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <Button className="flex-1 min-h-10 text-sm" onClick={() => setRegister(c)}>
                <Plus size={16} /> Registrar falta
              </Button>
              <Button variant="ghost" className="min-h-10 text-sm" onClick={() => setListing(c)} aria-label={`Ver faltas de ${c.name}`}>
                <ListChecks size={16} /> Ver
              </Button>
            </div>
          </Card>
        )
      })}

      <RegisterSheet key={register?.id ?? 'none'} course={register} onClose={() => setRegister(null)} />
      <ListSheet course={listing} absences={absences ?? []} onClose={() => setListing(null)} />
    </div>
  )
}
