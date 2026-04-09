import { supabase } from './supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

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
  params: CreateCalendarEventParams
): Promise<CreateCalendarEventResult> {
  // Get the current session token (auto-refreshed by Supabase client)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/calendar?action=create`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    }
  )

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error ?? `Request failed with status ${res.status}`)
  }

  return data as CreateCalendarEventResult
}
