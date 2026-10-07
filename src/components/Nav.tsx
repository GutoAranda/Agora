import { NavLink } from 'react-router-dom'
import { ListChecks, Sun, Timer } from 'lucide-react'
import { cx } from './ui'
import { usePomodoro } from '../tools/pomodoro/store'

const items = [
  { to: '/', label: 'Agora', icon: Sun },
  { to: '/hoje', label: 'Hoje', icon: ListChecks },
  { to: '/foco', label: 'Foco', icon: Timer },
]

export function Nav() {
  const running = usePomodoro((s) => s.status === 'rodando')
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 bg-surface/95 backdrop-blur border-t border-line nav-safe" aria-label="Principal">
      <ul className="grid grid-cols-3 max-w-md mx-auto">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) => cx('relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold', isActive ? 'text-accent' : 'text-muted')}
            >
              <Icon size={24} strokeWidth={2.2} />
              {label}
              {to === '/foco' && running && <span className="absolute top-2 right-[34%] w-2 h-2 rounded-full bg-accent" aria-label="foco em andamento" />}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
