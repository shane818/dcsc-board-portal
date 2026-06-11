import { supabase } from './supabase'
import type {
  Meeting,
  Profile,
  AgendaItem,
  AgendaItemMotion,
  MeetingAttendeeWithProfile,
  MeetingFormat,
} from '../types/database'

interface DraftMinutesToReview {
  id: string
  meeting_id: string
  meeting_title: string
  meeting_date: string
}

interface TemplateInput {
  meeting: Meeting
  attendees: MeetingAttendeeWithProfile[]
  agendaItems: AgendaItem[]
  /** Board-scope motions keyed by agenda_item_id. */
  motionsByAgendaItem: Record<string, AgendaItemMotion>
  /** Committee-scope motions keyed by agenda_item_id. */
  committeeMotionsByAgendaItem: Record<string, AgendaItemMotion>
  /** Presenter display names keyed by agenda_item_id (members + guests, ordered). */
  presentersByItem: Record<string, string[]>
  profilesById: Map<string, Profile>
  pendingMinutes: DraftMinutesToReview[]
  chairProfile: Profile | undefined
}

/** Joins a list of names into "A", "A and B", or "A, B and C". */
function joinNames(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// ----- Pure formatting helpers -----

function formatLongDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase()
}

const FORMAT_LABELS: Record<MeetingFormat, string> = {
  in_person: 'In-Person',
  virtual: 'Virtual',
  hybrid: 'Hybrid',
}

function namesList(items: { name: string }[]): string {
  return items.map((i) => i.name).join(', ') || 'None'
}

function attendeeName(a: MeetingAttendeeWithProfile): { name: string; isGuest: boolean } {
  if (a.attendee_category === 'guest') {
    let n = a.guest_name ?? 'Unknown guest'
    if (a.guest_title) n = `${n}, ${a.guest_title}`
    return { name: n, isGuest: true }
  }
  return { name: a.profile?.full_name ?? 'Unknown', isGuest: false }
}

function motionLanguage(
  motion: AgendaItemMotion | undefined,
  profilesById: Map<string, Profile>
): string {
  if (!motion) return ''

  const mover = motion.motion_by ? profilesById.get(motion.motion_by)?.full_name ?? 'Unknown' : 'Unknown'
  const seconder = motion.seconded_by ? profilesById.get(motion.seconded_by)?.full_name ?? 'Unknown' : 'Unknown'

  const motionDesc = motion.notes?.trim() || 'approve the proposal'

  let result = ''
  if (motion.result === 'carried') {
    const yes = motion.yes_count ?? 0
    const no = motion.no_count ?? 0
    const abstain = motion.abstain_count ?? 0
    if (no === 0 && abstain === 0) {
      result = 'The motion was carried unanimously.'
    } else {
      const parts = [`${yes} in favor`]
      if (no > 0) parts.push(`${no} against`)
      if (abstain > 0) parts.push(`${abstain} abstaining`)
      result = `The motion was carried (${parts.join('; ')}).`
    }
  } else if (motion.result === 'failed') {
    const yes = motion.yes_count ?? 0
    const no = motion.no_count ?? 0
    result = `The motion failed (${yes} in favor; ${no} against).`
  } else if (motion.result === 'tabled') {
    result = 'The motion was tabled.'
  } else {
    result = '[Result pending]'
  }

  return `A motion to ${motionDesc} was made by ${mover} and seconded by ${seconder}. ${result}`
}

// ----- Agenda item placeholder generator -----

/** Builds a natural-language sentence for an agenda item that has no description.
 *  Reads common keywords in the title to choose the right verb phrase.
 *  `presenterName` is a pre-joined string of one or more presenters, or null. */
function buildAgendaPlaceholder(presenterName: string | null, title: string): string {
  // Determine verb phrase from title keywords
  let verbPhrase: string

  if (/financials?|financial (report|update|review)|budget|revenue|expense/i.test(title)) {
    verbPhrase = 'presented the financials'
  } else if (/\bupdate\b/i.test(title)) {
    verbPhrase = `provided an update on ${title.replace(/update/i, '').replace(/\s+/g, ' ').trim() || title}`
  } else if (/\breport\b/i.test(title)) {
    verbPhrase = `presented the ${title}`
  } else if (/\bstrategic plan|strategy\b/i.test(title)) {
    verbPhrase = `presented recommendations on ${title}`
  } else if (/\bbylaw|policy|governance\b/i.test(title)) {
    verbPhrase = `reviewed proposed changes to ${title}`
  } else if (/\belection|nomination|officer\b/i.test(title)) {
    verbPhrase = `presented the slate of nominees for ${title}`
  } else if (/\bapproval of minutes\b/i.test(title)) {
    verbPhrase = 'presented the minutes for approval'
  } else if (/\bcommittee\b/i.test(title)) {
    verbPhrase = `provided a committee update on ${title}`
  } else if (/\boperations?\b/i.test(title)) {
    verbPhrase = `provided an update on ${title}`
  } else {
    verbPhrase = `presented on ${title}`
  }

  // Build the sentence
  if (presenterName) {
    return `${presenterName} ${verbPhrase}.`
  } else {
    // Capitalize first letter
    return `${verbPhrase.charAt(0).toUpperCase()}${verbPhrase.slice(1)}.`
  }
}

// ----- Main template generator -----

export function generateMinutesMarkdown(input: TemplateInput): string {
  const {
    meeting,
    attendees,
    agendaItems,
    motionsByAgendaItem,
    committeeMotionsByAgendaItem,
    presentersByItem,
    profilesById,
    pendingMinutes,
    chairProfile,
  } = input

  // Split attendees by category and mode
  const boardAttendees = attendees.filter((a) => a.attendee_category === 'board_member')
  const staffAttendees = attendees.filter(
    (a) => a.attendee_category === 'staff' && a.attendance_mode !== 'absent'
  )
  const guestAttendees = attendees.filter((a) => a.attendee_category === 'guest')

  const boardInPerson = boardAttendees
    .filter((a) => a.attendance_mode === 'in_person')
    .map(attendeeName)
  const boardOnline = boardAttendees
    .filter((a) => a.attendance_mode === 'virtual')
    .map(attendeeName)
  const boardAbsent = boardAttendees
    .filter((a) => a.attendance_mode === 'absent')
    .map(attendeeName)

  const staffNames = staffAttendees.map(attendeeName)
  const guestNames = guestAttendees.map(attendeeName)

  const lines: string[] = []

  // ---- Header ----
  lines.push('# Board Meeting Minutes')
  lines.push('')
  lines.push(`**Date:** ${formatLongDate(meeting.meeting_date)}`)
  lines.push(`**Start Time:** ${formatTime(meeting.meeting_date)}`)
  if (meeting.meeting_format) {
    lines.push(`**Format:** ${FORMAT_LABELS[meeting.meeting_format]}`)
  }
  if (meeting.location) {
    lines.push(`**Location:** ${meeting.location}`)
  }
  lines.push('')

  // ---- Attendance ----
  lines.push('## Attendance')
  lines.push('')
  lines.push('**Board Members Present**')
  lines.push('')
  if (boardInPerson.length > 0) {
    lines.push(`In-Person: ${namesList(boardInPerson)}`)
    lines.push('')
  }
  if (boardOnline.length > 0) {
    lines.push(`Online: ${namesList(boardOnline)}`)
    lines.push('')
  }
  if (boardAbsent.length > 0) {
    lines.push(`(Not present: ${namesList(boardAbsent)})`)
    lines.push('')
  }
  if (staffNames.length > 0) {
    lines.push('**Staff Members:**')
    lines.push('')
    lines.push(namesList(staffNames))
    lines.push('')
  }
  if (guestNames.length > 0) {
    lines.push('**Guests:**')
    lines.push('')
    lines.push(namesList(guestNames))
    lines.push('')
  }

  // ---- Call to Order ----
  const chairName = chairProfile?.full_name ?? '[Chair name]'
  lines.push(
    `Chair ${chairName} called the meeting to order at ${formatTime(meeting.meeting_date)} with a quorum present.`
  )
  lines.push('')

  // ---- Approval of Prior Minutes ----
  if (pendingMinutes.length > 0) {
    lines.push('## Approval of Minutes')
    lines.push('')
    for (const pm of pendingMinutes) {
      lines.push(`### ${pm.meeting_title} — ${formatShortDate(pm.meeting_date)}`)
      lines.push('')
      lines.push(
        `A motion to approve the meeting minutes from ${formatShortDate(pm.meeting_date)} was made by [Member name] and seconded by [Member name]. The motion was carried unanimously.`
      )
      lines.push('')
    }
  }

  // ---- Agenda Items ----
  const sortedAgenda = [...agendaItems].sort((a, b) => a.order_position - b.order_position)
  for (const item of sortedAgenda) {
    lines.push(`## ${item.title}`)
    lines.push('')

    // Multiple presenters (members + guests). Fall back to legacy single presenter_id.
    let presenterNames = presentersByItem[item.id] ?? []
    if (presenterNames.length === 0 && item.presenter_id) {
      const legacy = profilesById.get(item.presenter_id)?.full_name
      if (legacy) presenterNames = [legacy]
    }
    const presenterName = presenterNames.length > 0 ? joinNames(presenterNames) : null

    if (item.description?.trim()) {
      // Use the actual description entered on the agenda item
      if (presenterName) {
        lines.push(`${presenterName} presented ${item.description.trim()}`)
      } else {
        lines.push(item.description.trim())
      }
      lines.push('')
    } else {
      // Generate a natural-language placeholder from the presenter(s) + title
      lines.push(buildAgendaPlaceholder(presenterName, item.title))
      lines.push('')
    }

    const motion = motionsByAgendaItem[item.id]
    if (motion) {
      lines.push(motionLanguage(motion, profilesById))
      lines.push('')
    }

    const committeeMotion = committeeMotionsByAgendaItem[item.id]
    if (committeeMotion) {
      lines.push(`Committee approval: ${motionLanguage(committeeMotion, profilesById)}`)
      lines.push('')
    }
  }

  // ---- Adjournment ----
  lines.push('## Meeting Adjourned')
  lines.push('')
  if (meeting.adjourned_at) {
    lines.push(`The meeting adjourned at ${formatTime(meeting.adjourned_at)}.`)
  } else {
    lines.push('The meeting adjourned at [time].')
  }

  return lines.join('\n')
}

// ----- Data fetcher: pulls everything needed and returns the markdown -----

export async function buildMinutesTemplate(meetingId: string): Promise<string> {
  // Parallel fetches
  const [meetingRes, attendeesRes, agendaRes, motionsRes, presentersRes, pendingRes, profilesRes] = await Promise.all([
    supabase.from('meetings').select('*').eq('id', meetingId).single(),
    supabase
      .from('meeting_attendees')
      .select('*, profile:profiles!profile_id(id, full_name, role, is_active)')
      .eq('meeting_id', meetingId),
    supabase.from('agenda_items').select('*').eq('meeting_id', meetingId),
    supabase
      .from('agenda_item_motions')
      .select('*, agenda_item:agenda_items!agenda_item_id(meeting_id)')
      .eq('agenda_item.meeting_id', meetingId),
    supabase
      .from('agenda_item_presenters')
      .select('agenda_item_id, profile_id, guest_name, order_position, agenda_item:agenda_items!agenda_item_id(meeting_id), profile:profiles!profile_id(full_name)')
      .eq('agenda_item.meeting_id', meetingId),
    supabase
      .from('meeting_minutes_for_review')
      .select(
        'id, minutes_id, minutes:meeting_minutes!minutes_id(id, meeting_id, meeting:meetings!meeting_id(title, meeting_date))'
      )
      .eq('reviewing_meeting_id', meetingId),
    supabase.from('profiles').select('*'),
  ])

  if (meetingRes.error || !meetingRes.data) {
    throw new Error('Failed to load meeting: ' + (meetingRes.error?.message ?? 'unknown'))
  }

  const meeting = meetingRes.data as Meeting
  const attendees = (attendeesRes.data ?? []) as MeetingAttendeeWithProfile[]
  const agendaItems = (agendaRes.data ?? []) as AgendaItem[]
  const allProfiles = (profilesRes.data ?? []) as Profile[]

  const profilesById = new Map(allProfiles.map((p) => [p.id, p]))

  // Split motions by scope, keyed by agenda_item_id
  const motionsByAgendaItem: Record<string, AgendaItemMotion> = {}
  const committeeMotionsByAgendaItem: Record<string, AgendaItemMotion> = {}
  for (const m of (motionsRes.data ?? []) as AgendaItemMotion[]) {
    if (m.vote_scope === 'committee') committeeMotionsByAgendaItem[m.agenda_item_id] = m
    else motionsByAgendaItem[m.agenda_item_id] = m
  }

  // Build presenter display-name lists keyed by agenda_item_id (ordered)
  const presentersByItem: Record<string, string[]> = {}
  const rawPresenters = ((presentersRes.data ?? []) as any[])
    .slice()
    .sort((a, b) => (a.order_position ?? 0) - (b.order_position ?? 0))
  for (const p of rawPresenters) {
    const name = p.guest_name ?? p.profile?.full_name
    if (!name) continue
    if (!presentersByItem[p.agenda_item_id]) presentersByItem[p.agenda_item_id] = []
    presentersByItem[p.agenda_item_id].push(name)
  }

  // Flatten pending minutes
  const pendingMinutes: DraftMinutesToReview[] = ((pendingRes.data ?? []) as any[])
    .map((r) => ({
      id: r.minutes_id,
      meeting_id: r.minutes?.meeting_id,
      meeting_title: r.minutes?.meeting?.title ?? 'Untitled meeting',
      meeting_date: r.minutes?.meeting?.meeting_date ?? '',
    }))
    .sort((a, b) => new Date(a.meeting_date).getTime() - new Date(b.meeting_date).getTime())

  // Find chair: from this meeting's attendees who has role=chair
  const chairProfile = allProfiles.find((p) => p.role === 'chair' && p.is_active)

  return generateMinutesMarkdown({
    meeting,
    attendees,
    agendaItems,
    motionsByAgendaItem,
    committeeMotionsByAgendaItem,
    presentersByItem,
    profilesById,
    pendingMinutes,
    chairProfile,
  })
}
