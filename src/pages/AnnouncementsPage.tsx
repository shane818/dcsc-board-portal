import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useAllAnnouncements } from '../hooks/useAnnouncements'
import { useCommittees } from '../hooks/useCommittees'
import type { AnnouncementAudience } from '../types/database'

const audienceClasses: Record<AnnouncementAudience, string> = {
  all_board: 'bg-navy/10 text-navy',
  committee: 'bg-green-50 text-green-700',
  executives: 'bg-purple-50 text-purple-700',
}

const audienceLabels: Record<AnnouncementAudience, string> = {
  all_board: 'All Board',
  committee: 'Committee',
  executives: 'Executives',
}

export default function AnnouncementsPage() {
  const { profile, isOfficer } = useAuth()
  const { data: announcements, isLoading, error, refetch } = useAllAnnouncements()
  const { data: memberships } = useCommittees(profile?.id)

  const [expandedId, setExpandedId] = useState<string | null>(null)

  const isCommitteeChair = memberships.some((m) => m.role === 'chair')
  const canCreate = isOfficer || isCommitteeChair

  async function handleDelete(id: string) {
    if (!window.confirm('Are you sure you want to delete this announcement?')) return
    await supabase.from('announcements').delete().eq('id', id)
    refetch()
  }

  function canEdit(authorId: string): boolean {
    return isOfficer || profile?.id === authorId
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="mt-1 text-sm text-gray-500">
            View board-wide and committee announcements.
          </p>
        </div>
        {canCreate && (
          <Link
            to="/announcements/new"
            className="self-start bg-navy text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-navy-dark inline-block sm:self-auto"
          >
            New Announcement
          </Link>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading announcements...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : announcements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-sm text-gray-400">
          No announcements yet.
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => {
            const isExpanded = expandedId === a.id
            return (
              <div
                key={a.id}
                className="rounded-xl border border-gray-200 bg-white p-6 cursor-pointer hover:shadow-sm transition-shadow"
                onClick={() => setExpandedId(isExpanded ? null : a.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {a.is_pinned && (
                        <span className="text-sm" title="Pinned">
                          📌
                        </span>
                      )}
                      <h3 className="text-base font-semibold text-gray-900 truncate">
                        {a.title}
                      </h3>
                    </div>

                    <p
                      className={`text-sm text-gray-600 whitespace-pre-wrap ${
                        isExpanded ? '' : 'line-clamp-3'
                      }`}
                    >
                      {a.body}
                    </p>

                    <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                      <span>{a.author.full_name}</span>
                      <span>&middot;</span>
                      <span>
                        {new Date(a.published_at).toLocaleDateString()}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-medium ${
                          audienceClasses[a.target_audience]
                        }`}
                      >
                        {a.target_audience === 'committee' && a.target_committee_id
                          ? 'Committee'
                          : audienceLabels[a.target_audience]}
                      </span>
                    </div>
                  </div>

                  {canEdit(a.author_id) && (
                    <div
                      className="flex shrink-0 gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link
                        to={`/announcements/new?edit=${a.id}`}
                        className="border border-gray-300 bg-white rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(a.id)}
                        className="border border-gray-300 bg-white rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
