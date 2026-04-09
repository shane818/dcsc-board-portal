import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useConversations } from '../../hooks/useConversations'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function stripMentions(body: string): string {
  return body.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1')
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function RecentMessages() {
  const { profile } = useAuth()
  const { data: conversations, isLoading, error, totalUnread } = useConversations(profile?.id)

  // Show the 5 most recent conversations that have at least one message
  const recent = conversations
    .filter((c) => c.last_message)
    .slice(0, 5)

  function getConversationName(conv: typeof recent[0]): string {
    if (conv.name) return conv.name
    const other = conv.members.find((m) => m.profile_id !== profile?.id)
    return other?.profile.full_name ?? 'Direct Message'
  }

  function getAvatarInitials(conv: typeof recent[0]): string {
    if (conv.name) return conv.name.slice(0, 2).toUpperCase()
    const other = conv.members.find((m) => m.profile_id !== profile?.id)
    return getInitials(other?.profile.full_name ?? '?')
  }

  function isUnread(conv: typeof recent[0]): boolean {
    if (!conv.last_message || !conv.my_last_read_at) return false
    return new Date(conv.last_message.created_at) > new Date(conv.my_last_read_at)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Messages
          {totalUnread > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-medium text-white">
              {totalUnread}
            </span>
          )}
        </h2>
        <Link
          to="/messages"
          className="text-sm font-medium text-navy hover:text-navy-dark"
        >
          View all
        </Link>
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-500">Failed to load messages</p>
      ) : recent.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No messages yet</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {recent.map((conv) => {
            const unread = isUnread(conv)
            return (
              <li key={conv.id}>
                <Link
                  to="/messages"
                  className="flex items-start gap-3 rounded-lg p-2 -mx-2 hover:bg-gray-50 transition-colors"
                >
                  {/* Avatar */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy/15 text-navy text-xs font-bold">
                    {getAvatarInitials(conv)}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                        {getConversationName(conv)}
                      </p>
                      <span className="shrink-0 text-[10px] text-gray-400">
                        {conv.last_message ? formatTime(conv.last_message.created_at) : ''}
                      </span>
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${unread ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                      {conv.last_message ? stripMentions(conv.last_message.body) : ''}
                    </p>
                  </div>

                  {/* Unread dot */}
                  {unread && (
                    <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
