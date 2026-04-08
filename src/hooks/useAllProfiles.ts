import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'

export function useAllProfiles(activeOnly = false) {
  const [data, setData] = useState<Profile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    setIsLoading(true)
    let query = supabase.from('profiles').select('*').order('full_name')
    if (activeOnly) query = query.eq('is_active', true)
    query.then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as Profile[]) ?? [])
        setIsLoading(false)
      })
  }, [refetchCount, activeOnly])

  const refetch = () => setRefetchCount((c) => c + 1)

  return { data, isLoading, error, refetch }
}
