import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, ChevronLeft } from 'lucide-react'
import { db } from '../db/schema'
import { fmtRelativeDays, fmtDuration } from '../lib/time'
import { Chip, Empty, PageHeader, Section } from '../components/ui'
import { HorarioEstagio } from '../components/trabalho/HorarioEstagio'
import { Entregas } from '../components/trabalho/Entregas'
import { PedidoUrgente } from '../components/trabalho/PedidoUrgente'
import { ListaEspera } from '../components/trabalho/ListaEspera'
import { FecharExpediente } from '../components/trabalho/FecharExpediente'

/* ==========================================================================
   Área Trabalho: estágio como pedra, entregas com marcos, o botão do urgente,
   lista de espera e o ritual de fechar o expediente.
   ========================================================================== */

function TarefasAbertas() {
  const tasks = useLiveQuery(
    async () =>
      (await db.tasks.where('area').equals('trabalho').toArray())
        .filter((t) => t.status === 'entrada' || t.status === 'planejada')
        .sort((a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9') || a.createdAt.localeCompare(b.createdAt)),
    [],
  )
  return (
    <Section
      title="Tarefas abertas"
      right={
        <Link to="/entrada" className="text-sm font-semibold text-accent inline-flex items-center gap-1">
          Entrada <ArrowRight size={16} />
        </Link>
      }
    >
      {tasks && tasks.length === 0 && <Empty title="Nada aberto" hint="Tarefas do trabalho na entrada ou já na agenda aparecem aqui." />}
      {tasks && tasks.length > 0 && (
        <ul className="divide-y divide-line border border-line rounded-2xl bg-surface">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-3 py-2 area-trabalho">
              <span className="area-dot w-2 h-2 rounded-full shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{t.title}</p>
                {t.firstStep && <p className="text-xs text-muted truncate">{t.firstStep}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                {t.estimateMin ? <Chip>{fmtDuration(t.estimateMin)}</Chip> : null}
                {t.dueAt ? <Chip tone="accent">{fmtRelativeDays(t.dueAt)}</Chip> : null}
                <Chip tone={t.status === 'planejada' ? 'ok' : 'muted'}>{t.status === 'planejada' ? 'na agenda' : 'entrada'}</Chip>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

export default function TrabalhoPage() {
  return (
    <div>
      <Link to="/areas" className="inline-flex items-center gap-1 text-sm text-muted mb-2">
        <ChevronLeft size={16} /> Áreas
      </Link>
      <PageHeader title="Trabalho" sub="O estágio é pedra. O resto se encaixa em volta." />
      <div className="mb-6">
        <PedidoUrgente />
      </div>
      <HorarioEstagio />
      <Entregas />
      <FecharExpediente />
      <TarefasAbertas />
      <ListaEspera />
    </div>
  )
}
