import { AlertCircle } from 'lucide-react'
import type { Course, Deadline } from '../../db/schema'
import { businessDaysUntil, fmtDay, fmtRelativeDays } from '../../lib/time'
import { useUI } from '../../store/ui'

/* Banner de provas nos próximos 14 dias. Informa, não assusta. */

export function ProvasBanner({ deadlines, courses }: { deadlines: Deadline[]; courses: Course[] }) {
  const now = useUI((s) => s.now).getTime()
  const limit = now + 14 * 86400000
  const provas = deadlines
    .filter((d) => d.type === 'prova' && !d.done)
    .filter((d) => {
      const t = new Date(d.dueAt).getTime()
      return t >= now - 86400000 && t <= limit
    })
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  if (!provas.length) return null
  const courseName = (id?: number) => courses.find((c) => c.id === id)?.name

  return (
    <div className="mb-5 rounded-2xl border border-accent/30 bg-accent/10 p-3">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent mb-1.5">
        <AlertCircle size={16} /> {provas.length === 1 ? 'Prova próxima' : `${provas.length} provas próximas`}
      </p>
      <ul className="space-y-1">
        {provas.map((p) => {
          const bd = businessDaysUntil(p.dueAt)
          return (
            <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <strong>{p.title}</strong>
                {courseName(p.courseId) ? <span className="text-muted"> · {courseName(p.courseId)}</span> : null}
              </span>
              <span className="text-muted tabular shrink-0">
                {fmtDay(p.dueAt, "EEE d/MM")} · {fmtRelativeDays(p.dueAt)}
                {bd > 0 ? ` · ${bd} ${bd === 1 ? 'dia útil' : 'dias úteis'}` : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
