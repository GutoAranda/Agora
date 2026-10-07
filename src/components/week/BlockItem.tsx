import type { CSSProperties } from 'react'
import { BookOpen, Check, Footprints, Leaf, Repeat } from 'lucide-react'
import { AREA_LABEL, type Block } from '../../db/schema'
import { fmtDuration, hhmm, parseISO } from '../../lib/time'
import { cx } from '../ui'

/* ==========================================================================
   Um bloco desenhado na linha do tempo.
   Pedra (fixo) é sólido; água (tarefa/estudo) é clara; deslocamento é
   hachurado; rotina tem borda tracejada; descanso tem tom de folha.
   ========================================================================== */

export const KIND_LABEL: Record<Block['kind'], string> = {
  fixo: 'Fixo (pedra)',
  tarefa: 'Tarefa',
  estudo: 'Estudo',
  rotina: 'Rotina',
  descanso: 'Descanso',
  sono: 'Sono',
  deslocamento: 'Deslocamento',
}

export function blockMinutes(b: Block): number {
  return Math.round((parseISO(b.end).getTime() - parseISO(b.start).getTime()) / 60000)
}

function look(kind: Block['kind']): { cls: string; style?: CSSProperties } {
  switch (kind) {
    case 'fixo':
      return { cls: 'bg-[rgb(var(--area))] text-white dark:text-bg font-bold' }
    case 'tarefa':
    case 'estudo':
      return { cls: 'area-bg area-text area-bar font-semibold' }
    case 'deslocamento':
      return {
        cls: 'text-muted',
        style: { backgroundImage: 'repeating-linear-gradient(135deg, rgb(var(--area) / 0.22) 0 4px, transparent 4px 9px)' },
      }
    case 'rotina':
      return { cls: 'border border-dashed area-text bg-surface font-semibold', style: { borderColor: 'rgb(var(--area) / 0.75)' } }
    case 'descanso':
      return { cls: 'bg-ok/15 text-ok font-semibold' }
    case 'sono':
      return { cls: 'bg-line/50 text-muted' }
  }
}

export function BlockItem({
  block,
  style,
  height,
  dense,
  onClick,
}: {
  block: Block
  style: CSSProperties
  height: number
  dense?: boolean
  onClick: (b: Block) => void
}) {
  const done = block.status === 'feito'
  const skipped = block.status === 'pulado'
  const started = block.status === 'iniciado'
  const { cls, style: kindStyle } = look(block.kind)
  const minutes = blockMinutes(block)
  const showTime = height >= (dense ? 44 : 38)
  const Icon = block.kind === 'deslocamento' ? Footprints : block.kind === 'descanso' ? Leaf : block.kind === 'rotina' ? Repeat : block.kind === 'estudo' ? BookOpen : null
  const label = `${block.title}, ${hhmm(block.start)} às ${hhmm(block.end)}, ${AREA_LABEL[block.area]}${done ? ', feito' : skipped ? ', pulado' : ''}`

  return (
    <button
      type="button"
      onClick={() => onClick(block)}
      aria-label={label}
      title={`${block.title} · ${hhmm(block.start)}–${hhmm(block.end)}`}
      style={{ ...kindStyle, ...style }}
      className={cx(
        `area-${block.area}`,
        'absolute flex flex-col items-stretch justify-start overflow-hidden rounded-lg text-left leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:z-20 hover:z-10',
        dense ? 'px-1 py-0.5 text-[11px]' : 'px-2 py-1 text-[13px]',
        cls,
        done && 'opacity-55',
        skipped && 'opacity-40 border border-dashed border-line',
        started && 'ring-2 ring-accent ring-offset-1 ring-offset-bg z-10',
      )}
    >
      <span className="flex items-start gap-1 min-w-0">
        {done && <Check size={dense ? 12 : 14} className="shrink-0 mt-px" aria-hidden="true" />}
        {!done && Icon && <Icon size={dense ? 11 : 13} className="shrink-0 mt-px opacity-80" aria-hidden="true" />}
        <span className={cx('min-w-0 truncate', done && 'line-through decoration-1')}>{block.title}</span>
      </span>
      {showTime && (
        <span className="block tabular opacity-80 truncate">
          {hhmm(block.start)}–{hhmm(block.end)}
          {!dense && ` · ${fmtDuration(minutes)}`}
          {!dense && block.location && height >= 56 && ` · ${block.location}`}
        </span>
      )}
    </button>
  )
}
