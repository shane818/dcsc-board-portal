import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MeetingStatus, MeetingWithDetails } from '../../types/database'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Solid marker colors per status (the list view uses the softer bg-100/text-800 pairs).
const DOT_COLORS: Record<MeetingStatus, string> = {
  scheduled: 'bg-green-500',
  in_progress: 'bg-navy',
  completed: 'bg-gray-400',
  cancelled: 'bg-red-400',
}

const LEGEND: { status: MeetingStatus; label: string }[] = [
  { status: 'scheduled', label: 'Scheduled' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'completed', label: 'Completed' },
  { status: 'cancelled', label: 'Cancelled' },
]

/** Local-time key: year-month(0-based)-day, matching how the month grid is built. */
function dayKey(year: number, month: number, day: number): string {
  return `${year}-${month}-${day}`
}

function timeLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

interface Props {
  meetings: MeetingWithDetails[]
}

export default function YearCalendar({ meetings }: Props) {
  const navigate = useNavigate()
  const now = useMemo(() => new Date(), [])
  const [year, setYear] = useState(now.getFullYear())

  // Group meetings by local calendar day.
  const byDay = useMemo(() => {
    const map = new Map<string, MeetingWithDetails[]>()
    for (const m of meetings) {
      const d = new Date(m.meeting_date)
      const key = dayKey(d.getFullYear(), d.getMonth(), d.getDate())
      const list = map.get(key)
      if (list) list.push(m)
      else map.set(key, [m])
    }
    return map
  }, [meetings])

  const yearCount = useMemo(
    () => meetings.filter((m) => new Date(m.meeting_date).getFullYear() === year).length,
    [meetings, year]
  )

  const todayKey = dayKey(now.getFullYear(), now.getMonth(), now.getDate())

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      {/* Header: title + year navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Year at a glance</h2>
          <p className="text-xs text-gray-500">
            {yearCount === 0
              ? 'No meetings scheduled this year (with the current filters).'
              : `${yearCount} meeting${yearCount === 1 ? '' : 's'} in ${year}. Click a highlighted day to open it.`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="rounded-lg border border-gray-300 px-2.5 py-1 text-sm text-gray-600 hover:bg-gray-50"
            aria-label="Previous year"
          >
            ‹
          </button>
          <span className="min-w-[3.5rem] text-center text-sm font-semibold text-gray-900">{year}</span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            className="rounded-lg border border-gray-300 px-2.5 py-1 text-sm text-gray-600 hover:bg-gray-50"
            aria-label="Next year"
          >
            ›
          </button>
          {year !== now.getFullYear() && (
            <button
              type="button"
              onClick={() => setYear(now.getFullYear())}
              className="ml-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-navy hover:bg-gray-50"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {LEGEND.map((l) => (
          <span key={l.status} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`h-2 w-2 rounded-full ${DOT_COLORS[l.status]}`} />
            {l.label}
          </span>
        ))}
      </div>

      {/* 12 month grid */}
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MONTHS.map((monthName, month) => {
          const firstWeekday = new Date(year, month, 1).getDay()
          const daysInMonth = new Date(year, month + 1, 0).getDate()
          const cells: (number | null)[] = [
            ...Array(firstWeekday).fill(null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
          ]

          return (
            <div key={month} className="rounded-lg border border-gray-100 p-3">
              <h3 className="mb-2 text-sm font-semibold text-gray-800">{monthName}</h3>
              <div className="grid grid-cols-7 gap-0.5 text-center">
                {WEEKDAYS.map((w, i) => (
                  <div key={i} className="pb-1 text-[10px] font-medium uppercase text-gray-400">
                    {w}
                  </div>
                ))}
                {cells.map((day, i) => {
                  if (day === null) return <div key={`b-${i}`} />
                  const key = dayKey(year, month, day)
                  const dayMeetings = byDay.get(key)
                  const isToday = key === todayKey

                  if (!dayMeetings) {
                    return (
                      <div
                        key={key}
                        className={`flex h-7 items-center justify-center text-xs ${
                          isToday ? 'rounded-full font-semibold text-navy ring-1 ring-navy/40' : 'text-gray-600'
                        }`}
                      >
                        {day}
                      </div>
                    )
                  }

                  const title = dayMeetings
                    .map((m) => `${timeLabel(m.meeting_date)} — ${m.title}${m.committee?.name ? ` (${m.committee.name})` : ' (Full Board)'}`)
                    .join('\n')

                  return (
                    <button
                      key={key}
                      type="button"
                      title={title}
                      onClick={() => navigate(`/meetings/${dayMeetings[0].id}`)}
                      className={`relative flex h-7 flex-col items-center justify-center rounded-md text-xs font-medium text-gray-900 hover:bg-gray-100 ${
                        isToday ? 'ring-1 ring-navy/40' : ''
                      }`}
                    >
                      <span className="leading-none">{day}</span>
                      <span className="mt-0.5 flex items-center gap-0.5">
                        {dayMeetings.slice(0, 3).map((m, j) => (
                          <span key={j} className={`h-1.5 w-1.5 rounded-full ${DOT_COLORS[m.status]}`} />
                        ))}
                        {dayMeetings.length > 3 && (
                          <span className="text-[9px] leading-none text-gray-400">+</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
