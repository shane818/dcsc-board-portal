import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ServiceHistoryEntry } from '../types/database'

export function useServiceHistory(profileId: string | null) {
  const [data, setData] = useState<ServiceHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    if (!profileId) {
      setData([])
      return
    }
    setIsLoading(true)
    supabase
      .from('board_service_history')
      .select('*, committee:committees(name)')
      .eq('profile_id', profileId)
      .order('fiscal_year', { ascending: false })
      .then(({ data }) => {
        setData((data as ServiceHistoryEntry[]) ?? [])
        setIsLoading(false)
      })
  }, [profileId, refetchCount])

  return { data, isLoading, refetch: () => setRefetchCount((c) => c + 1) }
}
