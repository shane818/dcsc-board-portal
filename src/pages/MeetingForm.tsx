import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCommittees } from '../hooks/useCommittees'
import { useAllCommittees } from '../hooks/useAllCommittees'
import { useMeeting } from '../hooks/useMeeting'
import { useDraftMinutes } from '../hooks/useDraftMinutes'
import { supabase } from '../lib/supabase'
import type { MeetingFormat } from '../types/database'

function formatMeetingDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function MeetingForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEditMode = Boolean(id)

  const { profile, isOfficer } = useAuth()
  const { data: memberships } = useCommittees(profile?.id)
  const { data: allCommittees } = useAllCommittees()
  const { data: existingMeeting, isLoading: meetingLoading } = useMeeting(id)
  const { data: draftMinutes } = useDraftMinutes(id)

  const [committeeId, setCommitteeId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [meetingDate, setMeetingDate] = useState('')
  const [location, setLocation] = useState('')
  const [meetingFormat, setMeetingFormat] = useState<MeetingFormat | ''>('')
  const [selectedDraftMinutesIds, setSelectedDraftMinutesIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Populate form when editing
  useEffect(() => {
    if (existingMeeting) {
      setCommitteeId(existingMeeting.committee_id ?? '')
      setTitle(existingMeeting.title)
      setDescription(existingMeeting.description ?? '')
      const dt = new Date(existingMeeting.meeting_date)
      const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
      setMeetingDate(local)
      setLocation(existingMeeting.location ?? '')
      setMeetingFormat(existingMeeting.meeting_format ?? '')
    }
  }, [existingMeeting])

  // Load existing linked draft minutes when editing
  useEffect(() => {
    if (!id) return
    supabase
      .from('meeting_minutes_for_review')
      .select('minutes_id')
      .eq('reviewing_meeting_id', id)
      .then(({ data }) => {
        if (data) setSelectedDraftMinutesIds(data.map((r) => r.minutes_id))
      })
  }, [id])

  // Officers see all active committees; committee chairs see only their own
  const availableCommittees = isOfficer
    ? allCommittees.filter((c) => c.is_active)
    : memberships.filter((m) => m.role === 'chair').map((m) => m.committee)

  function toggleDraftMinutes(minutesId: string) {
    setSelectedDraftMinutesIds((prev) =>
      prev.includes(minutesId) ? prev.filter((x) => x !== minutesId) : [...prev, minutesId]
    )
  }

  async function syncDraftMinutesLinks(meetingId: string) {
    // Get existing links
    const { data: existing } = await supabase
      .from('meeting_minutes_for_review')
      .select('id, minutes_id')
      .eq('reviewing_meeting_id', meetingId)

    const existingMap = new Map((existing ?? []).map((r) => [r.minutes_id, r.id]))
    const selectedSet = new Set(selectedDraftMinutesIds)

    // Delete links no longer selected
    const toDelete = (existing ?? [])
      .filter((r) => !selectedSet.has(r.minutes_id))
      .map((r) => r.id)
    if (toDelete.length > 0) {
      await supabase.from('meeting_minutes_for_review').delete().in('id', toDelete)
    }

    // Insert new links
    const toInsert = selectedDraftMinutesIds
      .filter((mid) => !existingMap.has(mid))
      .map((mid) => ({
        reviewing_meeting_id: meetingId,
        minutes_id: mid,
        added_by: profile?.id ?? null,
      }))
    if (toInsert.length > 0) {
      await supabase.from('meeting_minutes_for_review').insert(toInsert)
    }
  }

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
        meeting_format: meetingFormat || null,
      }

      let meetingId: string

      if (isEditMode && id) {
        const { data, error: updateError } = await supabase
          .from('meetings')
          .update(payload)
          .eq('id', id)
          .select()
          .single()
        if (updateError) throw updateError
        meetingId = data.id
      } else {
        const { data, error: insertError } = await supabase
          .from('meetings')
          .insert({ ...payload, created_by: profile.id })
          .select()
          .single()
        if (insertError) throw insertError
        meetingId = data.id
      }

      await syncDraftMinutesLinks(meetingId)
      navigate(`/meetings/${meetingId}`)
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
              <option value="">Full Board</option>
              {availableCommittees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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

          {/* Format */}
          <div>
            <label htmlFor="meeting-format" className="block text-sm font-medium text-gray-700">
              Format
            </label>
            <select
              id="meeting-format"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              value={meetingFormat}
              onChange={(e) => setMeetingFormat(e.target.value as MeetingFormat | '')}
            >
              <option value="">— Select format —</option>
              <option value="in_person">In-Person</option>
              <option value="virtual">Virtual</option>
              <option value="hybrid">Hybrid</option>
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Appears in the minutes header.
            </p>
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

          {/* Minutes to Review (link drafts from past meetings) */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Minutes to Review
            </label>
            <p className="mt-0.5 text-xs text-gray-400">
              Attach draft minutes from past meetings that will be reviewed and approved at this meeting.
            </p>
            {draftMinutes.length === 0 ? (
              <div className="mt-2 rounded-lg border border-dashed border-gray-300 p-3 text-xs text-gray-400">
                No pending draft minutes from past meetings.
              </div>
            ) : (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                {draftMinutes.map((dm) => (
                  <label
                    key={dm.id}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDraftMinutesIds.includes(dm.id)}
                      onChange={() => toggleDraftMinutes(dm.id)}
                      className="rounded border-gray-300"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {dm.meeting_title}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatMeetingDate(dm.meeting_date)} &middot; draft
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
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
