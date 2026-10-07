import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { db, type Recurring } from '../../db/schema'
import { useUI } from '../../store/ui'
import { WEEKDAY_SHORT, todayKey } from '../../lib/time'
import { dropFutureFromRecurring, materializeAround } from '../../lib/materialize'
import { RecurringForm } from '../RecurringForm'
import { Button, Card, Empty, Section, Sheet } from '../ui'
import { InlineConfirm } from './ChoiceChips'
import { CLOSE_TITLE } from './FecharExpediente'

export function weekdaysLabel(ws: number[]): string {
  const order = [1, 2, 3, 4, 5, 6, 0]
  const on = order.filter((d) => ws.includes(d))
  if (on.length === 5 && !ws.includes(0) && !ws.includes(6)) return 'seg a sex'
  if (on.length === 7) return 'todos os dias'
  return on.map((d) => WEEKDAY_SHORT[d]).join(' · ')
}

/** Regras do estágio: área trabalho, tipo fixo (sem o lembrete de fechar o expediente). */
export function useEstagioRules(): Recurring[] | undefined {
  return useLiveQuery(
    async () => (await db.recurring.where('area').equals('trabalho').toArray()).filter((r) => r.kind === 'fixo' && r.title !== CLOSE_TITLE),
    [],
  )
}

export function HorarioEstagio() {
  const settings = useUI((s) => s.settings)
  const toast = useUI((s) => s.toast)
  const rules = useEstagioRules()
  const [editing, setEditing] = useState<Partial<Recurring> | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)

  async function save(r: Recurring) {
    const id = r.id ?? editing?.id
    if (id) {
      await db.recurring.put({ ...r, id, area: 'trabalho', kind: 'fixo' })
      await dropFutureFromRecurring(id, todayKey())
    } else {
      await db.recurring.add({ ...r, area: 'trabalho', kind: 'fixo' })
    }
    await materializeAround(new Date(), settings)
    setEditing(null)
    toast('Horário salvo. A agenda já foi atualizada.')
  }

  async function remove(r: Recurring) {
    await dropFutureFromRecurring(r.id!, todayKey())
    await db.recurring.delete(r.id!)
    setRemoving(null)
    toast('Horário removido.')
  }

  return (
    <Section
      title="Horário do estágio"
      right={
        <Button className="min-h-9 px-3 text-sm" onClick={() => setEditing({})}>
          <Plus size={16} /> Horário
        </Button>
      }
    >
      {rules && rules.length === 0 && (
        <Empty
          title="Nenhum horário ainda"
          hint="Cadastre os dias e horas do estágio. Inclua o deslocamento: ele vira bloco e protege o resto do dia."
          action={
            <Button variant="primary" onClick={() => setEditing({})}>
              <Plus size={18} /> Cadastrar estágio
            </Button>
          }
        />
      )}
      <div className="grid gap-2">
        {rules?.map((r) => (
          <Card key={r.id} area="trabalho" className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold truncate">{r.title}</p>
                <p className="text-sm text-muted tabular">
                  {weekdaysLabel(r.weekdays)} · {r.startTime}–{r.endTime}
                  {r.travelMin ? ` · +${r.travelMin} min de deslocamento` : ''}
                </p>
                {r.location && <p className="text-xs text-muted">{r.location}</p>}
                {!r.active && <p className="text-xs text-muted">Pausado</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button className="p-2 text-muted" aria-label="Editar" onClick={() => setEditing(r)}>
                  <Pencil size={18} />
                </button>
                <button className="p-2 text-muted" aria-label="Remover" onClick={() => setRemoving(r.id!)}>
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            {removing === r.id && (
              <div className="mt-2">
                <InlineConfirm text="Remover este horário e os blocos futuros?" onYes={() => void remove(r)} onNo={() => setRemoving(null)} />
              </div>
            )}
          </Card>
        ))}
      </div>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Editar horário' : 'Novo horário do estágio'}>
        <p className="text-sm text-muted mb-3">Inclua o deslocamento: o tempo de ir e voltar também entra na agenda.</p>
        {editing !== null && (
          <RecurringForm initial={editing} onSave={save} onCancel={() => setEditing(null)} fixedArea="trabalho" fixedKind="fixo" />
        )}
      </Sheet>
    </Section>
  )
}
