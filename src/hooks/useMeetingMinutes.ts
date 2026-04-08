import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MeetingMinutesWithDrafter } from '../types/database'

export function useMeetingMinutes(meetingId: string | undefined) {
  const [data, setData] = useState<MeetingMinutesWithDrafter | null>(null)
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
      .from('meeting_minutes')
      .select('*, drafter:profiles!meeting_minutes_drafted_by_fkey(full_name), approver:profiles!meeting_minutes_approved_by_fkey(full_name)')
      .eq('meeting_id', meetingId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as MeetingMinutesWithDrafter) ?? null)
        setIsLoading(false)
      })
  }, [meetingId, refetchCount])

  const refetch = () => setRefetchCount((c) => c + 1)

  return { data, isLoading, error, refetch }
}
