import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { MeetingAttendeeWithProfile } from '../types/database'

export function useMeetingAttendees(meetingId: string | undefined) {
  const [data, setData] = useState<MeetingAttendeeWithProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    if (!meetingId) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    supabase
      .from('meeting_attendees')
      .select(`
        *,
        profile:profiles(full_name, role, job_title)
      `)
      .eq('meeting_id', meetingId)
      .order('attendee_category')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as MeetingAttendeeWithProfile[]) ?? [])
        setIsLoading(false)
      })
  }, [meetingId, refetchCount])

  return { data, isLoading, error, refetch: () => setRefetchCount((c) => c + 1) }
}
