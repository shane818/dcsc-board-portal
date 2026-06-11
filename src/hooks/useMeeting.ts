import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MeetingWithDetails } from '../types/database'

export function useMeeting(meetingId: string | undefined) {
  const [data, setData] = useState<MeetingWithDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    if (!meetingId) {
      setIsLoading(false)
      return
    }

    supabase
      .from('meetings')
      .select(
        '*, committee:committees(name), creator:profiles!meetings_created_by_fkey(full_name), minute_taker:profiles!meetings_minute_taker_id_fkey(full_name)'
      )
      .eq('id', meetingId)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as MeetingWithDetails) ?? null)
        setIsLoading(false)
      })
  }, [meetingId, refetchCount])

  const refetch = () => setRefetchCount((c) => c + 1)

  return { data, isLoading, error, refetch }
}
