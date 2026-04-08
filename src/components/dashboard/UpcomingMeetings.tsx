import { useMeetings } from '../../hooks/useMeetings'

export default function UpcomingMeetings() {
  const { data, isLoading, error } = useMeetings(5)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Upcoming Meetings</h2>

      {isLoading ? (
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-500">Failed to load meetings</p>
      ) : data.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No upcoming meetings</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.map((meeting) => (
            <li key={meeting.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{meeting.title}</p>
                <p className="text-xs text-gray-500">
                  {meeting.committee?.name ?? 'Full Board'} &middot;{' '}
                  {new Date(meeting.meeting_date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  meeting.status === 'scheduled'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {meeting.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
