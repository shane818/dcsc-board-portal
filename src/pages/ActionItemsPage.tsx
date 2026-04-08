import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useAllActionItems } from '../hooks/useActionItems'
import ActionItemForm from '../components/ActionItemForm'
import type { ActionItem, ActionItemPriority, ActionItemStatus } from '../types/database'

type StatusFilter = 'active' | 'all' | 'completed'
type AssigneeFilter = 'mine' | 'all'

const priorityClasses: Record<ActionItemPriority, string> = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-yellow-50 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
}

const statusClasses: Record<ActionItemStatus, string> = {
  pending: 'bg-yellow-50 text-yellow-700',
  in_progress: 'bg-navy/10 text-navy',
  completed: 'bg-green-50 text-green-700',
  overdue: 'bg-red-50 text-red-700',
}

function isOverdue(item: ActionItem): boolean {
  return (
    item.status !== 'completed' &&
    !!item.due_date &&
    new Date(item.due_date) < new Date()
  )
}

export default function ActionItemsPage() {
  const { profile } = useAuth()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('mine')
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<ActionItem | null>(null)

  const { data: items, isLoading, error, refetch } = useAllActionItems({
    assigneeId: assigneeFilter === 'mine' ? profile?.id : undefined,
    status: statusFilter,
  })

  async function handleComplete(id: string) {
    const { error } = await supabase
      .from('action_items')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      alert(`Failed to mark complete: ${error.message}`)
      return
    }
    refetch()
  }

  function handleFormSave() {
    setShowForm(false)
    setEditingItem(null)
    refetch()
  }

  function handleFormCancel() {
    setShowForm(false)
    setEditingItem(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Action Items</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track and manage tasks assigned from meetings.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingItem(null)
            setShowForm(true)
          }}
          className="self-start bg-navy text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-navy-dark sm:self-auto"
        >
          New Action Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          >
            <option value="active">Active</option>
            <option value="all">All</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Assignee
          </label>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value as AssigneeFilter)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          >
            <option value="mine">My Items</option>
            <option value="all">All Items</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading action items...</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No action items found.
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase text-gray-500">
                <th className="pb-3 pr-3 w-8" />
                <th className="pb-3 pr-3">Title</th>
                <th className="pb-3 pr-3">Assignee</th>
                <th className="pb-3 pr-3">Due Date</th>
                <th className="pb-3 pr-3">Priority</th>
                <th className="pb-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item) => {
                const overdue = isOverdue(item)
                return (
                  <tr
                    key={item.id}
                    className="group cursor-pointer hover:bg-gray-50"
                    onClick={() => {
                      setEditingItem(item)
                      setShowForm(true)
                    }}
                  >
                    <td className="py-3 pr-3">
                      <input
                        type="checkbox"
                        checked={item.status === 'completed'}
                        disabled={item.status === 'completed'}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => handleComplete(item.id)}
                        className="h-4 w-4 rounded border-gray-300 text-navy focus:ring-navy"
                      />
                    </td>
                    <td className="py-3 pr-3 text-sm font-medium text-gray-900">
                      {item.title}
                    </td>
                    <td className="py-3 pr-3 text-sm text-gray-600">
                      {item.assignee?.full_name ?? '—'}
                    </td>
                    <td
                      className={`py-3 pr-3 text-sm ${
                        overdue ? 'font-medium text-red-600' : 'text-gray-600'
                      }`}
                    >
                      {item.due_date
                        ? new Date(item.due_date).toLocaleDateString()
                        : '\u2014'}
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                          priorityClasses[item.priority]
                        }`}
                      >
                        {item.priority}
                      </span>
                    </td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                          overdue
                            ? statusClasses.overdue
                            : statusClasses[item.status]
                        }`}
                      >
                        {overdue ? 'overdue' : item.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showForm && (
        <ActionItemForm
          existingItem={editingItem ?? undefined}
          onSave={handleFormSave}
          onCancel={handleFormCancel}
        />
      )}
    </div>
  )
}
