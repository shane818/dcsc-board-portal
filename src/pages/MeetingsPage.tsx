import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCommittees } from '../hooks/useCommittees'
import { useFilteredMeetings } from '../hooks/useMeetings'
import type { MeetingStatus } from '../types/database'

const statusColors: Record<MeetingStatus, string> = {
  scheduled: 'bg-green-100 text-green-800',
  in_progress: 'bg-navy/20 text-navy-dark',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
}

function formatMeetingDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function MeetingsPage() {
  const navigate = useNavigate()
  const { profile, isOfficer } = useAuth()
  const { data: memberships } = useCommittees(profile?.id)

  const [selectedCommitteeId, setSelectedCommitteeId] = useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<MeetingStatus | 'all'>('all')

  const canCreateMeeting = isOfficer || memberships.some((m) => m.role === 'chair')

  const {
    data: meetings,
    isLoading,
    error,
  } = useFilteredMeetings({
    committeeId: selectedCommitteeId,
    status: selectedStatus,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage board and committee meetings.
          </p>
        </div>
        {canCreateMeeting && (
          <Link
            to="/meetings/new"
            className="self-start rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark sm:self-auto"
          >
            New Meeting
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="max-w-xs">
          <label htmlFor="committee-filter" className="block text-sm font-medium text-gray-700">
            Committee
          </label>
          <select
            id="committee-filter"
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            value={selectedCommitteeId ?? ''}
            onChange={(e) => setSelectedCommitteeId(e.target.value || null)}
          >
            <option value="">All Committees</option>
            <option value="board">Full Board</option>
            {memberships.map((m) => (
              <option key={m.committee.id} value={m.committee.id}>
                {m.committee.name}
              </option>
            ))}
          </select>
        </div>

        <div className="max-w-xs">
          <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700">
            Status
          </label>
          <select
            id="status-filter"
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as MeetingStatus | 'all')}
          >
            <option value="all">All</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Meetings Table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-navy border-t-transparent" />
            <span className="ml-3 text-sm text-gray-500">Loading meetings...</span>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-red-500">{error}</div>
        ) : meetings.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">
            No meetings found
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Title</th>
                <th className="px-6 py-3">Committee</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {meetings.map((meeting) => (
                <tr
                  key={meeting.id}
                  onClick={() => navigate(`/meetings/${meeting.id}`)}
                  className="cursor-pointer transition-colors hover:bg-gray-50"
                >
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatMeetingDate(meeting.meeting_date)}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {meeting.title}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {meeting.committee?.name ?? 'Full Board'}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColors[meeting.status]}`}
                    >
                      {meeting.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
