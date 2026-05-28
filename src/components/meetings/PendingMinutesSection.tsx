import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { usePendingMinutesForReview } from '../../hooks/usePendingMinutesForReview'
import type { PendingMinutesEntry } from '../../hooks/usePendingMinutesForReview'
import { archiveMinutes } from '../../lib/archiveMinutes'

interface Props {
  reviewingMeetingId: string
  canEdit: boolean
}

function formatDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function PendingMinutesSection({ reviewingMeetingId, canEdit }: Props) {
  const { profile, isOfficer, session } = useAuth()
  const { data: pending, isLoading, refetch } = usePendingMinutesForReview(reviewingMeetingId)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Pending Minutes for Approval</h2>
        <p className="mt-4 text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  if (pending.length === 0) {
    return null // Section is hidden if nothing is linked
  }

  function startEdit(entry: PendingMinutesEntry) {
    setEditingId(entry.minutes_id)
    setEditContent(entry.content)
    setExpandedId(entry.minutes_id)
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditContent('')
    setError(null)
  }

  async function handleSave(minutesId: string) {
    setSavingId(minutesId)
    setError(null)
    const { error: err } = await supabase
      .from('meeting_minutes')
      .update({ content: editContent })
      .eq('id', minutesId)
    if (err) {
      setError(err.message)
    } else {
      setEditingId(null)
      refetch()
    }
    setSavingId(null)
  }

  async function handleApprove(entry: PendingMinutesEntry) {
    if (!profile || !session) return
    if (!entry.content.trim()) {
      setError('Cannot approve empty minutes. Edit the draft first.')
      return
    }
    if (
      !window.confirm(
        `Approve "${entry.meeting_title} — ${formatDate(entry.meeting_date)}"?\n\n` +
          'This will generate a PDF, archive it in Google Drive, and add it to Board Resources. ' +
          'The current draft content shown below will be used.'
      )
    ) {
      return
    }
    setApprovingId(entry.minutes_id)
    setError(null)
    try {
      // 1. Archive to Drive (PDF generation)
      const archived = await archiveMinutes(
        {
          meetingTitle: entry.meeting_title,
          meetingDate: entry.meeting_date,
          markdown: entry.content,
        },
        session.access_token
      )

      // 2. Find the Approved Minutes Board Resources folder
      const { data: folderRow } = await supabase
        .from('board_resources')
        .select('id')
        .eq('title', 'Approved Minutes')
        .eq('is_folder', true)
        .is('parent_id', null)
        .maybeSingle()

      const dateLabel = formatDate(entry.meeting_date)

      // 3. Create Board Resources entry
      await supabase.from('board_resources').insert({
        title: `${entry.meeting_title} — ${dateLabel}`,
        description: 'Approved meeting minutes (PDF)',
        drive_url: archived.webViewLink,
        category: 'Governance',
        is_folder: false,
        parent_id: folderRow?.id ?? null,
        created_by: profile.id,
      })

      // 4. Mark minutes as approved
      const { error: approveErr } = await supabase
        .from('meeting_minutes')
        .update({
          status: 'approved',
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
          drive_file_url: archived.webViewLink,
        })
        .eq('id', entry.minutes_id)
      if (approveErr) throw approveErr

      refetch()
    } catch (err) {
      setError(
        `Approval failed for "${entry.meeting_title}": ${
          (err as Error).message ?? 'unknown error'
        }`
      )
    } finally {
      setApprovingId(null)
    }
  }

  async function handleUnlink(linkId: string, title: string) {
    if (!window.confirm(`Remove "${title}" from this meeting's review list? The draft itself is not deleted.`)) {
      return
    }
    setError(null)
    const { error: err } = await supabase
      .from('meeting_minutes_for_review')
      .delete()
      .eq('id', linkId)
    if (err) setError(err.message)
    else refetch()
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Pending Minutes for Approval</h2>
      <p className="mt-1 text-xs text-gray-500">
        Draft minutes from past meetings, linked for review at this meeting.
      </p>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {pending.map((entry) => {
          const isExpanded = expandedId === entry.minutes_id
          const isEditing = editingId === entry.minutes_id
          const isSaving = savingId === entry.minutes_id
          const isApproving = approvingId === entry.minutes_id
          const isApproved = entry.status === 'approved'

          return (
            <li
              key={entry.link_id}
              className="rounded-lg border border-gray-200 overflow-hidden"
            >
              {/* Header row */}
              <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {entry.meeting_title}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(entry.meeting_date)}
                    {entry.drafter_name && ` · drafted by ${entry.drafter_name}`}
                    {' · '}
                    <span
                      className={
                        isApproved
                          ? 'text-green-700 font-medium'
                          : 'text-yellow-700 font-medium'
                      }
                    >
                      {isApproved ? 'approved' : 'draft'}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <button
                    onClick={() =>
                      setExpandedId(isExpanded ? null : entry.minutes_id)
                    }
                    className="text-xs font-medium text-navy hover:text-navy-dark"
                  >
                    {isExpanded ? 'Hide' : 'View'}
                  </button>
                  {canEdit && !isApproved && !isEditing && (
                    <button
                      onClick={() => startEdit(entry)}
                      className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Edit
                    </button>
                  )}
                  {isOfficer && !isApproved && !isEditing && (
                    <button
                      onClick={() => handleApprove(entry)}
                      disabled={isApproving}
                      className="rounded-lg border border-green-600 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                    >
                      {isApproving ? 'Approving…' : 'Approve'}
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => handleUnlink(entry.link_id, entry.meeting_title)}
                      className="text-xs text-gray-400 hover:text-red-500"
                      title="Remove from this meeting's review list"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded view: content + edit mode */}
              {isExpanded && (
                <div className="px-4 py-3 bg-white">
                  {isEditing ? (
                    <>
                      <textarea
                        rows={14}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                      />
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleSave(entry.minutes_id)}
                          disabled={isSaving}
                          className="rounded-lg bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-dark disabled:opacity-50"
                        >
                          {isSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <pre className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-xs font-mono text-gray-700 max-h-96 overflow-y-auto">
                      {entry.content || '(empty draft)'}
                    </pre>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
