import { useAuth } from '../../context/AuthContext'
import { signOut } from '../../lib/auth'
import GlobalSearch from './GlobalSearch'

interface HeaderProps {
  onMenuClick: () => void
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { profile } = useAuth()

  async function handleSignOut() {
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out failed:', err)
    }
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:hidden"
        aria-label="Open menu"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Global search — centered */}
      <div className="hidden sm:flex flex-1 justify-center px-6">
        <GlobalSearch />
      </div>

      {/* Right side: profile + sign out */}
      <div className="flex items-center gap-3 ml-auto sm:ml-0">
        <div className="hidden sm:block text-right">
          <p className="text-sm font-medium text-gray-900">{profile?.full_name}</p>
          <p className="text-xs text-gray-500 capitalize">
            {profile?.role?.replace('_', ' ')}
          </p>
        </div>

        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.full_name}
            className="h-9 w-9 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy/20 text-sm font-medium text-navy">
            {(profile?.full_name ?? '?').charAt(0)}
          </div>
        )}

        <button
          onClick={handleSignOut}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
