import { useEffect, useState } from 'react'
import { calibrationInsights, estimateErrorByWeek, type CalibrationRow } from '../../lib/calibration'
import { scoreSentence, weekScore, type WeekScore } from '../../lib/score'
import { fmtDay, fromDayKey } from '../../lib/time'

/* ==========================================================================
   Placar: três números grandes, uma frase sem culpa, e o que a calibração
   aprendeu. Sem gráfico: barrinhas inline bastam.
   ========================================================================== */

interface ErrorWeek {
  week: string
  error: number
  samples: number
}

function Big({ label, value, of }: { label: string; value: number; of?: number }) {
  return (
    <div className="rounded-2xl bg-bg border border-line p-3 text-center">
      <p className="font-display text-3xl font-extrabold leading-none tabular">
        {value}
        {of !== undefined && <span className="text-base text-muted font-bold"> de {of}</span>}
      </p>
      <p className="text-xs text-muted mt-1.5">{label}</p>
    </div>
  )
}

function insightLine(r: CalibrationRow): string {
  const name = r.label.length > 28 ? `${r.label.slice(0, 27)}…` : r.label
  if (r.factor >= 1.3) return `Seus blocos de '${name}' levam ${r.medianActual} min, não ${r.medianPlanned}. Ajustei.`
  return `Seus blocos de '${name}' levam só ${r.medianActual} min, não ${r.medianPlanned}. Ajustei para baixo.`
}

export function ScoreBoard({ anchor }: { anchor: Date }) {
  const [score, setScore] = useState<WeekScore | null>(null)
  const [insights, setInsights] = useState<CalibrationRow[]>([])
  const [errors, setErrors] = useState<ErrorWeek[]>([])

  useEffect(() => {
    let alive = true
    void (async () => {
      const [s, i, e] = await Promise.all([weekScore(anchor), calibrationInsights(), estimateErrorByWeek()])
      if (!alive) return
      setScore(s)
      setInsights(i.slice(0, 4))
      setErrors(e.slice(-8))
    })()
    return () => {
      alive = false
    }
  }, [anchor])

  if (!score) return <p className="text-sm text-muted">Contando…</p>

  const maxErr = Math.max(1, ...errors.map((e) => e.error))

  return (
    <div className="grid gap-4">
      <p className="text-xs text-muted">Semana de {fmtDay(fromDayKey(score.weekStart), "d 'de' MMM")}</p>
      <div className="grid grid-cols-3 gap-2">
        <Big label="compromissos cumpridos" value={score.fixedDone} of={score.fixedTotal} />
        <Big label="blocos começados" value={score.started} of={score.plannedSoft} />
        <Big label="noites fechadas" value={score.anchorDays} />
      </div>
      <p className="text-[15px] leading-snug">{scoreSentence(score)}</p>

      {insights.length > 0 && (
        <ul className="grid gap-1.5">
          {insights.map((r) => (
            <li key={r.key} className="text-sm rounded-xl bg-accent/10 text-fg px-3 py-2">
              {insightLine(r)}
            </li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <div>
          <p className="text-xs font-display font-bold uppercase tracking-wider text-muted mb-1.5">Erro de estimativa por semana</p>
          <ul className="grid gap-1" aria-label="Erro médio de estimativa, em minutos, por semana">
            {errors.map((e) => (
              <li key={e.week} className="flex items-center gap-2 text-xs tabular">
                <span className="w-12 text-muted shrink-0">{fmtDay(fromDayKey(e.week), 'd/MM')}</span>
                <span className="flex-1 h-2 rounded-full bg-line overflow-hidden" aria-hidden="true">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round((e.error / maxErr) * 100)}%` }} />
                </span>
                <span className="w-14 text-right text-muted">{e.error} min</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted mt-1">Quanto menor, mais perto o planejado chega do real. Está caindo? Ótimo. Não está? Também é informação.</p>
        </div>
      )}
    </div>
  )
}
