import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, isDoneOn, moveLater, updateSettings } from '../db/schema'
import { useUI } from '../store/ui'
import { addDays, dayKey, todayKey } from '../lib/time'
import { todayList } from '../lib/day'
import { Button, Field, Input, Sheet } from './ui'

/* Fechar o dia: o que ficou vai para amanhã e você escolhe uma coisa só. */

export function CloseDaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useUI((s) => s.toast)
  const [one, setOne] = useState('')
  const today = todayKey()
  const tomorrow = dayKey(addDays(new Date(), 1))
  const items = useLiveQuery(() => db.items.toArray(), [], [])
  const left = todayList(items, today, new Date().getDay()).filter((i) => !isDoneOn(i, today) && !i.repeat?.length && !i.time)

  useEffect(() => {
    if (open) setOne('')
  }, [open])

  async function finish() {
    for (const i of left) await moveLater(i, today, tomorrow)
    if (one.trim()) {
      await db.items.add({ title: one.trim(), day: tomorrow, done: false, createdAt: new Date().toISOString() })
    }
    await updateSettings({ closedDay: today, hardDay: undefined })
    onClose()
    toast(left.length ? `${left.length} ${left.length === 1 ? 'coisa foi' : 'coisas foram'} para amanhã. Sem drama.` : 'Dia fechado. Boa noite.')
  }

  return (
    <Sheet open={open} onClose={onClose} title="Fechar o dia">
      <div className="grid gap-4">
        {left.length > 0 ? (
          <p className="text-muted">
            {left.length === 1 ? 'Uma coisa ficou' : `${left.length} coisas ficaram`} de hoje. Vão para amanhã, sem culpa.
          </p>
        ) : (
          <p className="text-muted">Nada pendente de hoje.</p>
        )}
        <Field label="A única coisa que importa amanhã">
          <Input id="close-one" value={one} onChange={(e) => setOne(e.target.value)} placeholder="Opcional" />
        </Field>
        <Button variant="primary" className="min-h-12" onClick={() => void finish()}>
          Fechar o dia
        </Button>
      </div>
    </Sheet>
  )
}
