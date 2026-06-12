import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useBoardRoster } from '../../hooks/useBoardRoster'
import type { BoardRosterEntry } from '../../types/database'

type View = 'table' | 'matrix' | 'grouped'

const TERM_LABEL: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' }

function termBadgeClasses(term: number | null): string {
  if (term === 3) return 'bg-amber-100 text-amber-800' // final term
  if (term === 2) return 'bg-blue-100 text-blue-800'
  if (term === 1) return 'bg-green-100 text-green-800'
  return 'bg-gray-100 text-gray-500'
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function fullName(e: BoardRosterEntry): string {
  return `${e.first_name} ${e.last_name}`.trim()
}

const ACCOUNT_BADGE: Record<NonNullable<BoardRosterEntry['account_status']>, { label: string; cls: string; title: string }> = {
  active: { label: 'Active', cls: 'bg-green-100 text-green-800', title: 'Has logged into the portal' },
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800', title: 'Invited — has not logged in yet' },
  none: { label: 'No account', cls: 'bg-gray-100 text-gray-500', title: 'No portal login account linked' },
}

interface Props {
  editable: boolean
}

export default function BoardRosterChart({ editable }: Props) {
  const { data: roster, isLoading, refetch } = useBoardRoster()
  const [view, setView] = useState<View>('table')

  // Edit form state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<Partial<BoardRosterEntry>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sorted = [...roster].sort((a, b) => a.sort_order - b.sort_order)

  // Distinct committees (for matrix columns + grouped view)
  const committees = Array.from(
    new Set(sorted.map((e) => e.committee).filter(Boolean) as string[])
  ).sort()

  function startEdit(e: BoardRosterEntry) {
    setEditingId(e.id)
    setShowAdd(false)
    setForm({ ...e })
    setError(null)
  }

  function startAdd() {
    setShowAdd(true)
    setEditingId(null)
    setForm({
      first_name: '',
      last_name: '',
      sort_order: (sorted[sorted.length - 1]?.sort_order ?? 0) + 1,
      is_active: true,
    })
    setError(null)
  }

  function cancelForm() {
    setEditingId(null)
    setShowAdd(false)
    setForm({})
    setError(null)
  }

  async function saveForm() {
    if (!form.first_name?.trim() || !form.last_name?.trim()) {
      setError('First and last name are required.')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      first_name: form.first_name?.trim(),
      last_name: form.last_name?.trim(),
      joined_date: form.joined_date || null,
      term_expiration: form.term_expiration || null,
      term_number: form.term_number ?? null,
      committee: form.committee?.trim() || null,
      leadership: form.leadership?.trim() || null,
      sort_order: form.sort_order ?? 0,
    }
    const res = editingId
      ? await supabase.from('board_roster').update(payload).eq('id', editingId)
      : await supabase.from('board_roster').insert(payload)
    if (res.error) setError(res.error.message)
    else {
      cancelForm()
      refetch()
    }
    setSaving(false)
  }

  async function remove(e: BoardRosterEntry) {
    if (!window.confirm(`Remove ${fullName(e)} from the roster?`)) return
    const { error } = await supabase.from('board_roster').delete().eq('id', e.id)
    if (error) setError(error.message)
    else refetch()
  }

  if (isLoading) {
    return <p className="text-sm text-gray-400">Loading roster…</p>
  }

  return (
    <div className="space-y-4">
      {/* View toggle + add */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
          {(['table', 'matrix', 'grouped'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                view === v ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {v === 'table' ? 'Roster' : v === 'matrix' ? 'Committee Matrix' : 'By Committee'}
            </button>
          ))}
        </div>
        {editable && !showAdd && !editingId && (
          <button
            onClick={startAdd}
            className="rounded-lg bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-dark"
          >
            + Add Member
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Add/Edit form */}
      {(showAdd || editingId) && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="First name *"
              value={form.first_name ?? ''} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Last name *"
              value={form.last_name ?? ''} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            <label className="text-xs text-gray-600">Joined
              <input type="date" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.joined_date ?? ''} onChange={(e) => setForm({ ...form, joined_date: e.target.value })} />
            </label>
            <label className="text-xs text-gray-600">Term expiration
              <input type="date" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.term_expiration ?? ''} onChange={(e) => setForm({ ...form, term_expiration: e.target.value })} />
            </label>
            <label className="text-xs text-gray-600">Term #
              <select className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.term_number ?? ''} onChange={(e) => setForm({ ...form, term_number: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                <option value="1">1st</option>
                <option value="2">2nd</option>
                <option value="3">3rd</option>
              </select>
            </label>
            <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Committee"
              value={form.committee ?? ''} onChange={(e) => setForm({ ...form, committee: e.target.value })} />
            <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Leadership role"
              value={form.leadership ?? ''} onChange={(e) => setForm({ ...form, leadership: e.target.value })} />
            <label className="text-xs text-gray-600">Sort order
              <input type="number" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={form.sort_order ?? 0} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={saveForm} disabled={saving}
              className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-50">
              {saving ? 'Saving…' : editingId ? 'Update' : 'Add'}
            </button>
            <button onClick={cancelForm}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ---- Roster table ---- */}
      {view === 'table' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Joined</th>
                <th className="px-3 py-2">Term Exp.</th>
                <th className="px-3 py-2">Term</th>
                <th className="px-3 py-2">Committee</th>
                <th className="px-3 py-2">Leadership</th>
                <th className="px-3 py-2">Account</th>
                {editable && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400">{e.sort_order}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{fullName(e)}</td>
                  <td className="px-3 py-2 text-gray-600">{fmtDate(e.joined_date)}</td>
                  <td className="px-3 py-2 text-gray-600">{fmtDate(e.term_expiration)}</td>
                  <td className="px-3 py-2">
                    {e.term_number ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${termBadgeClasses(e.term_number)}`}>
                        {TERM_LABEL[e.term_number]}{e.term_number === 3 ? ' (final)' : ''}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{e.committee ?? '—'}</td>
                  <td className="px-3 py-2">
                    {e.leadership ? (
                      <span className="rounded-full bg-navy/10 px-2 py-0.5 text-xs font-medium text-navy">
                        {e.leadership}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {(() => {
                      const s = ACCOUNT_BADGE[e.account_status ?? 'none']
                      return (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`} title={s.title}>
                          {s.label}
                        </span>
                      )
                    })()}
                  </td>
                  {editable && (
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <button onClick={() => startEdit(e)} className="text-xs text-navy hover:text-navy-dark">Edit</button>
                      <button onClick={() => remove(e)} className="ml-3 text-xs text-gray-400 hover:text-red-500">Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Committee matrix ---- */}
      {view === 'matrix' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-3 py-2 sticky left-0 bg-white">Member</th>
                {committees.map((c) => (
                  <th key={c} className="px-2 py-2 text-center">{c}</th>
                ))}
                <th className="px-3 py-2 text-center">Leadership</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900 sticky left-0 bg-white">{fullName(e)}</td>
                  {committees.map((c) => (
                    <td key={c} className="px-2 py-2 text-center">
                      {e.committee === c ? (
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-navy" title={`${fullName(e)} — ${c}`} />
                      ) : (
                        <span className="text-gray-200">·</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center text-xs text-navy">{e.leadership ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-400">
            ● = committee assignment. Each member is recorded with one primary committee.
          </p>
        </div>
      )}

      {/* ---- Grouped by committee ---- */}
      {view === 'grouped' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {committees.map((c) => {
            const members = sorted.filter((e) => e.committee === c)
            return (
              <div key={c} className="rounded-lg border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-900">{c}</h4>
                <p className="text-xs text-gray-400 mb-2">{members.length} member{members.length !== 1 ? 's' : ''}</p>
                <ul className="space-y-1">
                  {members.map((e) => (
                    <li key={e.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{fullName(e)}</span>
                      {e.leadership && (
                        <span className="rounded-full bg-navy/10 px-1.5 py-0.5 text-[10px] font-medium text-navy">
                          {e.leadership}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          {/* Members with no committee */}
          {sorted.some((e) => !e.committee) && (
            <div className="rounded-lg border border-dashed border-gray-200 p-4">
              <h4 className="text-sm font-semibold text-gray-500">No committee</h4>
              <ul className="mt-2 space-y-1">
                {sorted.filter((e) => !e.committee).map((e) => (
                  <li key={e.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{fullName(e)}</span>
                    {e.leadership && (
                      <span className="rounded-full bg-navy/10 px-1.5 py-0.5 text-[10px] font-medium text-navy">
                        {e.leadership}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
