import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAgendaItemMotion } from '../../hooks/useAgendaItemMotion'
import type { MeetingAttendeeWithProfile, Profile, VoteType, VoteResult, VoteChoice } from '../../types/database'

const RESULT_LABELS: { value: VoteResult; label: string; color: string }[] = [
  { value: 'carried', label: 'Carried', color: 'text-green-700' },
  { value: 'failed', label: 'Failed', color: 'text-red-700' },
  { value: 'tabled', label: 'Tabled', color: 'text-yellow-700' },
]

const RESULT_BADGE: Record<VoteResult, string> = {
  carried: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  tabled: 'bg-yellow-100 text-yellow-800',
}

interface Props {
  agendaItemId: string
  attendees: MeetingAttendeeWithProfile[]
  boardProfiles: Profile[]
  currentProfileId: string
  canEdit: boolean
}

export default function VotePanel({ agendaItemId, attendees, boardProfiles, currentProfileId, canEdit }: Props) {
  const { motion, rollCalls, isLoading, refetch } = useAgendaItemMotion(agendaItemId)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [motionBy, setMotionBy] = useState('')
  const [secondedBy, setSecondedBy] = useState('')
  const [voteType, setVoteType] = useState<VoteType>('voice')
  const [yesCount, setYesCount] = useState('')
  const [noCount, setNoCount] = useState('')
  const [abstainCount, setAbstainCount] = useState('')
  const [rollCallVotes, setRollCallVotes] = useState<Record<string, VoteChoice>>({})
  const [result, setResult] = useState<VoteResult | ''>('')
  const [notes, setNotes] = useState('')

  // Present board members from attendance
  const presentBoardMemberIds = new Set(
    attendees
      .filter((a) => a.attendee_category === 'board_member' && a.attendance_mode !== 'absent')
      .map((a) => a.profile_id)
  )
  const presentBoardMembers = boardProfiles.filter((p) => presentBoardMemberIds.has(p.id))

  function openForm() {
    if (motion) {
      setMotionBy(motion.motion_by ?? '')
      setSecondedBy(motion.seconded_by ?? '')
      setVoteType(motion.vote_type)
      setYesCount(motion.yes_count?.toString() ?? '')
      setNoCount(motion.no_count?.toString() ?? '')
      setAbstainCount(motion.abstain_count?.toString() ?? '')
      setResult(motion.result ?? '')
      setNotes(motion.notes ?? '')
      const rcMap: Record<string, VoteChoice> = {}
      rollCalls.forEach((rc) => { rcMap[rc.profile_id] = rc.vote })
      setRollCallVotes(rcMap)
    } else {
      setMotionBy('')
      setSecondedBy('')
      setVoteType('voice')
      setYesCount('')
      setNoCount('')
      setAbstainCount('')
      setRollCallVotes({})
      setResult('')
      setNotes('')
    }
    setShowForm(true)
  }

  async function handleSave() {
    if (!result) return
    setSaving(true)
    setError(null)

    const motionPayload = {
      agenda_item_id: agendaItemId,
      motion_by: motionBy || null,
      seconded_by: secondedBy || null,
      vote_type: voteType,
      yes_count: voteType === 'voice' ? parseInt(yesCount, 10) || null : null,
      no_count: voteType === 'voice' ? parseInt(noCount, 10) || null : null,
      abstain_count: voteType === 'voice' ? parseInt(abstainCount, 10) || null : null,
      result: result as VoteResult,
      notes: notes.trim() || null,
      recorded_by: currentProfileId,
    }

    let motionError: string | null = null
    if (motion) {
      const { error } = await supabase
        .from('agenda_item_motions')
        .update(motionPayload)
        .eq('id', motion.id)
      motionError = error?.message ?? null
    } else {
      const { error } = await supabase
        .from('agenda_item_motions')
        .insert(motionPayload)
      motionError = error?.message ?? null
    }

    if (motionError) {
      setError(motionError)
      setSaving(false)
      return
    }

    // Save roll call votes
    if (voteType === 'roll_call') {
      // Delete existing and re-insert
      await supabase.from('agenda_item_roll_calls').delete().eq('agenda_item_id', agendaItemId)
      const rollCallRows = Object.entries(rollCallVotes)
        .filter(([, v]) => v)
        .map(([profileId, vote]) => ({
          agenda_item_id: agendaItemId,
          profile_id: profileId,
          vote,
        }))
      if (rollCallRows.length > 0) {
        const { error } = await supabase.from('agenda_item_roll_calls').insert(rollCallRows)
        if (error) {
          setError(error.message)
          setSaving(false)
          return
        }
      }
    }

    refetch()
    setShowForm(false)
    setSaving(false)
  }

  if (isLoading) return null

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      {/* Summary display when vote is recorded */}
      {motion && !showForm && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${RESULT_BADGE[motion.result!]}`}>
            {motion.result}
          </span>
          {motion.motion_by && (
            <span className="text-gray-500">
              Moved by{' '}
              <span className="font-medium text-gray-700">
                {boardProfiles.find((p) => p.id === motion.motion_by)?.full_name ?? '—'}
              </span>
            </span>
          )}
          {motion.seconded_by && (
            <span className="text-gray-500">
              · Seconded by{' '}
              <span className="font-medium text-gray-700">
                {boardProfiles.find((p) => p.id === motion.seconded_by)?.full_name ?? '—'}
              </span>
            </span>
          )}
          {motion.vote_type === 'voice' && (motion.yes_count != null || motion.no_count != null) && (
            <span className="text-gray-500">
              · {motion.yes_count ?? 0} Yes / {motion.no_count ?? 0} No
              {motion.abstain_count ? ` / ${motion.abstain_count} Abstain` : ''}
            </span>
          )}
          {motion.vote_type === 'roll_call' && (
            <span className="text-gray-400 text-xs">Roll call</span>
          )}
          {canEdit && (
            <button
              onClick={openForm}
              className="text-xs text-navy hover:text-navy-dark font-medium"
            >
              Edit Vote
            </button>
          )}
        </div>
      )}

      {/* Record Vote button */}
      {!motion && !showForm && canEdit && (
        <button
          onClick={openForm}
          className="rounded-lg border border-navy/30 bg-navy/5 px-3 py-1.5 text-xs font-medium text-navy hover:bg-navy/10"
        >
          Record Vote
        </button>
      )}

      {/* Vote form */}
      {showForm && (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Motion by</label>
              <select
                value={motionBy}
                onChange={(e) => setMotionBy(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              >
                <option value="">Select board member...</option>
                {(presentBoardMembers.length > 0 ? presentBoardMembers : boardProfiles).map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Seconded by</label>
              <select
                value={secondedBy}
                onChange={(e) => setSecondedBy(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              >
                <option value="">Select board member...</option>
                {(presentBoardMembers.length > 0 ? presentBoardMembers : boardProfiles)
                  .filter((p) => p.id !== motionBy)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
              </select>
            </div>
          </div>

          {/* Vote type toggle */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vote type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVoteType('voice')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                  voteType === 'voice'
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Voice Vote
              </button>
              <button
                type="button"
                onClick={() => setVoteType('roll_call')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                  voteType === 'roll_call'
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Roll Call
              </button>
            </div>
          </div>

          {/* Voice vote headcount */}
          {voteType === 'voice' && (
            <div className="flex gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Yes</label>
                <input
                  type="number"
                  min={0}
                  value={yesCount}
                  onChange={(e) => setYesCount(e.target.value)}
                  className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">No</label>
                <input
                  type="number"
                  min={0}
                  value={noCount}
                  onChange={(e) => setNoCount(e.target.value)}
                  className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Abstain</label>
                <input
                  type="number"
                  min={0}
                  value={abstainCount}
                  onChange={(e) => setAbstainCount(e.target.value)}
                  className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                />
              </div>
            </div>
          )}

          {/* Roll call per member */}
          {voteType === 'roll_call' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Roll Call</label>
              <ul className="space-y-1">
                {(presentBoardMembers.length > 0 ? presentBoardMembers : boardProfiles).map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-800">{p.full_name}</span>
                    <div className="flex gap-1">
                      {(['yes', 'no', 'abstain'] as VoteChoice[]).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setRollCallVotes((prev) => ({ ...prev, [p.id]: v }))}
                          className={`rounded px-2 py-0.5 text-xs font-medium capitalize border transition-colors ${
                            rollCallVotes[p.id] === v
                              ? v === 'yes' ? 'bg-green-100 text-green-800 border-green-300'
                                : v === 'no' ? 'bg-red-100 text-red-800 border-red-300'
                                : 'bg-gray-200 text-gray-700 border-gray-300'
                              : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Result */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Result</label>
            <div className="flex gap-2">
              {RESULT_LABELS.map(({ value, label, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setResult(value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                    result === value
                      ? `border-current ${color} bg-white font-semibold`
                      : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              className="block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!result || saving}
              className="rounded-lg bg-navy px-4 py-2 text-xs font-medium text-white hover:bg-navy-dark disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Vote'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
