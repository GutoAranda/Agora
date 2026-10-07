import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import { db, type ParkedIdea } from '../../db/schema'
import { useUI } from '../../store/ui'
import { Button, Empty, Input, Section } from '../ui'

/* Lista de espera do trabalho: ideias e "quando der tempo". Revisada no domingo. */
export function ListaEspera() {
  const toast = useUI((s) => s.toast)
  const items = useLiveQuery(() => db.parked.where('area').equals('trabalho').sortBy('createdAt'), [])
  const [text, setText] = useState('')

  async function add() {
    const t = text.trim()
    if (!t) return
    await db.parked.add({ title: t, area: 'trabalho', createdAt: new Date().toISOString() })
    setText('')
  }

  async function toTask(p: ParkedIdea) {
    await db.tasks.add({
      title: p.title,
      area: 'trabalho',
      status: 'entrada',
      notes: p.notes,
      subtasks: [],
      createdAt: new Date().toISOString(),
      rescheduleCount: 0,
    })
    await db.parked.delete(p.id!)
    toast('Virou tarefa. Está na entrada esperando hora e primeiro passo.')
  }

  return (
    <Section title="Lista de espera">
      <p className="text-sm text-muted mb-2">Coisas que não são para agora. Revisada no domingo.</p>
      <form
        className="flex gap-2 mb-2"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="ex.: organizar a pasta de modelos" aria-label="Nova ideia" />
        <Button type="submit" disabled={!text.trim()} aria-label="Adicionar">
          <Plus size={18} />
        </Button>
      </form>
      {items && items.length === 0 && <Empty title="Lista vazia" hint="Quando surgir algo que não é para hoje, deixe aqui em vez de na cabeça." />}
      {items && items.length > 0 && (
        <ul className="divide-y divide-line border border-line rounded-2xl bg-surface">
          {items.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2">
              <span className="text-sm font-semibold flex-1 min-w-0 truncate">{p.title}</span>
              <Button className="min-h-9 px-2.5 text-xs" onClick={() => void toTask(p)}>
                Virar tarefa <ArrowRight size={14} />
              </Button>
              <button className="p-2 text-muted" aria-label="Apagar" onClick={() => void db.parked.delete(p.id!)}>
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
