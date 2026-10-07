import { useState } from 'react'
import { Plus } from 'lucide-react'
import { db, type Area } from '../../db/schema'
import { useUI } from '../../store/ui'
import { AreaPicker, Button, Input } from '../ui'

/** Captura em uma linha, no topo da entrada. Área opcional; o resto vem na triagem. */
export function InboxCapture() {
  const [title, setTitle] = useState('')
  const [area, setArea] = useState<Area | undefined>()
  const toast = useUI((s) => s.toast)

  async function save() {
    const t = title.trim()
    if (!t) return
    await db.tasks.add({ title: t, area, status: 'entrada', subtasks: [], createdAt: new Date().toISOString(), rescheduleCount: 0 })
    setTitle('')
    setArea(undefined)
    toast('Anotado. Depois ganha área, gatilho e primeiro passo.')
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="grid gap-2 mb-4"
    >
      <div className="flex gap-2">
        <Input
          id="inbox-capture"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="O que surgiu na cabeça?"
          aria-label="Anotar"
          autoComplete="off"
        />
        <Button type="submit" variant="primary" disabled={!title.trim()} aria-label="Guardar na entrada" className="px-3">
          <Plus size={20} />
        </Button>
      </div>
      {title.trim() && <AreaPicker value={area} onChange={setArea} allowEmpty />}
    </form>
  )
}
