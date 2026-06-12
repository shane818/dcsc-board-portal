import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MeetingNotes } from '../types/database'

export function useMeetingNotes(meetingId: string | undefined) {
  const [data, setData] = useState<MeetingNotes | null>(null)
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
      .from('meeting_notes')
      .select('*')
      .eq('meeting_id', meetingId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as MeetingNotes) ?? null)
        setIsLoading(false)
      })
  }, [meetingId, refetchCount])

  const refetch = () => setRefetchCount((c) => c + 1)

  return { data, isLoading, error, refetch }
}
