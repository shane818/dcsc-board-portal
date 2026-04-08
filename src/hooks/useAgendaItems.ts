import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AgendaItemWithPresenter } from '../types/database'

export function useAgendaItems(meetingId: string | undefined) {
  const [data, setData] = useState<AgendaItemWithPresenter[]>([])
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
      .from('agenda_items')
      .select('*, presenter:profiles(full_name)')
      .eq('meeting_id', meetingId)
      .order('order_position')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as AgendaItemWithPresenter[]) ?? [])
        setIsLoading(false)
      })
  }, [meetingId, refetchCount])

  const refetch = () => setRefetchCount((c) => c + 1)

  return { data, isLoading, error, refetch }
}
