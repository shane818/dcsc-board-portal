import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useProfiles } from '../hooks/useProfiles'
import { useAuth } from '../context/AuthContext'
import type { ActionItem, ActionItemPriority } from '../types/database'

interface ActionItemFormProps {
  meetingId?: string
  existingItem?: ActionItem
  onSave: () => void
  onCancel: () => void
}

export default function ActionItemForm({
  meetingId,
  existingItem,
  onSave,
  onCancel,
}: ActionItemFormProps) {
  const { profile } = useAuth()
  const { data: profiles } = useProfiles()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<ActionItemPriority>('medium')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (existingItem) {
      setTitle(existingItem.title)
      setDescription(existingItem.description ?? '')
      setAssigneeId(existingItem.assignee_id)
      setDueDate(existingItem.due_date ?? '')
      setPriority(existingItem.priority)
    }
  }, [existingItem])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return

    setIsSubmitting(true)
    setError(null)

    const payload = {
      title,
      description: description || null,
      assignee_id: assigneeId,
      due_date: dueDate || null,
      priority,
    }

    let result
    if (existingItem) {
      result = await supabase
        .from('action_items')
        .update(payload)
        .eq('id', existingItem.id)
    } else {
      result = await supabase.from('action_items').insert({
        ...payload,
        meeting_id: meetingId || null,
        created_by: profile.id,
      })
    }

    if (result.error) {
      setError(result.error.message)
      setIsSubmitting(false)
    } else {
      onSave()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {existingItem ? 'Edit Action Item' : 'New Action Item'}
        </h2>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Assignee <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            >
              <option value="">Select assignee</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as ActionItemPriority)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="border border-gray-300 bg-white rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-navy-dark disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : existingItem ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
