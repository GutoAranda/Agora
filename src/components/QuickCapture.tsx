import { useState } from 'react'
import { db, type Area } from '../db/schema'
import { useUI } from '../store/ui'
import { AreaPicker, Button, Input, Sheet } from './ui'

/** Captura em uma frase. Área é opcional aqui; gatilho e primeiro passo vêm depois, na entrada. */
export function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [area, setArea] = useState<Area | undefined>()
  const toast = useUI((s) => s.toast)

  async function save() {
    const t = title.trim()
    if (!t) return
    await db.tasks.add({ title: t, area, status: 'entrada', subtasks: [], createdAt: new Date().toISOString(), rescheduleCount: 0 })
    setTitle('')
    setArea(undefined)
    onClose()
    toast('Anotado. Vai ganhar hora e primeiro passo na revisão.')
  }

  return (
    <Sheet open={open} onClose={onClose} title="Anotar">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        className="grid gap-3"
      >
        <Input id="capture-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que surgiu na cabeça?" />
        <AreaPicker value={area} onChange={setArea} allowEmpty />
        <Button type="submit" variant="primary" disabled={!title.trim()}>
          Guardar na entrada
        </Button>
      </form>
    </Sheet>
  )
}
