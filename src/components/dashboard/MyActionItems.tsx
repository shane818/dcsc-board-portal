import { useAuth } from '../../context/AuthContext'
import { useActionItems } from '../../hooks/useActionItems'

export default function MyActionItems() {
  const { profile } = useAuth()
  const { data, isLoading, error } = useActionItems(profile?.id)

  const priorityColors = {
    high: 'bg-red-50 text-red-700',
    medium: 'bg-yellow-50 text-yellow-700',
    low: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">My Action Items</h2>

      {isLoading ? (
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-500">Failed to load action items</p>
      ) : data.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No open action items</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.map((item) => (
            <li key={item.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{item.title}</p>
                <p className="text-xs text-gray-500">
                  {item.due_date
                    ? `Due ${new Date(item.due_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}`
                    : 'No due date'}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  priorityColors[item.priority]
                }`}
              >
                {item.priority}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
