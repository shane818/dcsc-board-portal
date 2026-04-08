import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useMeetingAttendees } from '../../hooks/useMeetingAttendees'
import type { AttendanceMode, Profile } from '../../types/database'

const BOARD_ROLES = new Set(['chair', 'vice_chair', 'secretary', 'treasurer', 'board_member'])

const ROLE_LABEL: Record<string, string> = {
  chair: 'Chair',
  vice_chair: 'Vice Chair',
  secretary: 'Secretary',
  treasurer: 'Treasurer',
  board_member: 'Board Member',
  staff: 'Staff',
}

const MODE_LABELS: { value: AttendanceMode; label: string }[] = [
  { value: 'in_person', label: 'In Person' },
  { value: 'virtual', label: 'Virtual' },
  { value: 'absent', label: 'Absent' },
]

const MODE_COLORS: Record<AttendanceMode, string> = {
  in_person: 'bg-green-100 text-green-800',
  virtual: 'bg-navy/10 text-navy',
  absent: 'bg-gray-100 text-gray-500',
}

interface Props {
  meetingId: string
  profiles: Profile[]
  canEdit: boolean
}

export default function AttendanceSection({ meetingId, profiles, canEdit }: Props) {
  const { data: attendees, isLoading, refetch } = useMeetingAttendees(meetingId)
  const [saving, setSaving] = useState<string | null>(null)
  const [showStaffPicker, setShowStaffPicker] = useState(false)
  const [showGuestForm, setShowGuestForm] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestOrg, setGuestOrg] = useState('')
  const [guestSaving, setGuestSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Separate attendee records by category
  const boardAttendees = attendees.filter((a) => a.attendee_category === 'board_member')
  const staffAttendees = attendees.filter((a) => a.attendee_category === 'staff')
  const guestAttendees = attendees.filter((a) => a.attendee_category === 'guest')

  // Board member profiles not yet in attendees list
  const boardProfiles = profiles
    .filter((p) => BOARD_ROLES.has(p.role) && p.is_active)
    .sort((a, b) => {
      const order = ['chair', 'vice_chair', 'secretary', 'treasurer', 'board_member']
      return order.indexOf(a.role) - order.indexOf(b.role) || a.full_name.localeCompare(b.full_name)
    })

  // Staff profiles that are standard attendees and not yet in attendees list
  const standardStaffProfiles = profiles.filter(
    (p) => p.role === 'staff' && p.is_standard_attendee && p.is_active
  )

  // All staff profiles not yet listed (for picker)
  const staffAttendeeProfileIds = new Set(staffAttendees.map((a) => a.profile_id))
  const availableStaff = profiles.filter(
    (p) => p.role === 'staff' && p.is_active && !staffAttendeeProfileIds.has(p.id)
  )

  // Quorum: present = in_person or virtual
  const boardPresentCount = boardProfiles.filter((p) => {
    const record = boardAttendees.find((a) => a.profile_id === p.id)
    return record && record.attendance_mode !== 'absent'
  }).length
  const quorumMet = boardPresentCount > Math.floor(boardProfiles.length / 2)

  // Get mode for a profile from attendees list
  function getMode(profileId: string, category: string): AttendanceMode {
    const record = attendees.find((a) => a.profile_id === profileId && a.attendee_category === category)
    return record?.attendance_mode ?? 'absent'
  }

  async function setAttendanceMode(profileId: string, category: 'board_member' | 'staff', mode: AttendanceMode) {
    setSaving(profileId)
    setError(null)
    const existing = attendees.find((a) => a.profile_id === profileId && a.attendee_category === category)
    if (existing) {
      const { error } = await supabase
        .from('meeting_attendees')
        .update({ attendance_mode: mode })
        .eq('id', existing.id)
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.from('meeting_attendees').insert({
        meeting_id: meetingId,
        profile_id: profileId,
        attendee_category: category,
        attendance_mode: mode,
      })
      if (error) setError(error.message)
    }
    refetch()
    setSaving(null)
  }

  async function addStaffAttendee(profileId: string) {
    setSaving(profileId)
    setError(null)
    const { error } = await supabase.from('meeting_attendees').insert({
      meeting_id: meetingId,
      profile_id: profileId,
      attendee_category: 'staff',
      attendance_mode: 'in_person',
    })
    if (error) setError(error.message)
    refetch()
    setSaving(null)
    setShowStaffPicker(false)
  }

  async function addGuest() {
    if (!guestName.trim()) return
    setGuestSaving(true)
    setError(null)
    const { error } = await supabase.from('meeting_attendees').insert({
      meeting_id: meetingId,
      profile_id: null,
      attendee_category: 'guest',
      attendance_mode: 'in_person',
      guest_name: guestName.trim(),
      guest_organization: guestOrg.trim() || null,
    })
    if (error) setError(error.message)
    else {
      setGuestName('')
      setGuestOrg('')
      setShowGuestForm(false)
    }
    refetch()
    setGuestSaving(false)
  }

  async function removeAttendee(attendeeId: string) {
    setError(null)
    const { error } = await supabase.from('meeting_attendees').delete().eq('id', attendeeId)
    if (error) setError(error.message)
    else refetch()
  }

  // Auto-populate standard staff on first load
  async function autoPopulateStandardStaff() {
    const missing = standardStaffProfiles.filter((p) => !staffAttendeeProfileIds.has(p.id))
    if (missing.length === 0) return
    const rows = missing.map((p) => ({
      meeting_id: meetingId,
      profile_id: p.id,
      attendee_category: 'staff' as const,
      attendance_mode: 'in_person' as AttendanceMode,
    }))
    await supabase.from('meeting_attendees').upsert(rows, { onConflict: 'meeting_id,profile_id', ignoreDuplicates: true })
    refetch()
  }

  // Trigger auto-populate once when component loads and there are no staff records yet
  const [autoPopulated, setAutoPopulated] = useState(false)
  if (!isLoading && !autoPopulated && staffAttendees.length === 0 && standardStaffProfiles.length > 0 && canEdit) {
    setAutoPopulated(true)
    autoPopulateStandardStaff()
  }

  const presentCount = attendees.filter(
    (a) => a.attendee_category !== 'guest' && a.attendance_mode !== 'absent'
  ).length + guestAttendees.length

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Attendance</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${quorumMet ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
            {boardPresentCount}/{boardProfiles.length} board present
            {quorumMet ? ' · Quorum' : ' · No quorum'}
          </span>
          {presentCount > 0 && (
            <span className="text-xs text-gray-500">{presentCount} total attending</span>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="mt-4 flex justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-4 border-navy border-t-transparent" />
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {/* Board Members */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Board Members</h3>
            <ul className="divide-y divide-gray-100">
              {boardProfiles.map((p) => {
                const mode = getMode(p.id, 'board_member')
                const isSaving = saving === p.id
                return (
                  <li key={p.id} className={`flex items-center justify-between py-2 ${isSaving ? 'opacity-50' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-gray-900">{p.full_name}</span>
                      <span className="ml-2 text-xs text-gray-400">{ROLE_LABEL[p.role] ?? p.role}</span>
                    </div>
                    <div className="flex gap-1">
                      {MODE_LABELS.map(({ value, label }) => (
                        <button
                          key={value}
                          disabled={!canEdit || isSaving}
                          onClick={() => canEdit && setAttendanceMode(p.id, 'board_member', value)}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                            mode === value
                              ? MODE_COLORS[value]
                              : 'bg-white text-gray-400 hover:bg-gray-100 border border-gray-200'
                          } disabled:cursor-default`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Staff */}
          {(staffAttendees.length > 0 || availableStaff.length > 0) && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Staff</h3>
                {canEdit && availableStaff.length > 0 && (
                  <button
                    onClick={() => setShowStaffPicker(!showStaffPicker)}
                    className="text-xs text-navy hover:text-navy-dark font-medium"
                  >
                    + Add Staff
                  </button>
                )}
              </div>
              {showStaffPicker && (
                <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
                  <p className="mb-1 text-xs text-gray-500">Select staff to add:</p>
                  <div className="space-y-1">
                    {availableStaff.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addStaffAttendee(p.id)}
                        disabled={saving === p.id}
                        className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-navy/5 disabled:opacity-50"
                      >
                        {p.full_name}
                        {p.job_title && <span className="ml-1 text-xs text-gray-400">— {p.job_title}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <ul className="divide-y divide-gray-100">
                {staffAttendees.map((a) => {
                  const mode = a.attendance_mode
                  const isSaving = saving === a.profile_id
                  return (
                    <li key={a.id} className={`flex items-center justify-between py-2 ${isSaving ? 'opacity-50' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-gray-900">
                          {a.profile?.full_name ?? '—'}
                        </span>
                        {a.profile?.job_title && (
                          <span className="ml-2 text-xs text-gray-400">{a.profile.job_title}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {MODE_LABELS.map(({ value, label }) => (
                          <button
                            key={value}
                            disabled={!canEdit || isSaving}
                            onClick={() => a.profile_id && canEdit && setAttendanceMode(a.profile_id, 'staff', value)}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                              mode === value
                                ? MODE_COLORS[value]
                                : 'bg-white text-gray-400 hover:bg-gray-100 border border-gray-200'
                            } disabled:cursor-default`}
                          >
                            {label}
                          </button>
                        ))}
                        {canEdit && (
                          <button
                            onClick={() => removeAttendee(a.id)}
                            className="ml-1 text-xs text-gray-300 hover:text-red-400"
                            title="Remove"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Guests */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Guests {guestAttendees.length > 0 && `(${guestAttendees.length})`}
              </h3>
              {canEdit && (
                <button
                  onClick={() => setShowGuestForm(!showGuestForm)}
                  className="text-xs text-navy hover:text-navy-dark font-medium"
                >
                  + Add Guest
                </button>
              )}
            </div>
            {showGuestForm && (
              <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    placeholder="Guest name *"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                  />
                  <input
                    type="text"
                    placeholder="Organization (optional)"
                    value={guestOrg}
                    onChange={(e) => setGuestOrg(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addGuest}
                    disabled={!guestName.trim() || guestSaving}
                    className="rounded-lg bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-dark disabled:opacity-50"
                  >
                    {guestSaving ? 'Adding...' : 'Add Guest'}
                  </button>
                  <button
                    onClick={() => { setShowGuestForm(false); setGuestName(''); setGuestOrg('') }}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {guestAttendees.length === 0 && !showGuestForm ? (
              <p className="text-xs text-gray-400">No guests.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {guestAttendees.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{a.guest_name}</span>
                      {a.guest_organization && (
                        <span className="ml-2 text-xs text-gray-400">{a.guest_organization}</span>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => removeAttendee(a.id)}
                        className="text-xs text-gray-300 hover:text-red-400"
                        title="Remove guest"
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
