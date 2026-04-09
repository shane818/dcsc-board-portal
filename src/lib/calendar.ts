const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1/calendar`

export interface CreateCalendarEventParams {
  meetingId: string
  title: string
  description: string | null
  location: string | null
  startIso: string
  endIso: string
  attendeeEmails: string[]
}

export interface CreateCalendarEventResult {
  eventId: string
  eventLink: string
}

export async function createCalendarEvent(
  params: CreateCalendarEventParams,
  accessToken: string
): Promise<CreateCalendarEventResult> {
  const res = await fetch(`${FUNCTIONS_BASE}?action=create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed with status ${res.status}`)
  }

  return data as CreateCalendarEventResult
}
