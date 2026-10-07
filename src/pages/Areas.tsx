import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Briefcase, ChevronRight, GraduationCap, Heart, Settings as Cog, Cloud } from 'lucide-react'
import { AREA_LABEL, db, type Area, type Reminder } from '../db/schema'
import { fmtRelativeDays, fromDayKey, todayKey } from '../lib/time'
import { PageHeader, cx } from '../components/ui'
import { useUI } from '../store/ui'

/* ==========================================================================
   Hub de Áreas: três cartões grandes com números vivos do banco.
   ========================================================================== */

/** Próxima ocorrência de um lembrete a partir de hoje ('yyyy-MM-dd'). */
function nextOccurrence(r: Reminder, today: string): string | null {
  if (r.repeat === 'uma') return r.date >= today && r.lastDoneOn !== r.date ? r.date : null
  const base = fromDayKey(r.date)
  const t = fromDayKey(today)
  const d = new Date(base)
  if (r.repeat === 'mensal') {
    d.setFullYear(t.getFullYear(), t.getMonth(), base.getDate())
    if (d < t) d.setMonth(d.getMonth() + 1)
  } else {
    d.setFullYear(t.getFullYear())
    if (d < t) d.setFullYear(t.getFullYear() + 1)
  }
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return r.lastDoneOn === key ? null : key
}

interface Stat {
  label: string
  value: string | number
}

function AreaCard({ area, icon: Icon, stats, hint }: { area: Area; icon: typeof GraduationCap; stats: Stat[]; hint: string }) {
  return (
    <Link
      to={`/areas/${area}`}
      className={cx(`area-${area}`, 'block bg-surface border border-line rounded-2xl p-4 area-bar active:scale-[0.99] transition')}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="area-bg area-text rounded-xl p-2.5 shrink-0">
            <Icon size={22} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold leading-tight">{AREA_LABEL[area]}</h2>
            <p className="text-xs text-muted">{hint}</p>
          </div>
        </div>
        <ChevronRight size={20} className="text-muted shrink-0" />
      </div>
      <dl className="grid grid-cols-3 gap-2 mt-4">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wider font-bold text-muted truncate">{s.label}</dt>
            <dd className="text-lg font-extrabold tabular leading-tight truncate">{s.value}</dd>
          </div>
        ))}
      </dl>
    </Link>
  )
}

export default function AreasPage() {
  const now = useUI((s) => s.now)
  const today = todayKey()
  const nowIso = now.toISOString()

  const courses = useLiveQuery(() => db.courses.count(), [], 0)
  const absences = useLiveQuery(() => db.absences.count(), [], 0)
  const facDeadlines = useLiveQuery(
    () => db.deadlines.where('area').equals('faculdade').filter((d) => !d.done && d.dueAt >= nowIso).count(),
    [nowIso.slice(0, 13)],
    0,
  )

  const workTasks = useLiveQuery(
    () => db.tasks.where('area').equals('trabalho').filter((t) => t.status !== 'feita').count(),
    [],
    0,
  )
  const workNext = useLiveQuery(
    () =>
      db.deadlines
        .where('area')
        .equals('trabalho')
        .filter((d) => !d.done)
        .sortBy('dueAt')
        .then((xs) => xs[0] ?? null),
    [],
    null,
  )

  const habits = useLiveQuery(() => db.habits.filter((h) => h.active).count(), [], 0)
  const nextReminder = useLiveQuery(
    async () => {
      const rs = await db.reminders.where('area').equals('vida').toArray()
      const list = rs
        .map((r) => ({ r, when: nextOccurrence(r, today) }))
        .filter((x): x is { r: Reminder; when: string } => !!x.when)
        .sort((a, b) => a.when.localeCompare(b.when))
      return list[0] ?? null
    },
    [today],
    null,
  )

  return (
    <div>
      <PageHeader title="Áreas" sub="Faculdade, trabalho e vida: tudo na mesma linha do tempo." />

      <div className="space-y-3">
        <AreaCard
          area="faculdade"
          icon={GraduationCap}
          hint="disciplinas, faltas, prazos e leituras"
          stats={[
            { label: 'Disciplinas', value: courses ?? 0 },
            { label: 'Prazos', value: facDeadlines ?? 0 },
            { label: 'Faltas', value: absences ?? 0 },
          ]}
        />
        <AreaCard
          area="trabalho"
          icon={Briefcase}
          hint="expediente, tarefas e entregas"
          stats={[
            { label: 'Tarefas abertas', value: workTasks ?? 0 },
            { label: 'Próx. entrega', value: workNext ? fmtRelativeDays(workNext.dueAt) : '—' },
            { label: '', value: '' },
          ].filter((s) => s.label)}
        />
        <AreaCard
          area="vida"
          icon={Heart}
          hint="rotinas, hábitos e lembretes"
          stats={[
            { label: 'Hábitos ativos', value: habits ?? 0 },
            { label: 'Próx. lembrete', value: nextReminder ? fmtRelativeDays(fromDayKey(nextReminder.when)) : '—' },
          ]}
        />
      </div>

      <Link
        to="/config"
        className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 min-h-12 text-sm font-semibold"
      >
        <span className="flex items-center gap-2">
          <Cog size={18} className="text-muted" /> Configurações e backup
        </span>
        <ChevronRight size={18} className="text-muted" />
      </Link>
      <Link
        to="/conta"
        className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 min-h-12 text-sm font-semibold"
      >
        <span className="flex items-center gap-2">
          <Cloud size={18} className="text-muted" /> Conta e sincronização
        </span>
        <ChevronRight size={18} className="text-muted" />
      </Link>
    </div>
  )
}
