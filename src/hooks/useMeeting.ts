import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MeetingWithDetails } from '../types/database'

export function useMeeting(meetingId: string | undefined) {
  const [data, setData] = useState<MeetingWithDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!meetingId) {
      setIsLoading(false)
      return
    }

    supabase
      .from('meetings')
      .select('*, committee:committees(name), creator:profiles!meetings_created_by_fkey(full_name)')
      .eq('id', meetingId)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as MeetingWithDetails) ?? null)
        setIsLoading(false)
      })
  }, [meetingId])

  return { data, isLoading, error }
}
