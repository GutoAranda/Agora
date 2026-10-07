import { NavLink } from 'react-router-dom'
import { CalendarDays, Inbox, LayoutGrid, Sun, ClipboardCheck } from 'lucide-react'
import { cx } from './ui'

const items = [
  { to: '/', label: 'Agora', icon: Sun },
  { to: '/semana', label: 'Semana', icon: CalendarDays },
  { to: '/entrada', label: 'Entrada', icon: Inbox },
  { to: '/areas', label: 'Áreas', icon: LayoutGrid },
  { to: '/revisao', label: 'Revisão', icon: ClipboardCheck },
]

export function Nav({ inboxCount }: { inboxCount: number }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 bg-surface/95 backdrop-blur border-t border-line nav-safe" aria-label="Principal">
      <ul className="grid grid-cols-5 max-w-3xl mx-auto">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cx('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', isActive ? 'text-accent' : 'text-muted')
              }
            >
              <Icon size={22} strokeWidth={2.2} />
              {label}
              {to === '/entrada' && inboxCount > 0 && (
                <span className="absolute top-1 right-[22%] min-w-4 h-4 px-1 rounded-full bg-accent text-white text-[10px] leading-4 text-center tabular">
                  {inboxCount}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
