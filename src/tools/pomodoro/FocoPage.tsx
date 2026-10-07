import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { appliesOn, byDayOrder, db, isDoneOn, markDone } from '../../db/schema'
import { useUI } from '../../store/ui'
import { todayKey } from '../../lib/time'
import { Button, Sheet, cx } from '../../components/ui'
import { usePomodoro, remainingNow, fmtClock, PHASE_LABEL } from './store'
import { chooseTarget, next, pause, reset, setFocusLength, start } from './engine'

/* ==========================================================================
   Foco: um anel que esvazia, um botão grande. Nada mais na tela.
   ========================================================================== */

const R = 120
const C = 2 * Math.PI * R

export default function FocoPage() {
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const st = usePomodoro()
  const [now, setNow] = useState(Date.now())
  const [picking, setPicking] = useState(false)
  const [params, setParams] = useSearchParams()
  const today = todayKey()
  const weekday = new Date().getDay()

  // Relógio local rápido só nesta tela.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])

  // Veio de "Focar nisso" na tela Agora.
  const fromItem = params.get('item')
  const items = useLiveQuery(() => db.items.toArray(), [], [])
  useEffect(() => {
    if (!fromItem || !items.length) return
    const it = items.find((i) => i.id === fromItem)
    if (it && st.status !== 'rodando') chooseTarget(it.id, it.title)
    setParams({}, { replace: true })
  }, [fromItem, items, st.status, setParams])

  const todayOpen = useMemo(
    () => items.filter((i) => appliesOn(i, today, weekday) && !isDoneOn(i, today)).sort(byDayOrder),
    [items, today, weekday],
  )
  const sessions = useLiveQuery(() => db.focus.where('day').equals(today).toArray(), [today], [])
  const focusedMin = sessions.reduce((n, s) => n + s.minutes, 0)

  const remaining = remainingNow(st, now)
  const progress = st.totalMs ? remaining / st.totalMs : 0
  const isFocus = st.phase === 'foco'

  useEffect(() => {
    document.title = st.status === 'rodando' ? `${fmtClock(remaining)} · ${PHASE_LABEL[st.phase]}` : 'Agora'
    return () => {
      document.title = 'Agora'
    }
  }, [remaining, st.status, st.phase])

  const target = st.itemId ? items.find((i) => i.id === st.itemId) : undefined

  return (
    <div className="flex flex-col items-center text-center pt-2">
      <p className={cx('text-sm font-bold uppercase tracking-wider', isFocus ? 'text-accent' : 'text-ok')}>{PHASE_LABEL[st.phase]}</p>

      <button
        type="button"
        onClick={() => setPicking(true)}
        className="mt-1 min-h-11 px-3 text-lg font-display font-bold max-w-full truncate"
        disabled={!isFocus}
      >
        {isFocus ? (st.title ?? 'No que você vai focar?') : 'Respira. Levanta. Bebe água.'}
      </button>

      <div className="relative my-4 w-[min(78vw,300px)] aspect-square">
        <svg viewBox="0 0 280 280" className="w-full h-full -rotate-90" aria-hidden="true">
          <circle cx="140" cy="140" r={R} fill="none" stroke="rgb(var(--line))" strokeWidth="14" />
          <circle
            cx="140"
            cy="140"
            r={R}
            fill="none"
            stroke={isFocus ? 'rgb(var(--accent))' : 'rgb(var(--ok))'}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 0.25s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-extrabold text-6xl tabular" aria-live="off">
            {fmtClock(remaining)}
          </span>
          {st.status === 'pausado' && <span className="text-sm text-muted mt-1">pausado</span>}
        </div>
      </div>

      {/* Durações rápidas, só quando parado e em foco */}
      {isFocus && st.status === 'parado' && (
        <div className="flex gap-2 mb-4" role="group" aria-label="Duração do foco">
          {[15, settings.focusMin, 45].filter((v, i, a) => a.indexOf(v) === i).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setFocusLength(m)}
              className={cx(
                'min-h-11 px-4 rounded-full border text-sm font-semibold',
                st.totalMs === m * 60000 ? 'bg-fg text-bg border-fg' : 'border-line text-muted',
              )}
            >
              {m} min
            </button>
          ))}
        </div>
      )}

      {st.status === 'terminou' ? (
        <div className="w-full max-w-sm grid gap-2">
          {isFocus ? (
            <>
              <p className="font-display font-bold text-xl">Foco feito.</p>
              {target && !isDoneOn(target, today) && (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await markDone(target, today)
                    chooseTarget(undefined, undefined)
                    toast('Fechou. Isso conta.')
                  }}
                >
                  <Check size={18} /> Terminei “{target.title}”
                </Button>
              )}
              <Button variant="primary" className="min-h-14 text-lg" onClick={() => { next(settings); start() }}>
                Começar pausa
              </Button>
              <Button variant="ghost" onClick={() => next(settings)}>
                Agora não
              </Button>
            </>
          ) : (
            <>
              <p className="font-display font-bold text-xl">Pausa acabou.</p>
              <Button variant="primary" className="min-h-14 text-lg" onClick={() => { next(settings); start() }}>
                Mais um foco
              </Button>
              <Button variant="ghost" onClick={() => next(settings)}>
                Parar por aqui
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => reset(settings)}
            className="w-12 h-12 rounded-full border border-line text-muted flex items-center justify-center"
            aria-label="Recomeçar"
          >
            <RotateCcw size={20} />
          </button>
          <button
            type="button"
            onClick={() => (st.status === 'rodando' ? pause() : start())}
            className={cx(
              'w-20 h-20 rounded-full text-white flex items-center justify-center shadow-lg active:scale-95 transition',
              isFocus ? 'bg-accent' : 'bg-ok',
            )}
            aria-label={st.status === 'rodando' ? 'Pausar' : 'Começar'}
          >
            {st.status === 'rodando' ? <Pause size={34} /> : <Play size={34} className="ml-1" />}
          </button>
          <button
            type="button"
            onClick={() => next(settings)}
            className="w-12 h-12 rounded-full border border-line text-muted flex items-center justify-center"
            aria-label="Pular para a próxima fase"
          >
            <SkipForward size={20} />
          </button>
        </div>
      )}

      <p className="text-sm text-muted mt-6 tabular">
        {sessions.length
          ? `Hoje: ${sessions.length} ${sessions.length === 1 ? 'foco' : 'focos'} · ${focusedMin} min`
          : 'Um foco de cada vez.'}
      </p>

      <Sheet open={picking} onClose={() => setPicking(false)} title="No que você vai focar?">
        <div className="grid gap-2">
          {todayOpen.map((i) => (
            <Button
              key={i.id}
              className="justify-start text-left"
              onClick={() => {
                chooseTarget(i.id, i.title)
                setPicking(false)
              }}
            >
              <span className="truncate">{i.title}</span>
            </Button>
          ))}
          <Button
            variant="ghost"
            onClick={() => {
              chooseTarget(undefined, undefined)
              setPicking(false)
            }}
          >
            Só focar, sem tarefa
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
