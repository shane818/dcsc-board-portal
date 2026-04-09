import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import DriveViewer from '../components/DriveViewer'
import AttendanceSection from '../components/meetings/AttendanceSection'
import VotePanel from '../components/meetings/VotePanel'
import { useCommittees } from '../hooks/useCommittees'
import { useMeeting } from '../hooks/useMeeting'
import { useAgendaItems } from '../hooks/useAgendaItems'
import { useAllActionItems } from '../hooks/useActionItems'
import { useMeetingMinutes } from '../hooks/useMeetingMinutes'
import { useProfiles } from '../hooks/useProfiles'
import { useAllProfiles } from '../hooks/useAllProfiles'
import { useMeetingAttendees } from '../hooks/useMeetingAttendees'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import type { AgendaItemStatus, ActionItemPriority, MeetingStatus, Profile, Meeting } from '../types/database'
import { createCalendarEvent } from '../lib/calendar'

const meetingStatusColors: Record<MeetingStatus, string> = {
  scheduled: 'bg-green-100 text-green-800',
  in_progress: 'bg-navy/20 text-navy-dark',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
}

const agendaStatusColors: Record<AgendaItemStatus, string> = {
  pending: 'bg-gray-100 text-gray-800',
  discussed: 'bg-navy/20 text-navy-dark',
  tabled: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
}

const priorityColors: Record<ActionItemPriority, string> = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
}

const actionStatusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-navy/20 text-navy-dark',
  completed: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
}

function formatMeetingDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ---- Google Calendar Modal ----

interface CalendarModalProps {
  meeting: Meeting
  allProfiles: Profile[]
  accessToken: string
  onClose: () => void
  onSuccess: () => void
}

function CalendarModal({ meeting, allProfiles, accessToken, onClose, onSuccess }: CalendarModalProps) {
  const OFFICER_ROLES = new Set(['chair', 'vice_chair', 'secretary', 'treasurer', 'staff'])
  const activeProfiles = allProfiles.filter((p) => p.is_active)

  const defaultSelected = activeProfiles
    .filter((p) => p.is_standard_attendee || OFFICER_ROLES.has(p.role))
    .map((p) => p.id)

  const [selectedIds, setSelectedIds] = useState<string[]>(defaultSelected)
  const [durationHours, setDurationHours] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function handleCreate() {
    if (selectedIds.length === 0) {
      setError('Select at least one attendee.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const start = new Date(meeting.meeting_date)
      const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)
      const attendeeEmails = activeProfiles
        .filter((p) => selectedIds.includes(p.id))
        .map((p) => p.email)

      await createCalendarEvent(
        {
          meetingId: meeting.id,
          title: meeting.title,
          description: meeting.description,
          location: meeting.location,
          startIso: start.toISOString(),
          endIso: end.toISOString(),
          attendeeEmails,
        },
        accessToken
      )
      onSuccess()
    } catch (err) {
      console.error('[CalendarModal] createCalendarEvent failed:', err)
      setError('Failed to create calendar event. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Send to Google Calendar</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Meeting summary */}
          <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-600 space-y-0.5">
            <p className="font-semibold text-gray-900">{meeting.title}</p>
            <p>{formatMeetingDate(meeting.meeting_date)}</p>
            {meeting.location && <p>{meeting.location}</p>}
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Duration
            </label>
            <select
              value={durationHours}
              onChange={(e) => setDurationHours(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
            >
              {[0.5, 1, 1.5, 2, 2.5, 3].map((h) => (
                <option key={h} value={h}>
                  {h === 0.5 ? '30 minutes' : `${h} hour${h !== 1 ? 's' : ''}`}
                </option>
              ))}
            </select>
          </div>

          {/* Attendees */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Invite ({selectedIds.length} selected)
            </label>
            <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-50">
              {activeProfiles.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    className="rounded border-gray-300"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.full_name}</p>
                    <p className="text-xs text-gray-400 truncate">{p.email}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || selectedIds.length === 0}
            className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-40"
          >
            {saving ? 'Creating…' : 'Create Event & Send Invites'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Main page ----

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, isOfficer, session } = useAuth()
  const { data: memberships } = useCommittees(profile?.id)
  const { data: meeting, isLoading: meetingLoading, error: meetingError } = useMeeting(id)
  const { data: agendaItems, isLoading: agendaLoading, refetch: refetchAgenda } = useAgendaItems(id)
  const { data: actionItems, isLoading: actionsLoading, refetch: refetchActions } = useAllActionItems({ meetingId: id })
  const { data: minutes, isLoading: minutesLoading, refetch: refetchMinutes } = useMeetingMinutes(id)
  const { data: profiles } = useProfiles()
  const { data: allProfiles } = useAllProfiles(true)
  const { data: attendees } = useMeetingAttendees(id)

  // Board profiles for attendance + voting (full profile data needed)
  const BOARD_ROLES = new Set(['chair', 'vice_chair', 'secretary', 'treasurer', 'board_member'])
  const boardProfiles = allProfiles.filter((p) => BOARD_ROLES.has(p.role) && p.is_active)

  // Agenda form state
  const [showAgendaForm, setShowAgendaForm] = useState(false)
  const [agendaTitle, setAgendaTitle] = useState('')
  const [agendaDescription, setAgendaDescription] = useState('')
  const [agendaPresenterId, setAgendaPresenterId] = useState('')
  const [agendaDuration, setAgendaDuration] = useState('')
  const [agendaRequiresApproval, setAgendaRequiresApproval] = useState(false)
  const [agendaDriveFileUrl, setAgendaDriveFileUrl] = useState('')
  const [agendaSaving, setAgendaSaving] = useState(false)

  // Action item form state
  const [showActionForm, setShowActionForm] = useState(false)
  const [actionTitle, setActionTitle] = useState('')
  const [actionDescription, setActionDescription] = useState('')
  const [actionAssigneeId, setActionAssigneeId] = useState('')
  const [actionDueDate, setActionDueDate] = useState('')
  const [actionPriority, setActionPriority] = useState<ActionItemPriority>('medium')
  const [actionSaving, setActionSaving] = useState(false)

  // Minutes state
  const [minutesContent, setMinutesContent] = useState('')
  const [minutesDriveUrl, setMinutesDriveUrl] = useState('')
  const [minutesSaving, setMinutesSaving] = useState(false)
  const [minutesInitialized, setMinutesInitialized] = useState(false)
  const [minutesViewerUrl, setMinutesViewerUrl] = useState<string | null>(null)

  // General error state
  const [sectionError, setSectionError] = useState<string | null>(null)

  // Calendar modal state
  const [showCalendarModal, setShowCalendarModal] = useState(false)

  // Initialize minutes content from fetched data
  if (minutes && !minutesInitialized) {
    setMinutesContent(minutes.content ?? '')
    setMinutesDriveUrl(minutes.drive_file_url ?? '')
    setMinutesInitialized(true)
  }

  const canEdit =
    isOfficer || (meeting && profile && meeting.created_by === profile.id)

  const isChairOfMeetingCommittee =
    meeting?.committee_id &&
    memberships.some(
      (m) => m.committee_id === meeting.committee_id && m.role === 'chair'
    )

  const canManageMinutes = isOfficer || isChairOfMeetingCommittee

  // ---- Delete meeting ----

  async function handleDeleteMeeting() {
    if (!id) return
    if (!window.confirm('Delete this meeting? This cannot be undone — all agenda items, action items, and minutes will be permanently removed.')) return
    setSectionError(null)
    try {
      const { error } = await supabase.from('meetings').delete().eq('id', id)
      if (error) throw error
      navigate('/meetings')
    } catch (err) {
      setSectionError((err as Error).message)
    }
  }

  // ---- Status mutations ----

  async function updateMeetingStatus(status: MeetingStatus) {
    if (!id) return
    setSectionError(null)
    try {
      const { error } = await supabase.from('meetings').update({ status }).eq('id', id)
      if (error) throw error
      window.location.reload()
    } catch (err) {
      setSectionError((err as Error).message)
    }
  }

  // ---- Agenda mutations ----

  async function handleAddAgendaItem() {
    if (!id) return
    setAgendaSaving(true)
    setSectionError(null)
    try {
      const { error } = await supabase.from('agenda_items').insert({
        meeting_id: id,
        title: agendaTitle,
        description: agendaDescription || null,
        presenter_id: agendaPresenterId || null,
        order_position: agendaItems.length + 1,
        duration_minutes: agendaDuration ? parseInt(agendaDuration, 10) : null,
        requires_approval: agendaRequiresApproval,
        drive_file_url: agendaDriveFileUrl.trim() || null,
      })
      if (error) throw error
      setAgendaTitle('')
      setAgendaDescription('')
      setAgendaPresenterId('')
      setAgendaDuration('')
      setAgendaRequiresApproval(false)
      setAgendaDriveFileUrl('')
      setShowAgendaForm(false)
      refetchAgenda()
    } catch (err) {
      setSectionError((err as Error).message)
    } finally {
      setAgendaSaving(false)
    }
  }

  async function updateAgendaStatus(itemId: string, status: AgendaItemStatus) {
    setSectionError(null)
    try {
      const { error } = await supabase
        .from('agenda_items')
        .update({ status })
        .eq('id', itemId)
      if (error) throw error
      refetchAgenda()
    } catch (err) {
      setSectionError((err as Error).message)
    }
  }

  // ---- Action item mutations ----

  async function handleAddActionItem() {
    if (!id || !profile) return
    setActionSaving(true)
    setSectionError(null)
    try {
      const { error } = await supabase.from('action_items').insert({
        meeting_id: id,
        title: actionTitle,
        description: actionDescription || null,
        assignee_id: actionAssigneeId,
        due_date: actionDueDate || null,
        priority: actionPriority,
        created_by: profile.id,
      })
      if (error) throw error
      setActionTitle('')
      setActionDescription('')
      setActionAssigneeId('')
      setActionDueDate('')
      setActionPriority('medium')
      setShowActionForm(false)
      refetchActions()
    } catch (err) {
      setSectionError((err as Error).message)
    } finally {
      setActionSaving(false)
    }
  }

  async function toggleActionComplete(itemId: string, currentStatus: string) {
    setSectionError(null)
    try {
      const updates =
        currentStatus === 'completed'
          ? { status: 'pending' as const, completed_at: null }
          : { status: 'completed' as const, completed_at: new Date().toISOString() }
      const { error } = await supabase.from('action_items').update(updates).eq('id', itemId)
      if (error) throw error
      refetchActions()
    } catch (err) {
      setSectionError((err as Error).message)
    }
  }

  // ---- Minutes mutations ----

  async function handleDraftMinutes() {
    if (!id || !profile) return
    setMinutesSaving(true)
    setSectionError(null)
    try {
      const { error } = await supabase.from('meeting_minutes').insert({
        meeting_id: id,
        drafted_by: profile.id,
      })
      if (error) throw error
      setMinutesInitialized(false)
      refetchMinutes()
    } catch (err) {
      setSectionError((err as Error).message)
    } finally {
      setMinutesSaving(false)
    }
  }

  async function handleSaveMinutesDraft() {
    if (!minutes) return
    setMinutesSaving(true)
    setSectionError(null)
    try {
      const { error } = await supabase
        .from('meeting_minutes')
        .update({ content: minutesContent, drive_file_url: minutesDriveUrl || null })
        .eq('id', minutes.id)
      if (error) throw error
      refetchMinutes()
    } catch (err) {
      setSectionError((err as Error).message)
    } finally {
      setMinutesSaving(false)
    }
  }

  async function handleApproveMinutes() {
    if (!minutes || !profile) return
    setMinutesSaving(true)
    setSectionError(null)
    try {
      const { error } = await supabase
        .from('meeting_minutes')
        .update({
          status: 'approved',
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', minutes.id)
      if (error) throw error
      setMinutesInitialized(false)
      refetchMinutes()
    } catch (err) {
      setSectionError((err as Error).message)
    } finally {
      setMinutesSaving(false)
    }
  }

  async function handleRevertMinutesToDraft() {
    if (!minutes) return
    setMinutesSaving(true)
    setSectionError(null)
    try {
      const { error } = await supabase
        .from('meeting_minutes')
        .update({
          status: 'draft',
          approved_by: null,
          approved_at: null,
        })
        .eq('id', minutes.id)
      if (error) throw error
      setMinutesInitialized(false)
      refetchMinutes()
    } catch (err) {
      setSectionError((err as Error).message)
    } finally {
      setMinutesSaving(false)
    }
  }

  // ---- Loading / error ----

  if (meetingLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-navy border-t-transparent" />
      </div>
    )
  }

  if (meetingError || !meeting) {
    return (
      <div className="space-y-4">
        <Link to="/meetings" className="text-sm text-navy hover:text-navy-dark">
          &larr; Back to Meetings
        </Link>
        <div className="p-12 text-center text-sm text-red-500">
          {meetingError ?? 'Meeting not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Section error banner */}
      {sectionError && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{sectionError}</span>
          <button onClick={() => setSectionError(null)} className="ml-4 font-medium hover:text-red-900">
            Dismiss
          </button>
        </div>
      )}

      {/* Meeting Header */}
      <div>
        <Link to="/meetings" className="text-sm text-navy hover:text-navy-dark">
          &larr; Back to Meetings
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {formatMeetingDate(meeting.meeting_date)}
              {meeting.location && <> &middot; {meeting.location}</>}
              {' '}&middot; {meeting.committee?.name ?? 'Full Board'}
            </p>
            {meeting.description && (
              <p className="mt-2 text-sm text-gray-600">{meeting.description}</p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${meetingStatusColors[meeting.status]}`}
          >
            {meeting.status.replace('_', ' ')}
          </span>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          {canEdit && (
            <Link
              to={`/meetings/${id}/edit`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Edit
            </Link>
          )}
          {meeting.status === 'scheduled' && canEdit && (
            <button
              onClick={() => updateMeetingStatus('in_progress')}
              className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark"
            >
              Start Meeting
            </button>
          )}
          {meeting.status === 'in_progress' && canEdit && (
            <button
              onClick={() => updateMeetingStatus('completed')}
              className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark"
            >
              End Meeting
            </button>
          )}
          {(meeting.status === 'scheduled' || meeting.status === 'in_progress') && canEdit && (
            <button
              onClick={() => updateMeetingStatus('cancelled')}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Cancel
            </button>
          )}
          {canEdit && (
            <button
              onClick={handleDeleteMeeting}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          )}
          {/* Google Calendar */}
          {canEdit && (
            meeting.gcal_event_id ? (
              <a
                href={meeting.gcal_event_link ?? 'https://calendar.google.com/'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                📅 View in Calendar ↗
              </a>
            ) : (
              <button
                onClick={() => setShowCalendarModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                📅 Send to Calendar
              </button>
            )
          )}
        </div>
      </div>

      {/* Attendance */}
      <AttendanceSection
        meetingId={id!}
        profiles={allProfiles}
        canEdit={!!canEdit}
      />

      {/* Agenda Items */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Agenda</h2>
          {!showAgendaForm && (
            <button
              onClick={() => setShowAgendaForm(true)}
              className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark"
            >
              Add Item
            </button>
          )}
        </div>

        {/* Inline agenda form */}
        {showAgendaForm && (
          <div className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Title</label>
              <input
                type="text"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                value={agendaTitle}
                onChange={(e) => setAgendaTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                rows={2}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                value={agendaDescription}
                onChange={(e) => setAgendaDescription(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">Presenter</label>
                <select
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                  value={agendaPresenterId}
                  onChange={(e) => setAgendaPresenterId(e.target.value)}
                >
                  <option value="">None</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:w-32">
                <label className="block text-sm font-medium text-gray-700">Duration (min)</label>
                <input
                  type="number"
                  min={1}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                  value={agendaDuration}
                  onChange={(e) => setAgendaDuration(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Link a Drive file (optional)</label>
              <input
                type="url"
                placeholder="https://drive.google.com/..."
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                value={agendaDriveFileUrl}
                onChange={(e) => setAgendaDriveFileUrl(e.target.value)}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={agendaRequiresApproval}
                onChange={(e) => setAgendaRequiresApproval(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-navy focus:ring-navy"
              />
              <span className="font-medium text-gray-700">Requires board approval</span>
            </label>
            <div className="flex gap-3">
              <button
                onClick={handleAddAgendaItem}
                disabled={!agendaTitle || agendaSaving}
                className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
              >
                {agendaSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setShowAgendaForm(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Agenda list */}
        {agendaLoading ? (
          <div className="mt-4 flex justify-center">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-navy border-t-transparent" />
          </div>
        ) : agendaItems.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">No agenda items yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {agendaItems.map((item) => (
              <li key={item.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {item.order_position}. {item.title}
                      </span>
                      {item.requires_approval && (
                        <span className="rounded-full bg-dcsc-red/10 px-2 py-0.5 text-xs font-semibold text-dcsc-red">
                          Board Vote Required
                        </span>
                      )}
                      {item.drive_file_url && (
                        <a
                          href={item.drive_file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-navy hover:text-navy-dark"
                          title="View linked file"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          File
                        </a>
                      )}
                    </div>
                    {item.presenter && (
                      <span className="text-sm text-gray-500">
                        &mdash; {item.presenter.full_name}
                      </span>
                    )}
                    {item.duration_minutes ? (
                      <span className="ml-2 text-sm text-gray-400">{item.duration_minutes}min</span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <select
                      className="rounded-lg border border-gray-300 px-2 py-1 text-xs shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                      value={item.status}
                      onChange={(e) =>
                        updateAgendaStatus(item.id, e.target.value as AgendaItemStatus)
                      }
                    >
                      <option value="pending">Pending</option>
                      <option value="discussed">Discussed</option>
                      <option value="tabled">Tabled</option>
                      <option value="approved">Approved</option>
                    </select>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${agendaStatusColors[item.status]}`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
                {item.requires_approval && profile && (
                  <VotePanel
                    agendaItemId={item.id}
                    attendees={attendees}
                    boardProfiles={boardProfiles}
                    currentProfileId={profile.id}
                    canEdit={!!canEdit}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Action Items */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Action Items</h2>
          {!showActionForm && (
            <button
              onClick={() => setShowActionForm(true)}
              className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark"
            >
              Add Action Item
            </button>
          )}
        </div>

        {/* Inline action item form */}
        {showActionForm && (
          <div className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Title</label>
              <input
                type="text"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                value={actionTitle}
                onChange={(e) => setActionTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                rows={2}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                value={actionDescription}
                onChange={(e) => setActionDescription(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">Assignee</label>
                <select
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                  value={actionAssigneeId}
                  onChange={(e) => setActionAssigneeId(e.target.value)}
                >
                  <option value="">Select assignee...</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:w-44">
                <label className="block text-sm font-medium text-gray-700">Due Date</label>
                <input
                  type="date"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                  value={actionDueDate}
                  onChange={(e) => setActionDueDate(e.target.value)}
                />
              </div>
              <div className="sm:w-32">
                <label className="block text-sm font-medium text-gray-700">Priority</label>
                <select
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                  value={actionPriority}
                  onChange={(e) => setActionPriority(e.target.value as ActionItemPriority)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleAddActionItem}
                disabled={!actionTitle || !actionAssigneeId || actionSaving}
                className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
              >
                {actionSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setShowActionForm(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Action items list */}
        {actionsLoading ? (
          <div className="mt-4 flex justify-center">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-navy border-t-transparent" />
          </div>
        ) : actionItems.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">No action items yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {actionItems.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <input
                  type="checkbox"
                  checked={item.status === 'completed'}
                  onChange={() => toggleActionComplete(item.id, item.status)}
                  className="h-4 w-4 rounded border-gray-300 text-navy focus:ring-navy"
                />
                <div className="min-w-0 flex-1">
                  <span
                    className={`text-sm font-medium ${
                      item.status === 'completed'
                        ? 'text-gray-400 line-through'
                        : 'text-gray-900'
                    }`}
                  >
                    {item.title}
                  </span>
                  <span className="ml-2 text-sm text-gray-500">
                    &mdash; {item.assignee.full_name}
                  </span>
                  {item.due_date && (
                    <span className="ml-2 text-sm text-gray-400">
                      Due {formatDate(item.due_date)}
                    </span>
                  )}
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${priorityColors[item.priority]}`}
                >
                  {item.priority}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${actionStatusColors[item.status]}`}
                >
                  {item.status.replace('_', ' ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Meeting Minutes */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Meeting Minutes</h2>

        {minutesLoading ? (
          <div className="mt-4 flex justify-center">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-navy border-t-transparent" />
          </div>
        ) : !minutes ? (
          // No minutes exist
          canManageMinutes ? (
            <div className="mt-4">
              <button
                onClick={handleDraftMinutes}
                disabled={minutesSaving}
                className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
              >
                {minutesSaving ? 'Creating...' : 'Draft Minutes'}
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-400">No minutes have been drafted yet.</p>
          )
        ) : minutes.status === 'draft' ? (
          // Draft mode
          <div className="mt-4 space-y-4">
            <p className="text-sm text-gray-500">
              Drafted by {minutes.drafter.full_name}
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700">Content</label>
              <textarea
                rows={10}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                value={minutesContent}
                onChange={(e) => setMinutesContent(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Google Drive URL (optional)
              </label>
              <input
                type="text"
                placeholder="https://docs.google.com/..."
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                value={minutesDriveUrl}
                onChange={(e) => setMinutesDriveUrl(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSaveMinutesDraft}
                disabled={minutesSaving}
                className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
              >
                {minutesSaving ? 'Saving...' : 'Save Draft'}
              </button>
              {isOfficer && (
                <button
                  onClick={handleApproveMinutes}
                  disabled={minutesSaving}
                  className="rounded-lg border border-green-600 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                >
                  Approve Minutes
                </button>
              )}
            </div>
          </div>
        ) : (
          // Approved mode
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                Approved by {minutes.approver?.full_name ?? 'Unknown'} on{' '}
                {minutes.approved_at ? formatDate(minutes.approved_at) : ''}
              </span>
            </div>
            <div className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
              {minutes.content || 'No content.'}
            </div>
            {minutes.drive_file_url && (
              <button
                onClick={() => setMinutesViewerUrl(minutes.drive_file_url!)}
                className="text-sm font-medium text-navy hover:text-navy-dark"
              >
                View in Google Drive &rarr;
              </button>
            )}
            {isOfficer && (
              <div>
                <button
                  onClick={handleRevertMinutesToDraft}
                  disabled={minutesSaving}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Revert to Draft
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {minutesViewerUrl && (
        <DriveViewer
          url={minutesViewerUrl}
          title="Meeting Minutes"
          onClose={() => setMinutesViewerUrl(null)}
        />
      )}

      {/* Google Calendar Modal */}
      {showCalendarModal && isOfficer && session && meeting && (
        <CalendarModal
          meeting={meeting}
          allProfiles={allProfiles}
          accessToken={session.access_token}
          onClose={() => setShowCalendarModal(false)}
          onSuccess={() => {
            setShowCalendarModal(false)
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}
