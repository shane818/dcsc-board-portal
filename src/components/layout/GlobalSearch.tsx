import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGlobalSearch, type SearchResults } from '../../hooks/useGlobalSearch'

type FlatResult = {
  key: string
  label: string
  sub: string
  href: string
}

function flattenResults(results: SearchResults): FlatResult[] {
  const flat: FlatResult[] = []

  results.people.forEach((p) =>
    flat.push({ key: `person-${p.id}`, label: p.full_name, sub: p.role.replace(/_/g, ' '), href: '/directory' })
  )
  results.meetings.forEach((m) =>
    flat.push({
      key: `meeting-${m.id}`,
      label: m.title,
      sub: new Date(m.meeting_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      href: `/meetings/${m.id}`,
    })
  )
  results.actionItems.forEach((a) =>
    flat.push({ key: `action-${a.id}`, label: a.title, sub: a.status.replace(/_/g, ' '), href: '/action-items' })
  )
  results.announcements.forEach((a) =>
    flat.push({
      key: `ann-${a.id}`,
      label: a.title,
      sub: new Date(a.published_at).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      href: '/announcements',
    })
  )
  results.committees.forEach((c) =>
    flat.push({ key: `comm-${c.id}`, label: c.name, sub: 'Committee', href: '/committees' })
  )

  return flat
}

const GROUP_ICONS: Record<string, string> = {
  people: '👤',
  meetings: '📅',
  actionItems: '✅',
  announcements: '📢',
  committees: '👥',
}

const GROUP_LABELS: Record<string, string> = {
  people: 'People',
  meetings: 'Meetings',
  actionItems: 'Action Items',
  announcements: 'Announcements',
  committees: 'Committees',
}

export default function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const { results, isLoading } = useGlobalSearch(query)
  const flat = flattenResults(results)
  const hasResults = flat.length > 0
  const showDropdown = open && query.length >= 2

  // Close on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIdx(0)
  }, [query])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flat[highlightIdx]
      if (item) go(item.href)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
      inputRef.current?.blur()
    }
  }

  function go(href: string) {
    navigate(href)
    setOpen(false)
    setQuery('')
  }

  // Build grouped sections
  const groups: { key: keyof typeof GROUP_LABELS; items: typeof results.people }[] = [
    { key: 'people', items: results.people as never },
    { key: 'meetings', items: results.meetings as never },
    { key: 'actionItems', items: results.actionItems as never },
    { key: 'announcements', items: results.announcements as never },
    { key: 'committees', items: results.committees as never },
  ]

  // Map flat index back to group rows for highlight styling
  let flatIdx = 0

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      {/* Input */}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm">
          🔍
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search people, meetings, actions…"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-navy/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy/20"
        />
        {isLoading && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <svg className="h-4 w-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </span>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {!isLoading && !hasResults ? (
            <p className="px-4 py-5 text-center text-sm text-gray-400">
              No results for &ldquo;{query}&rdquo;
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto py-1">
              {groups.map(({ key, items }) => {
                if (items.length === 0) return null
                return (
                  <div key={key}>
                    <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      {GROUP_ICONS[key]} {GROUP_LABELS[key]}
                    </p>
                    {items.map((_item: { id: string; [key: string]: string | null }) => {
                      const f = flat[flatIdx]
                      const isHighlighted = flatIdx === highlightIdx
                      const currentIdx = flatIdx
                      flatIdx++
                      return (
                        <button
                          key={f.key}
                          onMouseEnter={() => setHighlightIdx(currentIdx)}
                          onClick={() => go(f.href)}
                          className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                            isHighlighted ? 'bg-navy/8 text-navy' : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span className="min-w-0 flex-1 truncate font-medium">{f.label}</span>
                          <span className="shrink-0 text-xs text-gray-400 capitalize">{f.sub}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
