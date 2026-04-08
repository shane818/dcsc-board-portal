import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useAllProfiles } from '../hooks/useAllProfiles'
import { useAllCommittees } from '../hooks/useAllCommittees'
import { useCommitteeMembers } from '../hooks/useCommitteeMembers'
import { useProfiles } from '../hooks/useProfiles'
import type { BoardRole, CommitteeRole } from '../types/database'

type Tab = 'roster' | 'committees'

const ROLE_OPTIONS: { value: BoardRole; label: string }[] = [
  { value: 'chair', label: 'Chair' },
  { value: 'vice_chair', label: 'Vice Chair' },
  { value: 'secretary', label: 'Secretary' },
  { value: 'treasurer', label: 'Treasurer' },
  { value: 'board_member', label: 'Board Member' },
  { value: 'staff', label: 'Staff' },
  { value: 'guest', label: 'Guest' },
]

export default function AdminPage() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('roster')

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage board members, committees, and memberships.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('roster')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'roster'
              ? 'border-navy text-navy'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Board Roster
        </button>
        <button
          onClick={() => setActiveTab('committees')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'committees'
              ? 'border-navy text-navy'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Committees
        </button>
      </div>

      {activeTab === 'roster' && <RosterTab currentUserId={profile?.id ?? ''} />}
      {activeTab === 'committees' && <CommitteesTab />}
    </div>
  )
}

// ---- Board Roster Tab ----

interface BoardInvite {
  id: string
  email: string
  full_name: string
  role: BoardRole
  phone: string | null
  term_start_date: string | null
  job_title: string | null
  created_at: string
}

function useInvites() {
  const [data, setData] = useState<BoardInvite[]>([])
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    supabase
      .from('board_invites')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setData((data as BoardInvite[]) ?? []))
  }, [refetchCount])

  return { data, refetch: () => setRefetchCount((c) => c + 1) }
}

function RosterTab({ currentUserId }: { currentUserId: string }) {
  const { data: profiles, isLoading, error, refetch } = useAllProfiles()
  const { data: invites, refetch: refetchInvites } = useInvites()
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [hideInactive, setHideInactive] = useState(true)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<BoardRole>('board_member')
  const [newPhone, setNewPhone] = useState('')
  const [newTermStart, setNewTermStart] = useState('')
  const [newJobTitle, setNewJobTitle] = useState('')
  const [addingSaving, setAddingSaving] = useState(false)

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !newEmail.trim()) return
    setAddingSaving(true)
    setSaveError(null)

    // Check if this email already has a profile (already signed in)
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', newEmail.trim().toLowerCase())
      .maybeSingle()

    if (existing) {
      setSaveError('This email already has an account. Change their role in the roster below.')
      setAddingSaving(false)
      return
    }

    // Add to invites table — when they sign in with Google, the trigger assigns the role
    const { error } = await supabase.from('board_invites').insert({
      email: newEmail.trim().toLowerCase(),
      full_name: newName.trim(),
      role: newRole,
      invited_by: currentUserId,
      phone: newPhone.trim() || null,
      term_start_date: newTermStart || null,
      job_title: newJobTitle.trim() || null,
    })
    if (error) {
      if (error.message.includes('duplicate')) {
        setSaveError('This email has already been invited.')
      } else {
        console.error('[AdminPage] invite failed:', error)
        setSaveError('Failed to invite member. Please try again.')
      }
    } else {
      setNewName('')
      setNewEmail('')
      setNewRole('board_member')
      setNewPhone('')
      setNewTermStart('')
      setNewJobTitle('')
      setShowAddForm(false)
      refetchInvites()
    }
    setAddingSaving(false)
  }

  async function handleRoleChange(userId: string, role: BoardRole) {
    setSavingId(userId)
    setSaveError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId)
    if (error) { console.error('[AdminPage] role change failed:', error); setSaveError('Failed to update role. Please try again.') }
    else refetch()
    setSavingId(null)
  }

  async function handleToggleActive(userId: string, currentlyActive: boolean) {
    setSavingId(userId)
    setSaveError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !currentlyActive })
      .eq('id', userId)
    if (error) { console.error('[AdminPage] toggle active failed:', error); setSaveError('Failed to update status. Please try again.') }
    else refetch()
    setSavingId(null)
  }

  async function handleTermDateChange(userId: string, date: string) {
    setSavingId(userId)
    setSaveError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ term_start_date: date || null })
      .eq('id', userId)
    if (error) { console.error('[AdminPage] term date failed:', error); setSaveError('Failed to update term date. Please try again.') }
    else refetch()
    setSavingId(null)
  }

  async function handleJobTitleChange(userId: string, title: string) {
    setSavingId(userId)
    setSaveError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ job_title: title.trim() || null })
      .eq('id', userId)
    if (error) { console.error('[AdminPage] job title failed:', error); setSaveError('Failed to update position. Please try again.') }
    else refetch()
    setSavingId(null)
  }

  async function handleToggleStandardAttendee(userId: string, current: boolean) {
    setSavingId(userId)
    setSaveError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ is_standard_attendee: !current })
      .eq('id', userId)
    if (error) { console.error('[AdminPage] standard attendee failed:', error); setSaveError('Failed to update. Please try again.') }
    else refetch()
    setSavingId(null)
  }

  const activeProfiles = profiles.filter((p) => p.is_active)
  const visibleProfiles = hideInactive ? activeProfiles : profiles

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setHideInactive((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            !hideInactive
              ? 'border-navy/40 bg-navy/10 text-navy'
              : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {hideInactive ? 'Show inactive' : 'Hide inactive'}
        </button>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-navy-dark"
        >
          {showAddForm ? 'Cancel' : 'Add Board Member'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddMember} className="rounded-xl border border-gray-200 bg-white p-4 max-w-lg space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Required</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Full Name</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as BoardRole)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 pt-1">Profile details (optional — will be set when they log in)</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone</label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="e.g. 202-555-0100"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Term Start Date</label>
              <input
                type="date"
                value={newTermStart}
                onChange={(e) => setNewTermStart(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Job Title / Position</label>
            <input
              type="text"
              value={newJobTitle}
              onChange={(e) => setNewJobTitle(e.target.value)}
              placeholder="e.g. Executive Director"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>

          <button
            type="submit"
            disabled={addingSaving}
            className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-navy-dark disabled:opacity-50"
          >
            {addingSaving ? 'Adding...' : 'Add Member'}
          </button>
          <p className="text-xs text-gray-400">
            Pre-registers the director. All details will be applied automatically when they sign in with Google.
          </p>
        </form>
      )}

      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-500">Loading roster...</div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-red-500">{error}</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Term Start</th>
                <th className="px-6 py-3 whitespace-nowrap">Std. Attendee</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleProfiles.map((p) => (
                <tr key={p.id} className={`${!p.is_active ? 'bg-gray-50/50' : ''} ${savingId === p.id ? 'opacity-50' : ''}`}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {p.full_name}
                    {p.id === currentUserId && (
                      <span className="ml-2 text-xs text-gray-400">(you)</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{p.email}</td>
                  <td className="px-6 py-4">
                    {p.id === currentUserId ? (
                      <div className="space-y-1">
                        <span className="rounded-full bg-navy/10 px-2.5 py-0.5 text-xs font-medium text-navy capitalize">
                          {p.role.replace('_', ' ')}
                        </span>
                        {p.job_title && (
                          <p className="text-xs text-gray-500">{p.job_title}</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <select
                          value={p.role}
                          onChange={(e) => handleRoleChange(p.id, e.target.value as BoardRole)}
                          disabled={savingId === p.id}
                          className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          defaultValue={p.job_title ?? ''}
                          disabled={savingId === p.id}
                          placeholder={p.role === 'staff' ? 'e.g. Executive Director' : 'Position (optional)'}
                          onBlur={(e) => {
                            if (e.target.value !== (p.job_title ?? '')) {
                              handleJobTitleChange(p.id, e.target.value)
                            }
                          }}
                          className="block w-full rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 placeholder-gray-300 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <input
                      type="date"
                      defaultValue={p.term_start_date ?? ''}
                      disabled={savingId === p.id}
                      onBlur={(e) => {
                        if (e.target.value !== (p.term_start_date ?? '')) {
                          handleTermDateChange(p.id, e.target.value)
                        }
                      }}
                      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                    />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <input
                      type="checkbox"
                      checked={p.is_standard_attendee ?? false}
                      disabled={savingId === p.id}
                      onChange={() => handleToggleStandardAttendee(p.id, p.is_standard_attendee ?? false)}
                      className="h-4 w-4 rounded border-gray-300 text-navy focus:ring-navy"
                      title="Auto-add to board meeting attendance"
                    />
                  </td>
                  <td className="px-6 py-4">
                    {p.id === currentUserId ? (
                      <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        Active
                      </span>
                    ) : (
                      <button
                        onClick={() => handleToggleActive(p.id, p.is_active)}
                        disabled={savingId === p.id}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          p.is_active
                            ? 'bg-green-50 text-green-700 hover:bg-green-100'
                            : 'bg-red-50 text-red-700 hover:bg-red-100'
                        }`}
                      >
                        {p.is_active ? 'Active' : 'Inactive'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <h3 className="mb-1 text-sm font-semibold text-yellow-800">
            Pending Invites ({invites.length})
          </h3>
          <p className="mb-3 text-xs text-yellow-700">
            Awaiting first login. All pre-filled details will be applied automatically when they sign in with Google.
          </p>
          <div className="space-y-3">
            {invites.map((inv) => (
              <div key={inv.id} className="rounded-lg border border-yellow-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{inv.full_name}</span>
                    <span className="ml-2 text-xs text-gray-500">{inv.email}</span>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 capitalize">
                        {inv.role.replace('_', ' ')}
                      </span>
                      {inv.term_start_date && (
                        <span className="text-xs text-gray-500">
                          Term start: {new Date(inv.term_start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                      {inv.phone && (
                        <span className="text-xs text-gray-500">{inv.phone}</span>
                      )}
                      {inv.job_title && (
                        <span className="text-xs text-gray-500">{inv.job_title}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await supabase.from('board_invites').delete().eq('id', inv.id)
                      refetchInvites()
                    }}
                    className="shrink-0 text-xs text-red-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Use "Add Board Member" to invite members by email. When they sign in with Google, they'll automatically get the assigned role.
      </p>
    </div>
  )
}

// ---- Committees Tab ----

function CommitteesTab() {
  const { data: committees, isLoading, error, refetch } = useAllCommittees()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [hideInactive, setHideInactive] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newDriveFolderId, setNewDriveFolderId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editDriveFolderId, setEditDriveFolderId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function extractDriveFolderId(input: string): string {
    const trimmed = input.trim()
    const match = trimmed.match(/\/folders\/([A-Za-z0-9_-]+)/)
    if (match) return match[1]
    return trimmed
  }

  async function handleCreateCommittee(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase.from('committees').insert({
      name: newName.trim(),
      description: newDescription.trim() || null,
      drive_folder_id: extractDriveFolderId(newDriveFolderId) || null,
    })
    if (error) { console.error('[AdminPage] create committee failed:', error); setSaveError('Failed to create committee. Please try again.') }
    else {
      setNewName('')
      setNewDescription('')
      setNewDriveFolderId('')
      setShowNewForm(false)
      refetch()
    }
    setSaving(false)
  }

  async function handleUpdateCommittee(id: string) {
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase.from('committees').update({
      name: editName.trim(),
      description: editDescription.trim() || null,
      drive_folder_id: extractDriveFolderId(editDriveFolderId) || null,
    }).eq('id', id)
    if (error) { console.error('[AdminPage] update committee failed:', error); setSaveError('Failed to update committee. Please try again.') }
    else {
      setEditingId(null)
      refetch()
    }
    setSaving(false)
  }

  async function handleToggleActive(id: string, currentlyActive: boolean) {
    const { error } = await supabase.from('committees').update({ is_active: !currentlyActive }).eq('id', id)
    if (error) { console.error('[AdminPage] toggle committee active failed:', error); setSaveError('Failed to update committee. Please try again.') }
    else refetch()
  }

  function startEdit(committee: { id: string; name: string; description: string | null; drive_folder_id: string | null }) {
    setEditingId(committee.id)
    setEditName(committee.name)
    setEditDescription(committee.description ?? '')
    setEditDriveFolderId(committee.drive_folder_id ?? '')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setHideInactive((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            !hideInactive
              ? 'border-navy/40 bg-navy/10 text-navy'
              : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {hideInactive ? 'Show inactive' : 'Hide inactive'}
        </button>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-navy-dark"
        >
          {showNewForm ? 'Cancel' : 'New Committee'}
        </button>
      </div>

      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
          <button onClick={() => setSaveError(null)} className="ml-3 font-medium hover:text-red-900">Dismiss</button>
        </div>
      )}

      {showNewForm && (
        <form onSubmit={handleCreateCommittee} className="rounded-xl border border-gray-200 bg-white p-4 max-w-lg space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Committee Name</label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Google Drive Folder URL</label>
            <input
              type="url"
              value={newDriveFolderId}
              onChange={(e) => setNewDriveFolderId(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
            <p className="mt-1 text-xs text-gray-400">
              Paste the URL of the Drive folder. Right-click the folder in Drive → Copy link.
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-navy-dark disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Committee'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-500">Loading committees...</div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-red-500">{error}</div>
        ) : committees.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-sm text-gray-400">
            No committees yet. Create one above.
          </div>
        ) : (
          committees.filter((c) => !hideInactive || c.is_active).map((committee) => {
            const memberCount = committee.memberships?.[0]?.count ?? 0
            const isExpanded = expandedId === committee.id
            const isEditing = editingId === committee.id

            return (
              <div key={committee.id} className="rounded-xl border border-gray-200 bg-white">
                <div
                  className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(isExpanded ? null : committee.id)}
                >
                  <div className="flex-1">
                    {isEditing ? (
                      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Committee name"
                            className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Description"
                            className="rounded-lg border border-gray-300 px-2 py-1 text-sm flex-1"
                          />
                        </div>
                        <div className="flex gap-2 items-center">
                          <input
                            value={editDriveFolderId}
                            onChange={(e) => setEditDriveFolderId(e.target.value)}
                            placeholder="Drive folder URL or ID"
                            className="rounded-lg border border-gray-300 px-2 py-1 text-sm flex-1"
                          />
                          <button
                            onClick={() => handleUpdateCommittee(committee.id)}
                            disabled={saving}
                            className="bg-navy text-white rounded-lg px-3 py-1 text-xs font-medium hover:bg-navy-dark"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="border border-gray-300 rounded-lg px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className={`text-sm font-semibold ${committee.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                          {committee.name}
                        </h3>
                        {committee.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{committee.description}</p>
                        )}
                        {committee.drive_folder_id ? (
                          <p className="text-xs text-green-600 mt-0.5">Drive folder linked</p>
                        ) : (
                          <p className="text-xs text-orange-500 mt-0.5">No Drive folder linked</p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-3 ml-4" onClick={(e) => e.stopPropagation()}>
                    <span className="text-xs text-gray-400">{memberCount} members</span>
                    {!isEditing && (
                      <button
                        onClick={() => startEdit(committee)}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleActive(committee.id, committee.is_active)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        committee.is_active
                          ? 'bg-green-50 text-green-700 hover:bg-green-100'
                          : 'bg-red-50 text-red-700 hover:bg-red-100'
                      }`}
                    >
                      {committee.is_active ? 'Active' : 'Inactive'}
                    </button>
                    <span className="text-gray-300">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-6 py-4">
                    <CommitteeMembersSection committeeId={committee.id} />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ---- Committee Members Section ----

function CommitteeMembersSection({ committeeId }: { committeeId: string }) {
  const { data: members, isLoading, refetch } = useCommitteeMembers(committeeId)
  const { data: allProfiles } = useProfiles()
  const [addingMember, setAddingMember] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [selectedRole, setSelectedRole] = useState<CommitteeRole>('member')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const memberIds = new Set(members.map((m) => m.profile_id))
  const availableProfiles = allProfiles.filter((p) => !memberIds.has(p.id))

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProfileId) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('committee_memberships').insert({
      profile_id: selectedProfileId,
      committee_id: committeeId,
      role: selectedRole,
    })
    if (err) setError(err.message)
    else {
      setSelectedProfileId('')
      setSelectedRole('member')
      setAddingMember(false)
      refetch()
    }
    setSaving(false)
  }

  async function handleRoleChange(membershipId: string, role: CommitteeRole) {
    const { error: err } = await supabase
      .from('committee_memberships')
      .update({ role })
      .eq('id', membershipId)
    if (err) setError(err.message)
    else refetch()
  }

  async function handleRemove(membershipId: string, name: string) {
    if (!window.confirm(`Remove ${name} from this committee?`)) return
    const { error: err } = await supabase
      .from('committee_memberships')
      .delete()
      .eq('id', membershipId)
    if (err) setError(err.message)
    else refetch()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium uppercase text-gray-500">Members</h4>
        <button
          onClick={() => setAddingMember(!addingMember)}
          className="text-xs font-medium text-navy hover:text-navy-dark"
        >
          {addingMember ? 'Cancel' : '+ Add Member'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-600">{error}</div>
      )}

      {addingMember && (
        <form onSubmit={handleAddMember} className="flex gap-2 items-end">
          <div className="flex-1">
            <select
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              required
              className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            >
              <option value="">Select member...</option>
              {availableProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.email})
                </option>
              ))}
            </select>
          </div>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as CommitteeRole)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="member">Member</option>
            <option value="chair">Chair</option>
            <option value="ex_officio">Ex Officio</option>
          </select>
          <button
            type="submit"
            disabled={saving}
            className="bg-navy text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-navy-dark disabled:opacity-50"
          >
            Add
          </button>
        </form>
      )}

      {isLoading ? (
        <p className="text-xs text-gray-400">Loading members...</p>
      ) : members.length === 0 ? (
        <p className="text-xs text-gray-400">No members yet. Add one above.</p>
      ) : (
        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-1.5">
              <div>
                <span className="text-sm text-gray-900">{m.profile.full_name}</span>
                <span className="ml-2 text-xs text-gray-400">{m.profile.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.id, e.target.value as CommitteeRole)}
                  className="rounded border border-gray-200 px-2 py-0.5 text-xs"
                >
                  <option value="member">Member</option>
                  <option value="chair">Chair</option>
                  <option value="ex_officio">Ex Officio</option>
                </select>
                <button
                  onClick={() => handleRemove(m.id, m.profile.full_name)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
