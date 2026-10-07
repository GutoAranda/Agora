import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarCheck, Moon, Target } from 'lucide-react'
import { db } from '../db/schema'
import { fmtDay, fmtRelativeDays, fromDayKey, todayKey } from '../lib/time'
import { useUI } from '../store/ui'
import { Button, Card, PageHeader } from '../components/ui'
import { NightReview } from '../components/review/NightReview'
import { SundayReview } from '../components/review/SundayReview'

/* ==========================================================================
   Revisão: dois rituais curtos. Fechar o dia (noite) e revisar a semana
   (domingo). O foco da semana fica no topo, sempre à vista.
   ========================================================================== */

function lastDoneText(date?: string): string {
  if (!date) return 'Ainda não feita.'
  const rel = fmtRelativeDays(fromDayKey(date))
  return rel === 'hoje' ? 'Feita hoje.' : `Última vez ${rel} (${fmtDay(fromDayKey(date), "d 'de' MMM")}).`
}

export default function RevisaoPage() {
  const settings = useUI((s) => s.settings)
  const [night, setNight] = useState(false)
  const [sunday, setSunday] = useState(false)
  const today = todayKey()

  const lastNight = useLiveQuery(async () => {
    const rows = await db.reviews.where('type').equals('noite').toArray()
    return rows.sort((a, b) => b.date.localeCompare(a.date))[0]
  }, [])
  const lastSunday = useLiveQuery(async () => {
    const rows = await db.reviews.where('type').equals('domingo').toArray()
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0]
  }, [])

  const focos = lastSunday ? [lastSunday.answers.foco1, lastSunday.answers.foco2, lastSunday.answers.foco3].filter((f) => f && f.trim()) : []

  return (
    <div>
      <PageHeader title="Revisão" sub="Dois rituais curtos. Sem nota, sem culpa." />

      <Card className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Target size={18} className="text-accent" />
          <h2 className="text-base font-bold">Foco da semana</h2>
        </div>
        {focos.length ? (
          <ol className="grid gap-1.5">
            {focos.map((f, i) => (
              <li key={i} className="flex gap-2 text-[15px]">
                <span className="font-display font-extrabold text-accent tabular w-5">{i + 1}</span>
                <span>{f}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">Ainda sem foco definido. A revisão da semana escolhe as 3 coisas que importam.</p>
        )}
        {lastSunday && <p className="text-xs text-muted mt-2">Definido {fmtDay(fromDayKey(lastSunday.date))}.</p>}
      </Card>

      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-accent/10 p-2 text-accent shrink-0">
            <Moon size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-tight">Fechar o dia</h2>
            <p className="text-sm text-muted mt-0.5">Três perguntas, dois minutos. Hora de dormir, primeiro compromisso de amanhã e a única coisa que importa.</p>
            <p className="text-xs text-muted mt-2">
              {lastDoneText(lastNight?.date)} Sugerido às {settings.nightReviewTime}.
            </p>
          </div>
        </div>
        <Button variant={lastNight?.date === today ? 'secondary' : 'primary'} className="w-full mt-3" onClick={() => setNight(true)}>
          {lastNight?.date === today ? 'Fechar de novo' : 'Fechar o dia'}
        </Button>
      </Card>

      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-accent/10 p-2 text-accent shrink-0">
            <CalendarCheck size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-tight">Revisão da semana</h2>
            <p className="text-sm text-muted mt-0.5">Placar, entrada, prazos, posicionar e as 3 coisas que importam. Cinco passos.</p>
            <p className="text-xs text-muted mt-2">
              {lastDoneText(lastSunday?.date)} Sugerida no domingo às {settings.sundayReviewTime}.
            </p>
          </div>
        </div>
        <Button variant={lastSunday?.date === today ? 'secondary' : 'primary'} className="w-full mt-3" onClick={() => setSunday(true)}>
          {lastSunday?.date === today ? 'Revisar de novo' : 'Revisar a semana'}
        </Button>
      </Card>

      <NightReview open={night} onClose={() => setNight(false)} />
      <SundayReview open={sunday} onClose={() => setSunday(false)} />
    </div>
  )
}
