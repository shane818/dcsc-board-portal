import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useAllProfiles } from '../hooks/useAllProfiles'
import { useAllCommittees } from '../hooks/useAllCommittees'
import { useServiceHistory } from '../hooks/useServiceHistory'
import type { BoardRole, CommitteeRole, ServiceEntryType, ServiceHistoryEntry } from '../types/database'

// ---- Helpers ----

const BOARD_ROLE_LABELS: Record<BoardRole, string> = {
  chair: 'Chair of the Board',
  vice_chair: 'Vice Chair',
  secretary: 'Secretary',
  treasurer: 'Treasurer',
  board_member: 'Board Member',
  staff: 'Staff',
  guest: 'Guest',
}

const BOARD_ROLE_BADGE: Record<BoardRole, string> = {
  chair: 'bg-purple-100 text-purple-800',
  vice_chair: 'bg-navy/20 text-navy-dark',
  secretary: 'bg-cyan-100 text-cyan-800',
  treasurer: 'bg-green-100 text-green-800',
  board_member: 'bg-gray-100 text-gray-700',
  staff: 'bg-orange-100 text-orange-800',
  guest: 'bg-gray-100 text-gray-500',
}

const COMMITTEE_ROLE_LABELS: Record<CommitteeRole, string> = {
  chair: 'Chair',
  member: 'Member',
  ex_officio: 'Ex Officio',
}

const ROLE_SORT_ORDER: Record<BoardRole, number> = {
  chair: 0,
  vice_chair: 1,
  secretary: 2,
  treasurer: 3,
  board_member: 4,
  staff: 5,
  guest: 6,
}

function generateFiscalYears(): string[] {
  const years: string[] = []
  for (let start = 2014; start <= 2030; start++) {
    years.push(`${start}-${String(start + 1).slice(-2)}`)
  }
  return years.reverse()
}

function calcTermInfo(termStartDate: string | null): {
  yearsServed: number
  termNumber: number
  termLabel: string
  yearsLabel: string
} {
  if (!termStartDate) return { yearsServed: 0, termNumber: 0, termLabel: '', yearsLabel: '' }
  const start = new Date(termStartDate)
  const now = new Date()
  const ms = now.getTime() - start.getTime()
  const years = ms / (1000 * 60 * 60 * 24 * 365.25)
  const termNumber = Math.min(Math.floor(years / 2) + 1, 3)
  const ordinals = ['', '1st', '2nd', '3rd']
  const yearsWhole = Math.floor(years)
  const months = Math.round((years - yearsWhole) * 12)
  const yearsLabel =
    yearsWhole === 0
      ? `${months} month${months !== 1 ? 's' : ''}`
      : `${yearsWhole} year${yearsWhole !== 1 ? 's' : ''}${months > 0 ? `, ${months} mo` : ''}`
  return {
    yearsServed: years,
    termNumber,
    termLabel: `${ordinals[termNumber]} term`,
    yearsLabel,
  }
}

function formatEntryLabel(entry: ServiceHistoryEntry): string {
  if (entry.entry_type === 'board_officer' && entry.board_role) {
    return BOARD_ROLE_LABELS[entry.board_role]
  }
  if (entry.entry_type === 'committee') {
    const cname = entry.committee?.name ?? 'Unknown Committee'
    const crole = entry.committee_role ? COMMITTEE_ROLE_LABELS[entry.committee_role] : ''
    return crole ? `${cname} — ${crole}` : cname
  }
  return 'Unknown entry'
}

// ---- Main page ----

export default function DirectoryPage() {
  const { isOfficer } = useAuth()
  const { data: allProfiles, isLoading } = useAllProfiles()
  const [showInactive, setShowInactive] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const profiles = allProfiles
    .filter((p) => showInactive || p.is_active)
    .sort((a, b) => {
      const roleOrder = ROLE_SORT_ORDER[a.role] - ROLE_SORT_ORDER[b.role]
      if (roleOrder !== 0) return roleOrder
      return a.full_name.localeCompare(b.full_name)
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Board Directory</h1>
          <p className="mt-1 text-sm text-gray-500">
            Board member profiles, terms, and service history.
          </p>
        </div>
        <button
          onClick={() => setShowInactive((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            showInactive
              ? 'border-navy/40 bg-navy/10 text-navy'
              : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {showInactive ? 'Showing all' : 'Show inactive'}
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-500">Loading directory...</div>
      ) : profiles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-sm text-gray-400">
          No board members found.
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((profile) => {
            const isExpanded = expandedId === profile.id
            const term = calcTermInfo(profile.term_start_date)
            return (
              <div
                key={profile.id}
                className={`rounded-xl border bg-white ${profile.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
              >
                {/* Header row */}
                <div
                  className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : profile.id)}
                >
                  {/* Avatar */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy/20 text-navy font-semibold text-sm">
                    {profile.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </div>

                  {/* Name + email */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{profile.full_name}</span>
                      {!profile.is_active && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inactive</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{profile.email}</p>
                  </div>

                  {/* Role badge + job title */}
                  <div className="hidden sm:flex flex-col items-end shrink-0 gap-0.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BOARD_ROLE_BADGE[profile.role]}`}>
                      {profile.job_title ?? BOARD_ROLE_LABELS[profile.role]}
                    </span>
                    {profile.job_title && (
                      <span className="text-xs text-gray-400">{BOARD_ROLE_LABELS[profile.role]}</span>
                    )}
                  </div>

                  {/* Term info */}
                  {profile.term_start_date && (
                    <div className="hidden sm:flex flex-col items-end shrink-0">
                      <span className="text-xs font-medium text-gray-700">{term.termLabel}</span>
                      <span className="text-xs text-gray-400">{term.yearsLabel} served</span>
                    </div>
                  )}

                  <span className="text-gray-400 shrink-0">{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Expanded profile */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-6 py-5">
                    <ProfileDetail profile={profile} term={term} isOfficer={isOfficer} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---- Profile Detail ----

interface TermInfo {
  yearsServed: number
  termNumber: number
  termLabel: string
  yearsLabel: string
}

function ProfileDetail({
  profile,
  term,
  isOfficer,
}: {
  profile: { id: string; email: string; full_name: string; role: BoardRole; job_title: string | null; term_start_date: string | null; is_active: boolean }
  term: TermInfo
  isOfficer: boolean
}) {
  const { data: history, isLoading, refetch } = useServiceHistory(profile.id)
  const { data: allCommittees } = useAllCommittees()
  const [showAddForm, setShowAddForm] = useState(false)

  // Group history by fiscal year
  const byYear = history.reduce<Record<string, ServiceHistoryEntry[]>>((acc, entry) => {
    if (!acc[entry.fiscal_year]) acc[entry.fiscal_year] = []
    acc[entry.fiscal_year].push(entry)
    return acc
  }, {})
  const sortedYears = Object.keys(byYear).sort((a, b) => b.localeCompare(a))

  // Term progress bar (max 6 years)
  const MAX_YEARS = 6
  const pct = profile.term_start_date
    ? Math.min((term.yearsServed / MAX_YEARS) * 100, 100)
    : 0

  return (
    <div className="space-y-5">
      {/* Contact + Term */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-gray-400 mb-1">Contact</p>
          <p className="text-sm text-gray-900">{profile.email}</p>
          {profile.job_title && (
            <p className="text-xs text-gray-500 mt-0.5">{profile.job_title}</p>
          )}
        </div>

        <div>
          <p className="text-xs font-medium uppercase text-gray-400 mb-1">Board Term</p>
          {profile.term_start_date ? (
            <div className="space-y-1">
              <p className="text-sm text-gray-900">
                Started{' '}
                {new Date(profile.term_start_date).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
                {' · '}
                <span className="font-medium">{term.termLabel}</span>
                {' · '}
                {term.yearsLabel} served
              </p>
              {/* Progress bar: max 6 years = 3 terms */}
              <div className="relative h-2 w-full max-w-xs rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full bg-navy transition-all"
                  style={{ width: `${pct}%` }}
                />
                {/* Term dividers at 33% and 66% */}
                <div className="absolute top-0 bottom-0 left-1/3 w-px bg-white" />
                <div className="absolute top-0 bottom-0 left-2/3 w-px bg-white" />
              </div>
              <p className="text-xs text-gray-400">
                {Math.round(pct)}% of max service (6 years / 3 terms)
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No start date recorded</p>
          )}
        </div>
      </div>

      {/* Service History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium uppercase text-gray-400">Service History</p>
          {isOfficer && (
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="text-xs font-medium text-navy hover:text-navy-dark"
            >
              {showAddForm ? 'Cancel' : '+ Add Entry'}
            </button>
          )}
        </div>

        {showAddForm && (
          <AddServiceEntryForm
            profileId={profile.id}
            committees={allCommittees}
            onSaved={() => { setShowAddForm(false); refetch() }}
          />
        )}

        {isLoading ? (
          <p className="text-xs text-gray-400">Loading history...</p>
        ) : sortedYears.length === 0 ? (
          <p className="text-xs text-gray-400">No service history recorded yet.</p>
        ) : (
          <div className="space-y-4">
            {sortedYears.map((year) => (
              <div key={year}>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">FY {year}</p>
                <div className="space-y-1 pl-3 border-l-2 border-gray-100">
                  {byYear[year].map((entry) => (
                    <ServiceEntryRow
                      key={entry.id}
                      entry={entry}
                      isOfficer={isOfficer}
                      onDeleted={refetch}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Service Entry Row ----

function ServiceEntryRow({
  entry,
  isOfficer,
  onDeleted,
}: {
  entry: ServiceHistoryEntry
  isOfficer: boolean
  onDeleted: () => void
}) {
  async function handleDelete() {
    if (!window.confirm('Delete this service history entry?')) return
    await supabase.from('board_service_history').delete().eq('id', entry.id)
    onDeleted()
  }

  return (
    <div className="flex items-start justify-between gap-2 py-0.5">
      <div>
        <span className="text-sm text-gray-800">{formatEntryLabel(entry)}</span>
        {entry.notes && (
          <span className="ml-2 text-xs text-gray-400">{entry.notes}</span>
        )}
      </div>
      {isOfficer && (
        <button
          onClick={handleDelete}
          className="shrink-0 text-xs text-red-400 hover:text-red-600"
        >
          ✕
        </button>
      )}
    </div>
  )
}

// ---- Add Service Entry Form ----

interface CommitteeOption {
  id: string
  name: string
}

function AddServiceEntryForm({
  profileId,
  committees,
  onSaved,
}: {
  profileId: string
  committees: CommitteeOption[]
  onSaved: () => void
}) {
  const fiscalYears = generateFiscalYears()
  const [entryType, setEntryType] = useState<ServiceEntryType>('committee')
  const [fiscalYear, setFiscalYear] = useState(fiscalYears[0])
  const [boardRole, setBoardRole] = useState<BoardRole>('board_member')
  const [committeeId, setCommitteeId] = useState('')
  const [committeeRole, setCommitteeRole] = useState<CommitteeRole>('member')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (entryType === 'committee' && !committeeId) {
      setError('Please select a committee.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('board_service_history').insert({
      profile_id: profileId,
      fiscal_year: fiscalYear,
      entry_type: entryType,
      board_role: entryType === 'board_officer' ? boardRole : null,
      committee_id: entryType === 'committee' ? committeeId : null,
      committee_role: entryType === 'committee' ? committeeRole : null,
      notes: notes.trim() || null,
    })
    if (err) setError(err.message)
    else onSaved()
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Fiscal Year</label>
          <select
            value={fiscalYear}
            onChange={(e) => setFiscalYear(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            {fiscalYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select
            value={entryType}
            onChange={(e) => setEntryType(e.target.value as ServiceEntryType)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="committee">Committee Role</option>
            <option value="board_officer">Board Officer Role</option>
          </select>
        </div>
      </div>

      {entryType === 'board_officer' ? (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Board Role</label>
          <select
            value={boardRole}
            onChange={(e) => setBoardRole(e.target.value as BoardRole)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="chair">Chair of the Board</option>
            <option value="vice_chair">Vice Chair</option>
            <option value="secretary">Secretary</option>
            <option value="treasurer">Treasurer</option>
            <option value="board_member">Board Member</option>
            <option value="staff">Staff</option>
          </select>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Committee</label>
            <select
              value={committeeId}
              onChange={(e) => setCommitteeId(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Select committee...</option>
              {committees.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <select
              value={committeeRole}
              onChange={(e) => setCommitteeRole(e.target.value as CommitteeRole)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="member">Member</option>
              <option value="chair">Chair</option>
              <option value="ex_officio">Ex Officio</option>
            </select>
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Served as interim chair"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="bg-navy text-white rounded px-3 py-1.5 text-xs font-medium hover:bg-navy-dark disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Entry'}
      </button>
    </form>
  )
}
