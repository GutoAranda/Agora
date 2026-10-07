import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Footprints, Plus, Repeat } from 'lucide-react'
import { byDayOrder, db, isDoneOn, markDone, type Item } from '../db/schema'
import { useUI } from '../store/ui'
import { addDays, addMinutes, atTime, dayKey, fmtDuration, hhmm, todayKey } from '../lib/time'
import { hardDayFilter, todayList } from '../lib/day'
import { Button, cx } from '../components/ui'
import { ItemSheet } from '../components/ItemSheet'

/* ==========================================================================
   Hoje: a lista do dia, em ordem. Amanhã e "algum dia" ficam fechados.
   ========================================================================== */

function Row({ item, day, onOpen }: { item: Item; day: string; onOpen: () => void }) {
  const done = isDoneOn(item, day)
  const leave = item.time && item.travelTo ? hhmm(addMinutes(atTime(day, item.time), -item.travelTo)) : null
  return (
    <li className="flex items-center gap-2 bg-surface border border-line rounded-2xl pl-2 pr-3">
      <button
        type="button"
        aria-label={done ? 'Desmarcar' : 'Marcar como feito'}
        aria-pressed={done}
        onClick={() => void markDone(item, day, !done)}
        className="w-11 h-11 flex items-center justify-center shrink-0"
      >
        <span className={cx('w-6 h-6 rounded-full border-2 flex items-center justify-center', done ? 'bg-ok border-ok text-white' : 'border-line')}>
          {done && <Check size={14} strokeWidth={3} />}
        </span>
      </button>
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left py-3">
        <span className={cx('block font-semibold truncate', done && 'line-through text-muted')}>{item.title}</span>
        {(item.time || item.minutes || leave || item.repeat?.length) && (
          <span className="flex flex-wrap gap-x-3 text-sm text-muted tabular">
            {item.time && <span>{item.time}</span>}
            {!item.time && item.minutes && <span>{fmtDuration(item.minutes)}</span>}
            {leave && (
              <span className="inline-flex items-center gap-1">
                <Footprints size={13} /> sair {leave}
              </span>
            )}
            {item.repeat?.length ? <Repeat size={13} className="self-center" aria-label="Repete" /> : null}
          </span>
        )}
      </button>
    </li>
  )
}

export default function HojePage() {
  const settings = useUI((s) => s.settings)
  const [editing, setEditing] = useState<Item | undefined>()
  const [adding, setAdding] = useState(false)
  const today = todayKey()
  const tomorrow = dayKey(addDays(new Date(), 1))
  const items = useLiveQuery(() => db.items.toArray(), [], [])
  const hard = settings.hardDay === today

  const { list, tomorrowList, someday } = useMemo(() => {
    let list = todayList(items, today, new Date().getDay())
    if (hard) list = hardDayFilter(list, today)
    const tomorrowList = todayList(items, tomorrow, addDays(new Date(), 1).getDay())
    const someday = items.filter((i) => i.day === null && !i.done && !i.repeat?.length).sort(byDayOrder)
    return { list, tomorrowList, someday }
  }, [items, today, tomorrow, hard])

  const open = list.filter((i) => !isDoneOn(i, today)).length

  return (
    <div>
      <header className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-extrabold">Hoje</h1>
          <p className="text-sm text-muted">{list.length ? `${list.length - open} de ${list.length} feitas` : 'Nada por aqui ainda.'}</p>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)} aria-label="Anotar">
          <Plus size={18} /> Anotar
        </Button>
      </header>

      {list.length > 0 && (
        <ul className="grid gap-2 mb-6">
          {list.map((i) => (
            <Row key={i.id} item={i} day={today} onOpen={() => setEditing(i)} />
          ))}
        </ul>
      )}

      {tomorrowList.length > 0 && (
        <details className="mb-3">
          <summary className="cursor-pointer select-none font-bold min-h-11 flex items-center">Amanhã ({tomorrowList.length})</summary>
          <ul className="grid gap-2 mt-2">
            {tomorrowList.map((i) => (
              <Row key={i.id} item={i} day={tomorrow} onOpen={() => setEditing(i)} />
            ))}
          </ul>
        </details>
      )}

      {someday.length > 0 && (
        <details className="mb-3">
          <summary className="cursor-pointer select-none font-bold min-h-11 flex items-center">Algum dia ({someday.length})</summary>
          <p className="text-sm text-muted mt-1">Toque para escolher um dia, ou deixe aqui sem pressa.</p>
          <ul className="grid gap-2 mt-2">
            {someday.map((i) => (
              <Row key={i.id} item={i} day={today} onOpen={() => setEditing(i)} />
            ))}
          </ul>
        </details>
      )}

      <ItemSheet open={adding} onClose={() => setAdding(false)} />
      <ItemSheet open={!!editing} item={editing} onClose={() => setEditing(undefined)} />
    </div>
  )
}
