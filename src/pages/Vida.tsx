import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '../components/ui'
import { Sono } from '../components/vida/Sono'
import { Rotinas } from '../components/vida/Rotinas'
import { Habitos } from '../components/vida/Habitos'
import { Descanso } from '../components/vida/Descanso'
import { Lembretes } from '../components/vida/Lembretes'

/* ==========================================================================
   Área Vida: sono como âncora, rotinas de manhã e noite, até três hábitos,
   descanso com hora marcada e as pessoas e contas que não podem passar.
   ========================================================================== */

export default function VidaPage() {
  return (
    <div>
      <Link to="/areas" className="inline-flex items-center gap-1 text-sm text-muted mb-2">
        <ChevronLeft size={16} /> Áreas
      </Link>
      <PageHeader title="Vida" sub="O que sustenta o resto: sono, rotina, descanso e gente." />
      <Sono />
      <Rotinas />
      <Habitos />
      <Descanso />
      <Lembretes />
    </div>
  )
}
