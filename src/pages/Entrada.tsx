import { useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Block, type Task } from '../db/schema'
import { fmtDuration, fmtRelativeDays, hhmm, parseISO } from '../lib/time'
import { useUI } from '../store/ui'
import { AreaDot, Button, Chip, Empty, PageHeader, cx } from '../components/ui'
import { InboxCapture } from '../components/inbox/InboxCapture'
import { TriageSheet } from '../components/inbox/TriageSheet'
import { describeTrigger, fmtWhen } from '../components/inbox/format'

/* ==========================================================================
   Entrada: tudo cai aqui primeiro. Nada sai sem área, gatilho e primeiro passo.
   ========================================================================== */

type Tab = 'entrada' | 'espera' | 'planejadas' | 'feitas'

const TABS: { id: Tab; label: string }[] = [
  { id: 'entrada', label: 'Entrada' },
  { id: 'espera', label: 'Em espera' },
  { id: 'planejadas', label: 'Planejadas' },
  { id: 'feitas', label: 'Feitas' },
]

function byNewest(a: Task, b: Task): number {
  return b.createdAt.localeCompare(a.createdAt)
}

function TaskRow({ task, onOpen, extra, action }: { task: Task; onOpen?: () => void; extra?: string; action?: ReactNode }) {
  const returned = (task.rescheduleCount ?? 0) >= 2
  const trig = describeTrigger(task.trigger)
  const bits = [trig, task.firstStep, task.estimateMin ? fmtDuration(task.estimateMin) : ''].filter(Boolean)
  const inner = (
    <div className="flex items-start gap-3">
      <span className="mt-1.5">
        {task.area ? <AreaDot area={task.area} /> : <span className="inline-block w-2.5 h-2.5 rounded-full border border-line" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{task.title}</p>
        {(bits.length > 0 || extra) && <p className="text-sm text-muted truncate">{extra ?? bits.join(' · ')}</p>}
        {returned && task.status === 'entrada' && (
          <div className="mt-1">
            <Chip tone="accent">voltou {task.rescheduleCount}x: quebrar ou soltar?</Chip>
          </div>
        )}
      </div>
    </div>
  )
  return (
    <li className={cx(task.area && `area-${task.area}`, 'flex items-center gap-2 pr-3')}>
      {onOpen ? (
        <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left px-3 py-3 active:bg-line/40">
          {inner}
        </button>
      ) : (
        <div className="flex-1 min-w-0 px-3 py-3">{inner}</div>
      )}
      {action}
    </li>
  )
}

function List({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line border border-line rounded-2xl bg-surface overflow-hidden">{children}</ul>
}

export default function EntradaPage() {
  const toast = useUI((s) => s.toast)
  const [tab, setTab] = useState<Tab>('entrada')
  const [open, setOpen] = useState<Task | null>(null)

  const inbox = useLiveQuery(async () => (await db.tasks.where('status').equals('entrada').toArray()).sort(byNewest), [])
  const waiting = useLiveQuery(async () => (await db.tasks.where('status').equals('espera').toArray()).sort(byNewest), [])
  const planned = useLiveQuery(async () => (await db.tasks.where('status').equals('planejada').toArray()).sort(byNewest), [])
  const done = useLiveQuery(
    async () =>
      (await db.tasks.where('status').equals('feita').toArray())
        .sort((a, b) => (b.doneAt ?? b.createdAt).localeCompare(a.doneAt ?? a.createdAt))
        .slice(0, 30),
    [],
  )

  const plannedIds = useMemo(() => (planned ?? []).map((t) => t.id!).filter((id) => id != null), [planned])
  const plannedBlocks = useLiveQuery(
    async (): Promise<Block[]> => (plannedIds.length ? db.blocks.where('taskId').anyOf(plannedIds).toArray() : []),
    [plannedIds.join(',')],
  )
  const blockByTask = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of (plannedBlocks ?? []).filter((b) => b.status !== 'pulado').sort((a, b) => a.start.localeCompare(b.start))) {
      if (b.taskId != null && !m.has(b.taskId)) m.set(b.taskId, fmtWhen(parseISO(b.start)))
    }
    return m
  }, [plannedBlocks])

  const counts: Record<Tab, number> = {
    entrada: inbox?.length ?? 0,
    espera: waiting?.length ?? 0,
    planejadas: planned?.length ?? 0,
    feitas: done?.length ?? 0,
  }

  return (
    <div>
      <PageHeader title="Entrada" sub="Anote primeiro. Dê forma depois." />
      <InboxCapture />

      <div className="flex gap-1 mb-4 overflow-x-auto -mx-4 px-4" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              'shrink-0 rounded-full px-3 min-h-9 text-sm font-semibold border',
              tab === t.id ? 'bg-fg text-bg border-fg' : 'border-line text-muted',
            )}
          >
            {t.label}
            {counts[t.id] > 0 && <span className="ml-1.5 tabular opacity-70">{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      {tab === 'entrada' && (
        <>
          <p className="text-xs text-muted mb-2">Nada sai da entrada sem área, gatilho (quando ou onde) e primeiro passo.</p>
          {inbox && inbox.length === 0 ? (
            <Empty title="Entrada vazia. Cabeça leve." hint="Quando surgir algo, anote em uma linha. O resto vem depois." />
          ) : (
            <List>
              {(inbox ?? []).map((t) => (
                <TaskRow key={t.id} task={t} onOpen={() => setOpen(t)} />
              ))}
            </List>
          )}
        </>
      )}

      {tab === 'espera' && (
        <>
          <p className="text-xs text-muted mb-2">Coisas que podem esperar. Nenhuma pressa, nenhum aviso.</p>
          {waiting && waiting.length === 0 ? (
            <Empty title="Nada em espera." />
          ) : (
            <List>
              {(waiting ?? []).map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onOpen={() => setOpen(t)}
                  action={
                    <Button
                      className="min-h-9 px-3 text-sm shrink-0"
                      onClick={async () => {
                        await db.tasks.update(t.id!, { status: 'entrada' })
                        toast('De volta à entrada.')
                      }}
                    >
                      Voltar para entrada
                    </Button>
                  }
                />
              ))}
            </List>
          )}
        </>
      )}

      {tab === 'planejadas' && (
        <>
          <p className="text-xs text-muted mb-2">Já têm hora na linha do tempo. Aparecem na Semana e no Agora.</p>
          {planned && planned.length === 0 ? (
            <Empty title="Nada planejado ainda." hint="Dê forma a algo da entrada e encaixe." />
          ) : (
            <List>
              {(planned ?? []).map((t) => (
                <TaskRow key={t.id} task={t} extra={blockByTask.get(t.id!) ?? 'sem bloco na agenda'} />
              ))}
            </List>
          )}
        </>
      )}

      {tab === 'feitas' && (
        <details className="group">
          <summary className="cursor-pointer select-none text-sm text-muted mb-2">
            Últimas {done?.length ?? 0} feitas. Toque para ver.
          </summary>
          {done && done.length === 0 ? (
            <Empty title="Ainda nada feito por aqui." hint="Cada bloco fechado aparece aqui." />
          ) : (
            <List>
              {(done ?? []).map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  extra={t.doneAt ? `feita ${fmtRelativeDays(t.doneAt)} às ${hhmm(t.doneAt)}` : 'feita'}
                />
              ))}
            </List>
          )}
        </details>
      )}

      <TriageSheet task={open} onClose={() => setOpen(null)} />
    </div>
  )
}
