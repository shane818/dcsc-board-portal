import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCommittees } from '../hooks/useCommittees'
import type { AnnouncementAudience } from '../types/database'

export default function AnnouncementForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit')

  const { profile } = useAuth()
  const { data: memberships } = useCommittees(profile?.id)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<AnnouncementAudience>('all_board')
  const [committeeId, setCommitteeId] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Fetch existing announcement if editing
  useEffect(() => {
    if (!editId) return
    setIsEditing(true)
    supabase
      .from('announcements')
      .select('*')
      .eq('id', editId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('[AnnouncementForm] fetch failed:', error)
          setError('Failed to load announcement. Please try again.')
          return
        }
        if (data) {
          setTitle(data.title)
          setBody(data.body)
          setAudience(data.target_audience as AnnouncementAudience)
          setCommitteeId(data.target_committee_id ?? '')
          setIsPinned(data.is_pinned)
          setExpiresAt(data.expires_at ? data.expires_at.split('T')[0] : '')
        }
      })
  }, [editId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return

    setIsSubmitting(true)
    setError(null)

    const payload = {
      title,
      body,
      target_audience: audience,
      target_committee_id: audience === 'committee' ? committeeId : null,
      is_pinned: isPinned,
      expires_at: expiresAt || null,
    }

    let result
    if (isEditing && editId) {
      result = await supabase
        .from('announcements')
        .update(payload)
        .eq('id', editId)
    } else {
      result = await supabase.from('announcements').insert({
        ...payload,
        author_id: profile.id,
      })
    }

    if (result.error) {
      console.error('[AnnouncementForm] save failed:', result.error)
      setError('Failed to save announcement. Please try again.')
      setIsSubmitting(false)
    } else {
      navigate('/announcements')
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/announcements"
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; Back to Announcements
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">
        {isEditing ? 'Edit Announcement' : 'New Announcement'}
      </h1>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
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
              Body <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Target Audience
            </label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            >
              <option value="all_board">All Board Members</option>
              <option value="committee">Specific Committee</option>
              <option value="executives">Executives Only</option>
            </select>
          </div>

          {audience === 'committee' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Target Committee
              </label>
              <select
                required
                value={committeeId}
                onChange={(e) => setCommitteeId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              >
                <option value="">Select committee</option>
                {memberships.map((m) => (
                  <option key={m.committee.id} value={m.committee.id}>
                    {m.committee.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPinned"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-navy focus:ring-navy"
            />
            <label htmlFor="isPinned" className="text-sm text-gray-700">
              Pin this announcement
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Expires on
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Link
              to="/announcements"
              className="border border-gray-300 bg-white rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 inline-block"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-navy-dark disabled:opacity-50"
            >
              {isSubmitting
                ? 'Saving...'
                : isEditing
                  ? 'Update Announcement'
                  : 'Publish Announcement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
