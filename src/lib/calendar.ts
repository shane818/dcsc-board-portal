import { supabase } from './supabase'

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
  const { data, error } = await supabase.functions.invoke('calendar', {
    body: params,
    headers: { 'x-action': 'create' },
  })

  if (error) {
    throw new Error(error.message || 'Failed to invoke calendar function')
  }

  if (!data?.eventId) {
    throw new Error(data?.error || 'Unexpected response from calendar function')
  }

  return data as CreateCalendarEventResult
}
