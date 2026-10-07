import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, Repeat, RotateCcw, SkipForward, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AREA_LABEL, db, type Area, type Block } from '../../db/schema'
import { conflictsWith } from '../../lib/schedule'
import { addDays, addMinutes, atTime, dayKey, fmtDay, hhmm, parseISO } from '../../lib/time'
import { useUI } from '../../store/ui'
import { BlockActions, skipBlock } from '../BlockActions'
import { AreaPicker, Button, Chip, Field, Input, Label, Sheet, Textarea, cx } from '../ui'
import { KIND_LABEL } from './BlockItem'

/* ==========================================================================
   Edição de um bloco: horário, dia, lugar, primeiro passo, notas.
   Mais: mover de dia, pular, apagar e os botões do loop (Feito / +10 / Quebrar).
   ========================================================================== */

/** Apaga o bloco; se veio de uma tarefa, a tarefa volta para a entrada. */
export async function deleteBlock(b: Block): Promise<void> {
  await db.blocks.delete(b.id!)
  if (b.taskId) {
    const t = await db.tasks.get(b.taskId)
    if (t && t.status !== 'feita') await db.tasks.update(b.taskId, { status: 'entrada' })
  }
}

function BlockForm({ block, onClose }: { block: Block; onClose: () => void }) {
  const toast = useUI((s) => s.toast)
  const [title, setTitle] = useState(block.title)
  const [area, setArea] = useState<Area>(block.area)
  const [day, setDay] = useState(dayKey(block.start))
  const [startTime, setStartTime] = useState(hhmm(block.start))
  const [endTime, setEndTime] = useState(hhmm(block.end))
  const [location, setLocation] = useState(block.location ?? '')
  const [firstStep, setFirstStep] = useState(block.firstStep ?? '')
  const [notes, setNotes] = useState(block.notes ?? '')
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveTo, setMoveTo] = useState(dayKey(addDays(parseISO(block.start), 1)))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [conflicts, setConflicts] = useState<Block[]>([])

  const range = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return null
    const start = atTime(day, startTime)
    let end = atTime(day, endTime)
    if (end <= start) end = addMinutes(end, 24 * 60)
    return { start, end }
  }, [day, startTime, endTime])

  useEffect(() => {
    let alive = true
    if (!range) {
      setConflicts([])
      return
    }
    void conflictsWith(range.start, range.end, block.id).then((r) => {
      if (alive) setConflicts(r)
    })
    return () => {
      alive = false
    }
  }, [range, block.id])

  const crossesMidnight = range && dayKey(range.end) !== day && hhmm(range.end) !== '00:00'
  const live = block.status === 'planejado' || block.status === 'iniciado'

  const save = async () => {
    if (!range || !title.trim()) return
    await db.blocks.update(block.id!, {
      title: title.trim(),
      area,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      day: dayKey(range.start),
      location: location.trim() || undefined,
      firstStep: firstStep.trim() || undefined,
      notes: notes.trim() || undefined,
    })
    toast('Salvo.')
    onClose()
  }

  const move = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(moveTo)) return
    const start = parseISO(block.start)
    const end = parseISO(block.end)
    const newStart = atTime(moveTo, hhmm(start))
    const delta = newStart.getTime() - start.getTime()
    const newEnd = new Date(end.getTime() + delta)
    await db.blocks.update(block.id!, { start: newStart.toISOString(), end: newEnd.toISOString(), day: dayKey(newStart) })
    toast(`Movido para ${fmtDay(newStart)}.`)
    onClose()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={cx(`area-${block.area} area-text`, 'text-xs font-bold uppercase tracking-wider')}>{AREA_LABEL[block.area]}</span>
          <Chip>{KIND_LABEL[block.kind]}</Chip>
          {block.status === 'feito' && <Chip tone="ok">Feito</Chip>}
          {block.status === 'pulado' && <Chip>Pulado</Chip>}
          {block.status === 'iniciado' && <Chip tone="accent">Em andamento</Chip>}
        </div>
        <span className="text-xs text-muted tabular">
          {fmtDay(block.start)} · {hhmm(block.start)}–{hhmm(block.end)}
        </span>
      </div>

      {live && <BlockActions block={block} compact />}
      {block.status === 'pulado' && (
        <Button
          className="w-full"
          onClick={async () => {
            await db.blocks.update(block.id!, { status: 'planejado' })
            toast('De volta ao plano.')
          }}
        >
          <RotateCcw size={18} /> Restaurar bloco
        </Button>
      )}

      {block.recurringId != null && (
        <p className="text-sm text-muted rounded-xl bg-line/40 px-3 py-2 flex gap-2">
          <Repeat size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Vem da regra semanal; edite a regra em{' '}
            <Link to="/areas" className="underline font-semibold text-fg">
              Áreas
            </Link>{' '}
            para mudar todas. Aqui você muda só esta vez.
          </span>
        </p>
      )}

      <Field label="Título">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <div>
        <Label>Área</Label>
        <AreaPicker value={area} onChange={setArea} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Dia">
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="tabular px-2" />
        </Field>
        <Field label="Início">
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="tabular px-2" />
        </Field>
        <Field label="Fim">
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="tabular px-2" />
        </Field>
      </div>
      {crossesMidnight && <p className="text-xs text-muted -mt-2">Termina depois da meia-noite, no dia seguinte.</p>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Lugar">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="opcional" />
        </Field>
        <Field label="Primeiro passo">
          <Input value={firstStep} onChange={(e) => setFirstStep(e.target.value)} placeholder="a menor ação" />
        </Field>
      </div>
      <Field label="Notas">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="opcional" />
      </Field>

      {conflicts.length > 0 && (
        <p className="text-sm rounded-xl bg-warn/10 text-warn px-3 py-2" role="status">
          Passa por cima de: {conflicts.map((c) => `${c.title} (${hhmm(c.start)}–${hhmm(c.end)})`).join(', ')}. Dá para salvar mesmo assim, mas vai apertar.
        </p>
      )}

      <Button variant="primary" className="w-full" onClick={save} disabled={!range || !title.trim()}>
        Salvar
      </Button>

      <div className="border-t border-line pt-3 space-y-2">
        <Button className="w-full justify-start" onClick={() => setMoveOpen((v) => !v)} aria-expanded={moveOpen}>
          <CalendarDays size={18} /> Mover para outro dia
        </Button>
        {moveOpen && (
          <div className="flex gap-2 items-end pl-1">
            <Field label="Para o dia">
              <Input type="date" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="tabular" />
            </Field>
            <Button variant="primary" onClick={move}>
              <ArrowRight size={18} /> Mover
            </Button>
          </div>
        )}
        {live && (
          <Button
            className="w-full justify-start"
            onClick={async () => {
              await skipBlock(block)
              toast('Pulado. Sem drama; a tarefa volta para a entrada.')
              onClose()
            }}
          >
            <SkipForward size={18} /> Pular desta vez
          </Button>
        )}
        {!confirmDelete ? (
          <Button variant="ghost" className="w-full justify-start" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={18} /> Apagar bloco
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              onClick={async () => {
                await deleteBlock(block)
                toast(block.taskId ? 'Apagado. A tarefa voltou para a entrada.' : 'Apagado.')
                onClose()
              }}
            >
              <Trash2 size={18} /> Confirmar
            </Button>
            <Button className="flex-1" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function BlockSheet({ block, onClose }: { block: Block | null; onClose: () => void }) {
  return (
    <Sheet open={!!block} onClose={onClose} title={block ? 'Editar bloco' : ''}>
      {block && <BlockForm key={block.id} block={block} onClose={onClose} />}
    </Sheet>
  )
}
