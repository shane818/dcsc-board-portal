import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Committee } from '../types/database'

export interface CommitteeWithCount extends Committee {
  memberships: { count: number }[]
}

export function useAllCommittees() {
  const [data, setData] = useState<CommitteeWithCount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    setIsLoading(true)
    supabase
      .from('committees')
      .select('*, memberships:committee_memberships(count)')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as CommitteeWithCount[]) ?? [])
        setIsLoading(false)
      })
  }, [refetchCount])

  const refetch = () => setRefetchCount((c) => c + 1)

  return { data, isLoading, error, refetch }
}
