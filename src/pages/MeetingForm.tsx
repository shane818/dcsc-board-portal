import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCommittees } from '../hooks/useCommittees'
import { useMeeting } from '../hooks/useMeeting'
import { supabase } from '../lib/supabase'

export default function MeetingForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEditMode = Boolean(id)

  const { profile, isOfficer } = useAuth()
  const { data: memberships } = useCommittees(profile?.id)
  const { data: existingMeeting, isLoading: meetingLoading } = useMeeting(id)

  const [committeeId, setCommitteeId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [meetingDate, setMeetingDate] = useState('')
  const [location, setLocation] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Populate form when editing
  useEffect(() => {
    if (existingMeeting) {
      setCommitteeId(existingMeeting.committee_id ?? '')
      setTitle(existingMeeting.title)
      setDescription(existingMeeting.description ?? '')
      // Convert ISO date to datetime-local format
      const dt = new Date(existingMeeting.meeting_date)
      const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
      setMeetingDate(local)
      setLocation(existingMeeting.location ?? '')
    }
  }, [existingMeeting])

  // Committees the user can create meetings for
  const availableCommittees = memberships.filter(
    (m) => isOfficer || m.role === 'chair'
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return

    setIsSubmitting(true)
    setError(null)

    try {
      const payload = {
        committee_id: committeeId || null,
        title,
        description: description || null,
        meeting_date: new Date(meetingDate).toISOString(),
        location: location || null,
      }

      if (isEditMode && id) {
        const { data, error: updateError } = await supabase
          .from('meetings')
          .update(payload)
          .eq('id', id)
          .select()
          .single()

        if (updateError) throw updateError
        navigate(`/meetings/${data.id}`)
      } else {
        const { data, error: insertError } = await supabase
          .from('meetings')
          .insert({ ...payload, created_by: profile.id })
          .select()
          .single()

        if (insertError) throw insertError
        navigate(`/meetings/${data.id}`)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isEditMode && meetingLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-navy border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/meetings" className="text-sm text-navy hover:text-navy-dark">
          &larr; Back to Meetings
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          {isEditMode ? 'Edit Meeting' : 'New Meeting'}
        </h1>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 font-medium hover:text-red-900">
            Dismiss
          </button>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Committee */}
          <div>
            <label htmlFor="committee" className="block text-sm font-medium text-gray-700">
              Committee
            </label>
            <select
              id="committee"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              value={committeeId}
              onChange={(e) => setCommitteeId(e.target.value)}
            >
              {isOfficer && <option value="">Full Board</option>}
              {availableCommittees.map((m) => (
                <option key={m.committee.id} value={m.committee.id}>
                  {m.committee.name}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Title
            </label>
            <input
              id="title"
              type="text"
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="description"
              rows={3}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Date & Time */}
          <div>
            <label htmlFor="meeting-date" className="block text-sm font-medium text-gray-700">
              Date &amp; Time
            </label>
            <input
              id="meeting-date"
              type="datetime-local"
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
            />
          </div>

          {/* Location */}
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700">
              Location
            </label>
            <input
              id="location"
              type="text"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : isEditMode ? 'Update Meeting' : 'Create Meeting'}
            </button>
            <Link
              to="/meetings"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
