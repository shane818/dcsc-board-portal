import { useAuth } from '../../context/AuthContext'
import { useCommittees } from '../../hooks/useCommittees'

export default function MyCommittees() {
  const { profile } = useAuth()
  const { data, isLoading, error } = useCommittees(profile?.id)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">My Committees</h2>

      {isLoading ? (
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-500">Failed to load committees</p>
      ) : data.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No committee memberships</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.map((m) => (
            <li key={m.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {m.committee.name}
                </p>
                <p className="text-xs text-gray-500">{m.committee.description}</p>
              </div>
              <span className="rounded-full bg-navy/10 px-2.5 py-0.5 text-xs font-medium text-navy capitalize">
                {m.role}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
