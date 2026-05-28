import type { Meeting, AgendaItemWithPresenter, MeetingFormat } from '../types/database'

const FORMAT_PHRASES: Record<MeetingFormat, string> = {
  in_person: 'in person',
  virtual: 'online',
  hybrid: 'in person and online',
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase()
}

/** Builds a plain-text email summarizing a meeting agenda for the board.
 *  Designed to be copied and pasted into an email client. */
export function buildMeetingSummary(
  meeting: Meeting,
  agendaItems: AgendaItemWithPresenter[]
): string {
  const lines: string[] = []

  // Greeting
  lines.push('Dear Board Members,')
  lines.push('')

  // Intro with logistics
  const dateStr = formatLongDate(meeting.meeting_date)
  const timeStr = formatTime(meeting.meeting_date)
  const formatPhrase = meeting.meeting_format
    ? FORMAT_PHRASES[meeting.meeting_format]
    : null

  let intro = `Our next board meeting will be held on ${dateStr} at ${timeStr}`
  if (formatPhrase) {
    intro += `, ${formatPhrase}`
  }
  intro += '.'
  lines.push(intro)

  // Location line (if provided)
  if (meeting.location) {
    if (meeting.meeting_format === 'virtual') {
      lines.push(`Join link / details: ${meeting.location}`)
    } else {
      lines.push(`Location: ${meeting.location}`)
    }
  }
  lines.push('')

  // Agenda summary
  const sorted = [...agendaItems].sort((a, b) => a.order_position - b.order_position)
  if (sorted.length === 0) {
    lines.push('The agenda is still being finalized; details to follow.')
  } else {
    lines.push('Here is a summary of what we will cover:')
    lines.push('')
    sorted.forEach((item, idx) => {
      const presenter = item.presenter?.full_name
      let header = `${idx + 1}. ${item.title}`
      if (presenter) header += ` (${presenter})`
      lines.push(header)
      if (item.description?.trim()) {
        lines.push(`   ${item.description.trim()}`)
      }
      lines.push('')
    })
  }

  // Closing
  lines.push('Please review the materials posted in the board portal ahead of the meeting.')
  lines.push('Looking forward to seeing everyone there.')
  lines.push('')
  lines.push('Best regards,')

  return lines.join('\n')
}
