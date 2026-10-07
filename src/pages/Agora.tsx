import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Settings as Cog, Moon, Plus } from 'lucide-react'
import { db, type Block, AREA_LABEL } from '../db/schema'
import { useUI } from '../store/ui'
import { fmtDay, fmtDuration, hhmm, parseISO, todayKey } from '../lib/time'
import { applyMinimalDay } from '../lib/schedule'
import { BlockActions } from '../components/BlockActions'
import { Button, Card, Chip, Empty, cx } from '../components/ui'
import { QuickCapture } from '../components/QuickCapture'

/* ==========================================================================
   Tela Agora: uma única coisa. O bloco atual com a barra de tempo encolhendo,
   o primeiro passo e os três botões. O próximo em segundo plano.
   ========================================================================== */

function TimeMeter({ block, now }: { block: Block; now: Date }) {
  const s = parseISO(block.start).getTime()
  const e = parseISO(block.end).getTime()
  const total = Math.max(1, e - s)
  const left = Math.max(0, e - now.getTime())
  const pct = Math.min(100, Math.max(0, (left / total) * 100))
  const leftMin = Math.ceil(left / 60000)
  return (
    <div>
      <div className="meter" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted mt-1.5 tabular">
        <span>{leftMin > 0 ? `faltam ${fmtDuration(leftMin)}` : 'tempo esgotado'}</span>
        <span>até {hhmm(block.end)}</span>
      </div>
    </div>
  )
}

export default function AgoraPage() {
  const now = useUI((s) => s.now)
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const [capture, setCapture] = useState(false)
  const today = todayKey()
  const blocks = useLiveQuery(() => db.blocks.where('day').equals(today).sortBy('start'), [today])

  const { current, next, later, done } = useMemo(() => {
    const t = now.getTime()
    const live = (blocks ?? []).filter((b) => b.status !== 'pulado' && b.kind !== 'sono')
    const started = live.find((b) => b.status === 'iniciado')
    const inWindow = live.find((b) => b.status === 'planejado' && parseISO(b.start).getTime() <= t && parseISO(b.end).getTime() > t)
    const current = started ?? inWindow ?? null
    const upcoming = live.filter((b) => b.status === 'planejado' && b.id !== current?.id && parseISO(b.end).getTime() > t)
    const next = upcoming[0] ?? null
    const later = upcoming.slice(1)
    const done = live.filter((b) => b.status === 'feito')
    return { current, next, later, done }
  }, [blocks, now])

  const minimalOn = settings.minimalDayOn === today
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div>
      <header className="flex items-start justify-between mb-5">
        <div>
          <p className="text-sm text-muted">{fmtDay(now, "EEEE, d 'de' MMMM")}</p>
          <h1 className="text-2xl font-extrabold">
            {greeting}
            {settings.name ? `, ${settings.name}` : ''}
          </h1>
        </div>
        <Link to="/config" className="p-2 text-muted" aria-label="Configurações">
          <Cog size={22} />
        </Link>
      </header>

      {minimalOn && (
        <div className="mb-4 rounded-xl bg-accent/10 text-accent text-sm font-semibold px-3 py-2">
          Dia mínimo ligado: só as pedras e uma tarefa. Cumprir isso já conta.
        </div>
      )}

      {current ? (
        <Card area={current.area} className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className={cx(`area-${current.area} area-text`, 'text-xs font-bold uppercase tracking-wider')}>{AREA_LABEL[current.area]}</span>
            <span className="text-xs text-muted tabular">
              {hhmm(current.start)}–{hhmm(current.end)}
            </span>
          </div>
          <h2 className="text-2xl font-extrabold leading-tight mb-3">{current.title}</h2>
          {current.location && <p className="text-sm text-muted mb-2">{current.location}</p>}
          <TimeMeter block={current} now={now} />
          <div className="mt-4">
            <BlockActions block={current} />
          </div>
        </Card>
      ) : (
        <Card className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted mb-1">Agora</p>
          <h2 className="text-xl font-extrabold">Espaço livre</h2>
          <p className="text-sm text-muted mt-1">
            {next ? `Nada marcado até ${hhmm(next.start)}. Descanse ou puxe algo da entrada.` : 'Nada mais marcado hoje.'}
          </p>
          <div className="flex gap-2 mt-3">
            <Button variant="primary" onClick={() => setCapture(true)}>
              <Plus size={18} /> Anotar algo
            </Button>
            <Link to="/entrada">
              <Button>Ver entrada</Button>
            </Link>
          </div>
        </Card>
      )}

      {next && (
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted mb-2">Próximo</p>
          <Card area={next.area} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold truncate">{next.title}</p>
                <p className="text-sm text-muted tabular">
                  {hhmm(next.start)} · {fmtDuration(Math.round((parseISO(next.end).getTime() - parseISO(next.start).getTime()) / 60000))}
                  {next.firstStep ? ` · ${next.firstStep}` : ''}
                </p>
              </div>
              <Chip>{Math.max(0, Math.round((parseISO(next.start).getTime() - now.getTime()) / 60000))} min</Chip>
            </div>
          </Card>
        </div>
      )}

      {later.length > 0 && (
        <details className="mb-5">
          <summary className="text-xs font-bold uppercase tracking-wider text-muted cursor-pointer select-none">
            Depois ({later.length})
          </summary>
          <ul className="mt-2 divide-y divide-line border border-line rounded-2xl bg-surface">
            {later.map((b) => (
              <li key={b.id} className={cx(`area-${b.area}`, 'flex items-center gap-3 px-3 py-2.5')}>
                <span className="area-dot w-2 h-2 rounded-full" />
                <span className="text-sm tabular text-muted w-11">{hhmm(b.start)}</span>
                <span className="text-sm font-semibold truncate">{b.title}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {done.length > 0 && (
        <p className="text-sm text-muted mb-5">
          Hoje você já fechou <strong className="text-fg">{done.length}</strong> {done.length === 1 ? 'bloco' : 'blocos'}.
        </p>
      )}

      {!blocks?.length && (
        <Empty
          title="Dia vazio"
          hint="Cadastre suas aulas, o estágio e as rotinas em Áreas, ou anote algo na entrada."
          action={
            <Link to="/areas">
              <Button variant="primary">Montar meu dia</Button>
            </Link>
          }
        />
      )}

      <div className="flex gap-2 mt-2">
        <Button className="flex-1" onClick={() => setCapture(true)}>
          <Plus size={18} /> Anotar
        </Button>
        {!minimalOn && (
          <Button
            className="flex-1"
            onClick={async () => {
              const n = await applyMinimalDay(today)
              await db.settings.update(1, { minimalDayOn: today })
              toast(n ? `Dia mínimo: ${n} ${n === 1 ? 'tarefa voltou' : 'tarefas voltaram'} para a entrada.` : 'Dia mínimo ligado.')
            }}
          >
            <Moon size={18} /> Dia difícil
          </Button>
        )}
      </div>

      <QuickCapture open={capture} onClose={() => setCapture(false)} />
    </div>
  )
}
