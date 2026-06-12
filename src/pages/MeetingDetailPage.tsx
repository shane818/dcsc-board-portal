import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import DriveViewer from '../components/DriveViewer'
import AttendanceSection from '../components/meetings/AttendanceSection'
import PendingMinutesSection from '../components/meetings/PendingMinutesSection'
import MeetingMaterialsSection from '../components/meetings/MeetingMaterialsSection'
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
import { buildMinutesTemplate } from '../lib/minutesTemplate'
import { archiveMinutes } from '../lib/archiveMinutes'
import { buildMeetingSummary } from '../lib/meetingSummary'
import { findApprovedMinutesFolderId } from '../lib/approvedMinutesFolder'
import { downloadBlob, downloadDoc, openPrintWindow, safeFilename } from '../lib/download'
import NotesEditor, { sanitizeHtml } from '../components/meetings/NotesEditor'
import { useMeetingNotes } from '../hooks/useMeetingNotes'
import { useNavigate } from 'react-router-dom'
import type { AgendaItemStatus, ActionItemPriority, MeetingStatus } from '../types/database'

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

// ---- Google Calendar URL builder ----

/** Build a Google Calendar "create event" URL pre-filled with meeting details.
 *  Opens in a new tab — user creates the event from their own Google account. */
function buildGoogleCalendarUrl(
  title: string,
  meetingDate: string,
  durationHours: number,
  location: string | null,
  description: string | null,
  attendeeEmails: string[]
): string {
  const start = new Date(meetingDate)
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)

  // Google Calendar expects: YYYYMMDDTHHmmssZ
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
  })

  if (location) params.set('location', location)
  if (description) params.set('details', description)
  if (attendeeEmails.length > 0) params.set('add', attendeeEmails.join(','))

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

// ---- Main page ----

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, isOfficer, session } = useAuth()
  const { data: memberships } = useCommittees(profile?.id)
  const { data: meeting, isLoading: meetingLoading, error: meetingError, refetch: refetchMeeting } = useMeeting(id)
  const { data: agendaItems, isLoading: agendaLoading, refetch: refetchAgenda } = useAgendaItems(id)
  const { data: actionItems, isLoading: actionsLoading, refetch: refetchActions } = useAllActionItems({ meetingId: id })
  const { data: minutes, isLoading: minutesLoading, refetch: refetchMinutes } = useMeetingMinutes(id)
  const { data: notes, isLoading: notesLoading, refetch: refetchNotes } = useMeetingNotes(id)
  const { data: profiles } = useProfiles()
  const { data: allProfiles } = useAllProfiles(true)
  const { data: attendees } = useMeetingAttendees(id)

  // Board profiles for attendance + voting (full profile data needed)
  const BOARD_ROLES = new Set(['chair', 'vice_chair', 'secretary', 'treasurer', 'board_member'])
  const boardProfiles = allProfiles.filter((p) => BOARD_ROLES.has(p.role) && p.is_active)

  // Live refresh: when anyone changes agenda/action items for this meeting,
  // refetch so all viewers stay current (shrinks the concurrent-edit window).
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`meeting:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agenda_items', filter: `meeting_id=eq.${id}` },
        () => refetchAgenda()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'action_items', filter: `meeting_id=eq.${id}` },
        () => refetchActions()
      )
      .subscribe()
    return () => {
      channel.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Agenda form state
  const [showAgendaForm, setShowAgendaForm] = useState(false)
  const [editingAgendaId, setEditingAgendaId] = useState<string | null>(null)
  // Timestamp of the item when the edit form was opened (optimistic concurrency)
  const [editingAgendaUpdatedAt, setEditingAgendaUpdatedAt] = useState<string | null>(null)
  const [agendaTitle, setAgendaTitle] = useState('')
  const [agendaDescription, setAgendaDescription] = useState('')
  // Multiple presenters: each is either a member (profile_id) or a guest (guest_name)
  const [agendaPresenters, setAgendaPresenters] = useState<
    { profile_id?: string; guest_name?: string }[]
  >([])
  const [agendaDuration, setAgendaDuration] = useState('')
  const [agendaRequiresApproval, setAgendaRequiresApproval] = useState(false)
  const [agendaRequiresCommitteeApproval, setAgendaRequiresCommitteeApproval] = useState(false)
  const [agendaDriveFileUrl, setAgendaDriveFileUrl] = useState('')
  const [agendaSaving, setAgendaSaving] = useState(false)

  // Action item form state
  const [showActionForm, setShowActionForm] = useState(false)
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [editingActionUpdatedAt, setEditingActionUpdatedAt] = useState<string | null>(null)
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
  // Minute-taker assignment control
  const [showAssignMinuteTaker, setShowAssignMinuteTaker] = useState(false)
  const [assigningMinuteTaker, setAssigningMinuteTaker] = useState(false)

  // Notes state
  const [notesHtml, setNotesHtml] = useState('')
  const [notesInitialized, setNotesInitialized] = useState(false)
  const [notesSaving, setNotesSaving] = useState(false)

  // General error state
  const [sectionError, setSectionError] = useState<string | null>(null)

  // Agenda summary email modal
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const [summaryCopied, setSummaryCopied] = useState(false)

  // (Calendar handled via direct Google Calendar URL — no modal state needed)

  // Initialize minutes content from fetched data
  if (minutes && !minutesInitialized) {
    setMinutesContent(minutes.content ?? '')
    setMinutesDriveUrl(minutes.drive_file_url ?? '')
    setMinutesInitialized(true)
  }

  if (!notesLoading && !notesInitialized) {
    setNotesHtml(notes?.content_html ?? '')
    setNotesInitialized(true)
  }

  const canEdit =
    isOfficer || (meeting && profile && meeting.created_by === profile.id)

  const isChairOfMeetingCommittee =
    meeting?.committee_id &&
    memberships.some(
      (m) => m.committee_id === meeting.committee_id && m.role === 'chair'
    )

  const canManageMinutes = isOfficer || isChairOfMeetingCommittee

  // Who may EDIT the draft minutes: board Chair or admin (override), or the
  // designated minute-taker for this meeting. Mirrors can_edit_minutes() in SQL.
  const isChairOrAdmin = !!profile && (profile.role === 'chair' || profile.is_admin === true)
  const canEditMinutes =
    isChairOrAdmin || (!!profile && !!meeting && meeting.minute_taker_id === profile.id)
  // Officers can (re)assign the minute-taker
  const canAssignMinuteTaker = isOfficer

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
      // When marking as completed, capture the adjournment timestamp (if not already set).
      // When reopening (scheduled), clear it so it gets re-captured at next End.
      const updates: Record<string, unknown> = { status }
      if (status === 'completed' && !meeting?.adjourned_at) {
        updates.adjourned_at = new Date().toISOString()
      } else if (status === 'scheduled') {
        updates.adjourned_at = null
      }
      const { error } = await supabase.from('meetings').update(updates).eq('id', id)
      if (error) throw error
      window.location.reload()
    } catch (err) {
      setSectionError((err as Error).message)
    }
  }

  // ---- Agenda mutations ----

  function resetAgendaForm() {
    setEditingAgendaId(null)
    setEditingAgendaUpdatedAt(null)
    setAgendaTitle('')
    setAgendaDescription('')
    setAgendaPresenters([])
    setAgendaDuration('')
    setAgendaRequiresApproval(false)
    setAgendaRequiresCommitteeApproval(false)
    setAgendaDriveFileUrl('')
    setShowAgendaForm(false)
  }

  function startEditAgendaItem(item: typeof agendaItems[number]) {
    setEditingAgendaId(item.id)
    setEditingAgendaUpdatedAt(item.updated_at)
    setAgendaTitle(item.title)
    setAgendaDescription(item.description ?? '')
    setAgendaPresenters(
      (item.presenters ?? []).map((p) =>
        p.profile_id ? { profile_id: p.profile_id } : { guest_name: p.guest_name ?? '' }
      )
    )
    setAgendaDuration(item.duration_minutes?.toString() ?? '')
    setAgendaRequiresApproval(item.requires_approval)
    setAgendaRequiresCommitteeApproval(item.requires_committee_approval)
    setAgendaDriveFileUrl(item.drive_file_url ?? '')
    setShowAgendaForm(true)
  }

  // ---- Presenter editor helpers ----
  function addPresenterMember() {
    setAgendaPresenters((prev) => [...prev, { profile_id: '' }])
  }
  function addPresenterGuest() {
    setAgendaPresenters((prev) => [...prev, { guest_name: '' }])
  }
  function updatePresenter(idx: number, value: { profile_id?: string; guest_name?: string }) {
    setAgendaPresenters((prev) => prev.map((p, i) => (i === idx ? value : p)))
  }
  function removePresenter(idx: number) {
    setAgendaPresenters((prev) => prev.filter((_, i) => i !== idx))
  }

  /** Replace all presenter rows for an agenda item (delete-then-insert). */
  async function savePresenters(agendaItemId: string) {
    await supabase.from('agenda_item_presenters').delete().eq('agenda_item_id', agendaItemId)
    const rows = agendaPresenters
      .map((p, i) => {
        const profileId = p.profile_id?.trim()
        const guestName = p.guest_name?.trim()
        if (profileId) return { agenda_item_id: agendaItemId, profile_id: profileId, order_position: i }
        if (guestName) return { agenda_item_id: agendaItemId, guest_name: guestName, order_position: i }
        return null
      })
      .filter(Boolean) as { agenda_item_id: string; profile_id?: string; guest_name?: string; order_position: number }[]
    if (rows.length > 0) {
      await supabase.from('agenda_item_presenters').insert(rows)
    }
  }

  async function handleSaveAgendaItem() {
    if (!id) return
    setAgendaSaving(true)
    setSectionError(null)
    try {
      // Keep legacy presenter_id in sync with the first member presenter (back-compat)
      const firstMemberId =
        agendaPresenters.find((p) => p.profile_id?.trim())?.profile_id?.trim() ?? null

      const payload = {
        title: agendaTitle,
        description: agendaDescription || null,
        presenter_id: firstMemberId,
        duration_minutes: agendaDuration ? parseInt(agendaDuration, 10) : null,
        requires_approval: agendaRequiresApproval,
        requires_committee_approval: agendaRequiresCommitteeApproval,
        drive_file_url: agendaDriveFileUrl.trim() || null,
      }

      let agendaItemId: string
      if (editingAgendaId) {
        // Optimistic concurrency: only update if the row hasn't changed since we loaded it
        let query = supabase.from('agenda_items').update(payload).eq('id', editingAgendaId)
        if (editingAgendaUpdatedAt) query = query.eq('updated_at', editingAgendaUpdatedAt)
        const { data, error } = await query.select('id')
        if (error) throw error
        if (!data || data.length === 0) {
          // Someone else changed this item first — refresh and warn, don't overwrite
          resetAgendaForm()
          refetchAgenda()
          setSectionError(
            'This agenda item was just changed by someone else — your edit was not saved. The latest version is now shown; please re-apply your change.'
          )
          return
        }
        agendaItemId = data[0].id
      } else {
        const { data, error } = await supabase
          .from('agenda_items')
          .insert({ ...payload, meeting_id: id, order_position: agendaItems.length + 1 })
          .select('id')
          .single()
        if (error) throw error
        agendaItemId = data.id
      }

      await savePresenters(agendaItemId)
      resetAgendaForm()
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

  async function moveAgendaItem(itemId: string, direction: 'up' | 'down') {
    const sorted = [...agendaItems].sort((a, b) => a.order_position - b.order_position)
    const idx = sorted.findIndex((i) => i.id === itemId)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return

    const item = sorted[idx]
    const swap = sorted[swapIdx]
    setSectionError(null)
    try {
      // Swap order_positions between the two items
      const { error: e1 } = await supabase
        .from('agenda_items')
        .update({ order_position: swap.order_position })
        .eq('id', item.id)
      const { error: e2 } = await supabase
        .from('agenda_items')
        .update({ order_position: item.order_position })
        .eq('id', swap.id)
      if (e1 || e2) throw e1 ?? e2
      refetchAgenda()
    } catch (err) {
      setSectionError((err as Error).message)
    }
  }

  // ---- Action item mutations ----

  function resetActionForm() {
    setEditingActionId(null)
    setActionTitle('')
    setActionDescription('')
    setActionAssigneeId('')
    setActionDueDate('')
    setActionPriority('medium')
    setEditingActionUpdatedAt(null)
    setShowActionForm(false)
  }

  function startEditActionItem(item: {
    id: string
    title: string
    description: string | null
    assignee_id: string
    due_date: string | null
    priority: ActionItemPriority
    updated_at: string
  }) {
    setEditingActionId(item.id)
    setEditingActionUpdatedAt(item.updated_at)
    setActionTitle(item.title)
    setActionDescription(item.description ?? '')
    setActionAssigneeId(item.assignee_id)
    setActionDueDate(item.due_date ?? '')
    setActionPriority(item.priority)
    setShowActionForm(true)
  }

  async function handleSaveActionItem() {
    if (!id || !profile) return
    setActionSaving(true)
    setSectionError(null)
    try {
      if (editingActionId) {
        // Optimistic concurrency: only update if the row hasn't changed since we loaded it
        let query = supabase
          .from('action_items')
          .update({
            title: actionTitle,
            description: actionDescription || null,
            assignee_id: actionAssigneeId,
            due_date: actionDueDate || null,
            priority: actionPriority,
          })
          .eq('id', editingActionId)
        if (editingActionUpdatedAt) query = query.eq('updated_at', editingActionUpdatedAt)
        const { data, error } = await query.select('id')
        if (error) throw error
        if (!data || data.length === 0) {
          resetActionForm()
          refetchActions()
          setSectionError(
            'This action item was just changed by someone else — your edit was not saved. The latest version is now shown; please re-apply your change.'
          )
          return
        }
      } else {
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
      }
      resetActionForm()
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
      // Auto-designate the drafter as minute-taker if none is set yet, so they
      // retain edit access under the new minute-taker lock.
      if (meeting && !meeting.minute_taker_id) {
        await supabase.from('meetings').update({ minute_taker_id: profile.id }).eq('id', id)
        refetchMeeting()
      }
      setMinutesInitialized(false)
      refetchMinutes()
    } catch (err) {
      setSectionError((err as Error).message)
    } finally {
      setMinutesSaving(false)
    }
  }

  async function handleAssignMinuteTaker(profileId: string) {
    if (!id) return
    setAssigningMinuteTaker(true)
    setSectionError(null)
    try {
      const { error } = await supabase
        .from('meetings')
        .update({ minute_taker_id: profileId || null })
        .eq('id', id)
      if (error) throw error
      setShowAssignMinuteTaker(false)
      refetchMeeting()
    } catch (err) {
      setSectionError((err as Error).message)
    } finally {
      setAssigningMinuteTaker(false)
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

  async function handleGenerateTemplate() {
    if (!id) return
    if (minutesContent.trim().length > 0) {
      if (
        !window.confirm(
          'This will replace the current draft content with a generated template. Continue?'
        )
      ) {
        return
      }
    }
    setMinutesSaving(true)
    setSectionError(null)
    try {
      const template = await buildMinutesTemplate(id)
      setMinutesContent(template)
    } catch (err) {
      setSectionError((err as Error).message)
    } finally {
      setMinutesSaving(false)
    }
  }

  function handleDownloadDraft() {
    if (!meeting) return
    const dateLabel = new Date(meeting.meeting_date).toISOString().slice(0, 10)
    const filename = `${dateLabel} - ${safeFilename(meeting.title)} (draft).md`
    downloadBlob(filename, minutesContent || '# Empty draft', 'text/markdown;charset=utf-8')
  }

  // ---- Notes ----

  async function handleSaveNotes() {
    if (!id || !profile) return
    setNotesSaving(true)
    setSectionError(null)
    try {
      const { error } = await supabase
        .from('meeting_notes')
        .upsert(
          { meeting_id: id, content_html: sanitizeHtml(notesHtml), updated_by: profile.id },
          { onConflict: 'meeting_id' }
        )
      if (error) throw error
      refetchNotes()
    } catch (err) {
      setSectionError((err as Error).message)
    } finally {
      setNotesSaving(false)
    }
  }

  function notesDocTitle(): string {
    if (!meeting) return 'Meeting Notes'
    const dateLabel = new Date(meeting.meeting_date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    return `${meeting.title} — Notes (${dateLabel})`
  }

  function handleDownloadNotesDoc() {
    if (!meeting) return
    const dateLabel = new Date(meeting.meeting_date).toISOString().slice(0, 10)
    const filename = `${dateLabel} - ${safeFilename(meeting.title)} - Notes.doc`
    const body = `<h1>${notesDocTitle()}</h1>${sanitizeHtml(notesHtml) || '<p>(No notes)</p>'}`
    downloadDoc(filename, notesDocTitle(), body)
  }

  function handleDownloadNotesPdf() {
    const body = `<h1>${notesDocTitle()}</h1>${sanitizeHtml(notesHtml) || '<p>(No notes)</p>'}`
    openPrintWindow(notesDocTitle(), body)
  }

  function handleGenerateSummary() {
    if (!meeting) return
    setSummaryText(buildMeetingSummary(meeting, agendaItems))
    setSummaryCopied(false)
    setShowSummaryModal(true)
  }

  async function handleCopySummary() {
    try {
      await navigator.clipboard.writeText(summaryText)
      setSummaryCopied(true)
      setTimeout(() => setSummaryCopied(false), 2000)
    } catch {
      // Clipboard API may be blocked; the textarea is selectable as a fallback
      setSummaryCopied(false)
    }
  }


  async function handleApproveMinutes() {
    if (!minutes || !profile || !meeting || !session) return
    if (!minutesContent.trim()) {
      setSectionError('Cannot approve empty minutes. Add content first.')
      return
    }

    // Determine the final URL to archive in Board Resources.
    // Priority: (1) Drive URL provided by Secretary; (2) try auto-archive; (3) prompt user.
    let finalUrl: string | null = minutesDriveUrl.trim() || null
    let attemptedAutoArchive = false

    const hasManualUrl = !!finalUrl
    if (
      !window.confirm(
        hasManualUrl
          ? 'Approve these minutes?\n\n' +
              `The shared minutes document link you provided will be saved to Board Resources:\n${finalUrl}\n\n` +
              'Approval is reversible (you can revert to draft later).'
          : 'Approve these minutes?\n\n' +
              'You did not provide a shared minutes document link. The system will try to auto-generate a PDF in the Approved Minutes Drive folder. ' +
              'If that fails (e.g. Drive is not set up yet), you will be prompted to paste a link manually.\n\n' +
              'Approval is reversible (you can revert to draft later).'
      )
    ) {
      return
    }

    setMinutesSaving(true)
    setSectionError(null)

    try {
      // 1. Persist current draft content first
      const { error: saveErr } = await supabase
        .from('meeting_minutes')
        .update({ content: minutesContent, drive_file_url: minutesDriveUrl || null })
        .eq('id', minutes.id)
      if (saveErr) throw saveErr

      // 2. If no manual URL, attempt auto-archive
      if (!finalUrl) {
        attemptedAutoArchive = true
        try {
          const archived = await archiveMinutes(
            {
              meetingTitle: meeting.title,
              meetingDate: meeting.meeting_date,
              markdown: minutesContent,
            },
            session.access_token
          )
          finalUrl = archived.webViewLink
        } catch (autoErr) {
          // Auto-archive failed — prompt user for a manual URL
          const manualUrl = window.prompt(
            'Auto-archive failed: ' +
              ((autoErr as Error).message ?? 'unknown error') +
              '\n\nPaste the Google Drive link to the approved minutes document instead, then click OK:'
          )
          if (!manualUrl || !manualUrl.trim()) {
            throw new Error('Approval cancelled — no document link provided.')
          }
          finalUrl = manualUrl.trim()
        }
      }

      // 3. Find the approved-minutes folder in Board Resources to nest the new entry under it
      const folderId = await findApprovedMinutesFolderId()

      // 4. Create a Board Resources entry pointing to the final URL
      const meetingDateLabel = new Date(meeting.meeting_date).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
      await supabase.from('board_resources').insert({
        title: `${meeting.title} — ${meetingDateLabel}`,
        description: attemptedAutoArchive
          ? 'Approved meeting minutes (PDF, auto-archived)'
          : 'Approved meeting minutes',
        drive_url: finalUrl,
        category: 'Governance',
        is_folder: false,
        parent_id: folderId,
        created_by: profile.id,
      })

      // 5. Mark minutes as approved and store the final URL
      const { error: approveErr } = await supabase
        .from('meeting_minutes')
        .update({
          status: 'approved',
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
          drive_file_url: finalUrl,
        })
        .eq('id', minutes.id)
      if (approveErr) throw approveErr

      setMinutesInitialized(false)
      refetchMinutes()
    } catch (err) {
      setSectionError(
        'Approval failed: ' + ((err as Error).message ?? 'unknown error')
      )
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
          {meeting.status === 'cancelled' && canEdit && (
            <button
              onClick={() => updateMeetingStatus('scheduled')}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Reopen Meeting
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
          {/* Google Calendar — opens pre-filled event in user's own Google Calendar */}
          {canEdit && (
            <a
              href={buildGoogleCalendarUrl(
                meeting.title,
                meeting.meeting_date,
                1,
                meeting.location,
                meeting.description,
                allProfiles.filter((p) => p.is_active).map((p) => p.email)
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              📅 Add to Google Calendar ↗
            </a>
          )}
          {canEdit && (
            <button
              onClick={handleGenerateSummary}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ✉️ Generate Summary
            </button>
          )}
        </div>
      </div>

      {/* Attendance */}
      <AttendanceSection
        meetingId={id!}
        profiles={allProfiles}
        canEdit={!!canEdit}
      />

      {/* Meeting Materials — pre-reads, reports, presentations (visible pre-meeting) */}
      <MeetingMaterialsSection meetingId={id!} />

      {/* Pending Minutes for Approval — only renders if drafts are linked */}
      <PendingMinutesSection
        reviewingMeetingId={id!}
        canEdit={!!canEdit}
      />

      {/* Agenda Items */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Agenda</h2>
          {!showAgendaForm && canEdit && (
            <button
              onClick={() => { resetAgendaForm(); setShowAgendaForm(true) }}
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
            {/* Presenters (multiple — members + guests) */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Presenters</label>
              <div className="mt-1 space-y-2">
                {agendaPresenters.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    {p.guest_name !== undefined ? (
                      <input
                        type="text"
                        placeholder="Guest name"
                        value={p.guest_name}
                        onChange={(e) => updatePresenter(idx, { guest_name: e.target.value })}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                      />
                    ) : (
                      <select
                        value={p.profile_id ?? ''}
                        onChange={(e) => updatePresenter(idx, { profile_id: e.target.value })}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                      >
                        <option value="">Select member…</option>
                        {profiles.map((pr) => (
                          <option key={pr.id} value={pr.id}>{pr.full_name}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => removePresenter(idx)}
                      className="text-gray-400 hover:text-red-500 text-sm"
                      title="Remove presenter"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={addPresenterMember}
                    className="text-xs font-medium text-navy hover:text-navy-dark"
                  >
                    + Add member
                  </button>
                  <button
                    type="button"
                    onClick={addPresenterGuest}
                    className="text-xs font-medium text-navy hover:text-navy-dark"
                  >
                    + Add guest
                  </button>
                </div>
              </div>
            </div>
            <div className="sm:w-40">
              <label className="block text-sm font-medium text-gray-700">Duration (min)</label>
              <input
                type="number"
                min={1}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                value={agendaDuration}
                onChange={(e) => setAgendaDuration(e.target.value)}
              />
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
              <span className="font-medium text-gray-700">Requires board approval (board vote)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={agendaRequiresCommitteeApproval}
                onChange={(e) => setAgendaRequiresCommitteeApproval(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="font-medium text-gray-700">Requires committee approval</span>
            </label>
            <div className="flex gap-3">
              <button
                onClick={handleSaveAgendaItem}
                disabled={!agendaTitle || agendaSaving}
                className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
              >
                {agendaSaving ? 'Saving...' : editingAgendaId ? 'Update' : 'Save'}
              </button>
              <button
                onClick={resetAgendaForm}
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
            {[...agendaItems].sort((a, b) => a.order_position - b.order_position).map((item, idx, sorted) => (
              <li key={item.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  {/* Reorder buttons — officers only */}
                  {canEdit && (
                    <div className="flex shrink-0 flex-col gap-0.5 pt-0.5">
                      <button
                        onClick={() => moveAgendaItem(item.id, 'up')}
                        disabled={idx === 0}
                        className="rounded p-0.5 text-gray-300 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-0"
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveAgendaItem(item.id, 'down')}
                        disabled={idx === sorted.length - 1}
                        className="rounded p-0.5 text-gray-300 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-0"
                        title="Move down"
                      >
                        ▼
                      </button>
                    </div>
                  )}
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
                      {item.requires_committee_approval && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          Committee Approval Required
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
                    {item.presenters && item.presenters.length > 0 && (
                      <span className="text-sm text-gray-500">
                        &mdash;{' '}
                        {item.presenters
                          .map((p) => (p.profile_id ? p.full_name : `${p.full_name} (guest)`))
                          .join(', ')}
                      </span>
                    )}
                    {item.duration_minutes ? (
                      <span className="ml-2 text-sm text-gray-400">{item.duration_minutes}min</span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canEdit && (
                      <button
                        onClick={() => startEditAgendaItem(item)}
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                    )}
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
                    scope="board"
                  />
                )}
                {item.requires_committee_approval && profile && (
                  <VotePanel
                    agendaItemId={item.id}
                    attendees={attendees}
                    boardProfiles={boardProfiles}
                    currentProfileId={profile.id}
                    canEdit={!!canEdit}
                    scope="committee"
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
          {!showActionForm && canEdit && (
            <button
              onClick={() => { resetActionForm(); setShowActionForm(true) }}
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
                onClick={handleSaveActionItem}
                disabled={!actionTitle || !actionAssigneeId || actionSaving}
                className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
              >
                {actionSaving ? 'Saving...' : editingActionId ? 'Update' : 'Save'}
              </button>
              <button
                onClick={resetActionForm}
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
                {canEdit && (
                  <button
                    onClick={() =>
                      startEditActionItem({
                        id: item.id,
                        title: item.title,
                        description: item.description,
                        assignee_id: item.assignee_id,
                        due_date: item.due_date,
                        priority: item.priority,
                        updated_at: item.updated_at,
                      })
                    }
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Meeting Minutes */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Meeting Minutes</h2>
          {/* Minute-taker banner + assign/handoff control */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">
              Minute-taker:{' '}
              <span className="font-medium text-gray-800">
                {meeting?.minute_taker?.full_name ?? 'Not assigned'}
              </span>
            </span>
            {canAssignMinuteTaker && !showAssignMinuteTaker && (
              <button
                onClick={() => setShowAssignMinuteTaker(true)}
                className="text-xs font-medium text-navy hover:text-navy-dark"
              >
                {meeting?.minute_taker_id ? 'Change' : 'Assign'}
              </button>
            )}
            {canAssignMinuteTaker && showAssignMinuteTaker && (
              <span className="flex items-center gap-1">
                <select
                  defaultValue={meeting?.minute_taker_id ?? ''}
                  disabled={assigningMinuteTaker}
                  onChange={(e) => handleAssignMinuteTaker(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                >
                  <option value="">— None —</option>
                  {allProfiles
                    .filter((p) => p.is_active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => setShowAssignMinuteTaker(false)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </span>
            )}
          </div>
        </div>

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

            {/* Read-only notice for non-editors */}
            {!canEditMinutes && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {meeting?.minute_taker?.full_name ?? 'A designated minute-taker'} is the
                minute-taker for this meeting. Only they (or the Chair / an admin) can edit
                these minutes. You can view and download the current draft below.
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">Content (Markdown)</label>
                <div className="flex items-center gap-3">
                  {canEditMinutes && (
                    <button
                      type="button"
                      onClick={handleGenerateTemplate}
                      disabled={minutesSaving}
                      className="text-xs font-medium text-navy hover:text-navy-dark disabled:opacity-50"
                      title="Generate a draft template using meeting data (attendance, agenda, motions)"
                    >
                      ✨ Generate from Template
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDownloadDraft}
                    className="text-xs font-medium text-navy hover:text-navy-dark"
                    title="Download current draft as a Markdown file"
                  >
                    ⬇ Download Draft
                  </button>
                </div>
              </div>
              <textarea
                rows={18}
                readOnly={!canEditMinutes}
                className={`mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-sans shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy ${
                  !canEditMinutes ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : ''
                }`}
                value={minutesContent}
                onChange={(e) => canEditMinutes && setMinutesContent(e.target.value)}
                placeholder="Click 'Generate from Template' to pre-fill, or write minutes manually in Markdown."
              />
            </div>
            {canEditMinutes && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <label className="block text-sm font-semibold text-gray-900">
                  Link to shared minutes document
                </label>
                <p className="mt-0.5 text-xs text-gray-600">
                  Paste the Google Drive (or Docs) link where the polished minutes live.
                  When the minutes are approved, this link will be saved to Board Resources
                  under Approved Minutes. Leave blank to try auto-archiving the markdown content above.
                </p>
                <input
                  type="text"
                  placeholder="https://docs.google.com/document/d/..."
                  className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                  value={minutesDriveUrl}
                  onChange={(e) => setMinutesDriveUrl(e.target.value)}
                />
              </div>
            )}
            <div className="flex gap-3">
              {canEditMinutes && (
                <button
                  onClick={handleSaveMinutesDraft}
                  disabled={minutesSaving}
                  className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
                >
                  {minutesSaving ? 'Saving...' : 'Save Draft'}
                </button>
              )}
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

      {/* Notes */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Notes</h2>
            <p className="text-xs text-gray-500">
              Informal working notes (separate from the formal minutes).
              {!canEditMinutes && ' Editing is limited to the minute-taker / Chair / admins.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDownloadNotesDoc}
              className="text-xs font-medium text-navy hover:text-navy-dark"
              title="Download as a Word document"
            >
              ⬇ Word (.doc)
            </button>
            <button
              type="button"
              onClick={handleDownloadNotesPdf}
              className="text-xs font-medium text-navy hover:text-navy-dark"
              title="Open print dialog to save as PDF"
            >
              ⬇ PDF
            </button>
          </div>
        </div>

        <div className="mt-4">
          {notesLoading ? (
            <p className="text-sm text-gray-400">Loading notes…</p>
          ) : (
            <NotesEditor
              value={notesHtml}
              editable={!!canEditMinutes}
              onChange={setNotesHtml}
            />
          )}
        </div>

        {canEditMinutes && (
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={handleSaveNotes}
              disabled={notesSaving}
              className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50"
            >
              {notesSaving ? 'Saving…' : 'Save Notes'}
            </button>
            {notes?.updated_at && (
              <span className="text-xs text-gray-400">
                Last saved {formatDate(notes.updated_at)}
              </span>
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

      {/* Agenda Summary Email Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Agenda Summary Email</h2>
                <p className="text-xs text-gray-500">
                  Edit as needed, then copy and paste into your email to the board.
                </p>
              </div>
              <button
                onClick={() => setShowSummaryModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              <textarea
                rows={18}
                value={summaryText}
                onChange={(e) => setSummaryText(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              />
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowSummaryModal(false)}
                className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
              <button
                onClick={handleCopySummary}
                className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark"
              >
                {summaryCopied ? '✓ Copied!' : 'Copy to Clipboard'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
