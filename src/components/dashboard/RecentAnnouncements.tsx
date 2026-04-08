import { useAnnouncements } from '../../hooks/useAnnouncements'

export default function RecentAnnouncements() {
  const { data, isLoading, error } = useAnnouncements(5)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Recent Announcements</h2>

      {isLoading ? (
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-500">Failed to load announcements</p>
      ) : data.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No announcements</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {data.map((announcement) => (
            <li key={announcement.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {announcement.is_pinned && (
                      <span className="mr-1.5" title="Pinned">
                        📌
                      </span>
                    )}
                    {announcement.title}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {announcement.author.full_name} &middot;{' '}
                    {new Date(announcement.published_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                {announcement.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
