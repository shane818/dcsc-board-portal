import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { org } from '../../config/org'
import { useConversations } from '../../hooks/useConversations'

const navItems = [
  { to: '/', label: 'Dashboard', icon: '🏠' },
  { to: '/meetings', label: 'Meetings', icon: '📅' },
  { to: '/committees', label: 'Committees', icon: '👥' },
  { to: '/directory', label: 'Directory', icon: '🪪' },
  { to: '/action-items', label: 'Action Items', icon: '✅' },
  { to: '/announcements', label: 'Announcements', icon: '📢' },
  { to: '/messages', label: 'Messages', icon: '💬' },
  { to: '/resources', label: 'Board Resources', icon: '📚' },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { isOfficer, profile } = useAuth()
  const { totalUnread } = useConversations(profile?.id)

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-30 flex h-screen w-64 flex-col bg-navy border-r border-navy-dark
        transition-transform duration-200 ease-in-out
        md:relative md:translate-x-0 md:transition-none
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}
    >
      {/* Header */}
      <div className="flex h-20 items-center justify-between border-b border-navy-dark px-4">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={org.logoPath}
            alt={org.name}
            className="h-12 w-12 shrink-0 object-contain drop-shadow-sm"
          />
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white leading-tight">{org.shortName} Board</h1>
            <p className="text-[9px] text-white/45 leading-tight mt-0.5">
              {org.tagline}
            </p>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="shrink-0 rounded-lg p-1 text-white/50 hover:bg-navy-dark hover:text-white md:hidden"
          aria-label="Close menu"
        >
          ✕
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-navy-dark text-white border-l-2 border-dcsc-red pl-[10px]'
                  : 'text-white/75 hover:bg-navy-dark hover:text-white'
              }`
            }
          >
            <span>{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.to === '/messages' && totalUnread > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-dcsc-red px-1.5 text-[10px] font-bold text-white">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </NavLink>
        ))}

        {isOfficer && (
          <>
            <div className="my-4 border-t border-navy-dark" />
            <NavLink
              to="/admin"
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-navy-dark text-white border-l-2 border-dcsc-red pl-[10px]'
                    : 'text-white/75 hover:bg-navy-dark hover:text-white'
                }`
              }
            >
              <span>⚙️</span>
              Admin
            </NavLink>
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-navy-dark px-5 py-3">
        <p className="text-[10px] text-white/30">Est. {org.founded} · {org.location}</p>
      </div>
    </aside>
  )
}
