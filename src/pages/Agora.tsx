import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Clock, Footprints, Moon, Plus, Settings as Cog, Timer } from 'lucide-react'
import { db, isDoneOn, markDone, moveLater, updateSettings } from '../db/schema'
import { useUI } from '../store/ui'
import { addDays, dayKey, fmtDay, fmtDuration, hhmm, todayKey } from '../lib/time'
import { hardDayFilter, pickNow, todayList } from '../lib/day'
import { Button, Card } from '../components/ui'
import { ItemSheet } from '../components/ItemSheet'
import { CloseDaySheet } from '../components/CloseDaySheet'
import { SyncStatus } from '../components/SyncStatus'

/* ==========================================================================
   Agora: uma coisa só. O resto fica escondido.
   ========================================================================== */

const CHEERS = ['Feito. Isso conta.', 'Mais um.', 'Boa. Respira.', 'Fechou.', 'Pronto. O dia já valeu.']

export default function AgoraPage() {
  const now = useUI((s) => s.now)
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const nav = useNavigate()
  const [capture, setCapture] = useState(false)
  const [closing, setClosing] = useState(false)
  const today = todayKey()
  const tomorrow = dayKey(addDays(new Date(), 1))
  const items = useLiveQuery(() => db.items.toArray(), [], [])
  const hard = settings.hardDay === today

  const { open, doneCount, main, nextOne } = useMemo(() => {
    let list = todayList(items, today, now.getDay())
    if (hard) list = hardDayFilter(list, today)
    const open = list.filter((i) => !isDoneOn(i, today))
    const doneCount = list.length - open.length
    const main = pickNow(open, today, now)
    const rest = open.filter((i) => i.id !== main?.slot.item.id)
    const nextOne = rest.find((i) => !i.time || i.time >= hhmm(now)) ?? null
    return { open, doneCount, main, nextOne }
  }, [items, today, now, hard])

  const hour = now.getHours()
  const greeting = hour < 5 ? 'Boa noite' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const evening = (hour >= 20 || hour < 4) && settings.closedDay !== today

  const it = main?.slot.item
  const s = main?.slot
  const progress =
    main?.kind === 'emCurso' && s?.start && s.end ? Math.max(0, Math.min(1, (s.end.getTime() - now.getTime()) / (s.end.getTime() - s.start.getTime()))) : null

  return (
    <div>
      <header className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-muted">{fmtDay(now, "EEEE, d 'de' MMMM")}</p>
          <h1 className="text-2xl font-extrabold">
            {greeting}
            {settings.name ? `, ${settings.name}` : ''}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <SyncStatus />
          <Link to="/ajustes" className="p-2 text-muted" aria-label="Ajustes">
            <Cog size={22} />
          </Link>
        </div>
      </header>

      {hard && (
        <p className="mb-4 rounded-xl bg-accent/10 text-accent text-sm font-semibold px-3 py-2">
          Dia difícil: só o essencial aparece. Fazer uma coisa já conta.
        </p>
      )}

      {it && s ? (
        <Card className="mb-4 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted mb-1">
            {main.kind === 'emCurso' && 'Agora'}
            {main.kind === 'sair' && 'Hora de sair'}
            {main.kind === 'tarefa' && 'Próxima coisa'}
            {main.kind === 'proximo' && 'Daqui a pouco'}
          </p>
          <h2 className="text-3xl font-extrabold leading-tight mb-2">{it.title}</h2>

          {s.start && (
            <p className="text-muted tabular flex items-center gap-1.5">
              <Clock size={16} /> {hhmm(s.start)}
              {s.end && `–${hhmm(s.end)}`}
            </p>
          )}
          {s.leave && (
            <p className="text-muted tabular flex items-center gap-1.5 mt-1">
              <Footprints size={16} /> Saia às {hhmm(s.leave)}
              {it.travelHow ? ` · ${it.travelHow}` : ''}
            </p>
          )}
          {!s.start && it.minutes && <p className="text-muted">{fmtDuration(it.minutes)}</p>}

          {progress !== null && (
            <div className="meter mt-3" aria-hidden="true">
              <i style={{ width: `${progress * 100}%` }} />
            </div>
          )}

          {it.firstStep && (
            <p className="mt-3 text-lg">
              Comece por: <strong>{it.firstStep}</strong>
            </p>
          )}

          <div className="grid gap-2 mt-5">
            {main.kind !== 'sair' && (
              <Button variant="primary" className="min-h-14 text-lg" onClick={() => nav(`/foco?item=${it.id}`)}>
                <Timer size={20} /> Focar nisso
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={async () => {
                  await markDone(it, today)
                  toast(CHEERS[Math.floor(Math.random() * CHEERS.length)])
                }}
              >
                <Check size={18} /> Feito
              </Button>
              <Button
                onClick={async () => {
                  await moveLater(it, today, tomorrow)
                  toast(it.repeat?.length ? 'Hoje não. Tudo bem.' : 'Foi para amanhã.')
                }}
              >
                Mais tarde
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="mb-4 p-5 text-center">
          <h2 className="text-2xl font-extrabold">{open.length === 0 && doneCount > 0 ? 'Tudo feito por hoje.' : 'Nada marcado agora.'}</h2>
          <p className="text-muted mt-1">{open.length === 0 && doneCount > 0 ? 'Descansa. Você merece.' : 'Anote o que vier à cabeça ou só respire.'}</p>
        </Card>
      )}

      {nextOne && (
        <p className="text-sm text-muted mb-6 px-1 truncate">
          Depois: <span className="text-fg font-semibold">{nextOne.title}</span>
          {nextOne.time ? ` · ${nextOne.time}` : ''}
        </p>
      )}

      {evening && (
        <button type="button" onClick={() => setClosing(true)} className="w-full mb-4 rounded-2xl border border-line bg-surface p-4 text-left flex items-center gap-3">
          <Moon size={22} className="text-accent shrink-0" />
          <span>
            <span className="block font-bold">Fechar o dia</span>
            <span className="block text-sm text-muted">1 minuto. Deixa amanhã mais leve.</span>
          </span>
        </button>
      )}

      <Button variant="secondary" className="w-full min-h-14 text-lg" onClick={() => setCapture(true)}>
        <Plus size={20} /> Anotar
      </Button>

      <div className="text-center mt-6">
        {hard ? (
          <button type="button" className="text-sm text-muted underline min-h-11" onClick={() => void updateSettings({ hardDay: undefined })}>
            Voltar ao dia normal
          </button>
        ) : (
          <button type="button" className="text-sm text-muted underline min-h-11" onClick={() => void updateSettings({ hardDay: today })}>
            Hoje está difícil
          </button>
        )}
      </div>

      <ItemSheet open={capture} onClose={() => setCapture(false)} />
      <CloseDaySheet open={closing} onClose={() => setClosing(false)} />
    </div>
  )
}
