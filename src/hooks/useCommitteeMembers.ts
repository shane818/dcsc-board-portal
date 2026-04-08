import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CommitteeMembership } from '../types/database'

export interface MembershipWithProfile extends CommitteeMembership {
  profile: { full_name: string; email: string; role: string }
}

export function useCommitteeMembers(committeeId: string | null) {
  const [data, setData] = useState<MembershipWithProfile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    if (!committeeId) {
      setData([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    supabase
      .from('committee_memberships')
      .select('*, profile:profiles(full_name, email, role)')
      .eq('committee_id', committeeId)
      .order('role')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as MembershipWithProfile[]) ?? [])
        setIsLoading(false)
      })
  }, [committeeId, refetchCount])

  const refetch = () => setRefetchCount((c) => c + 1)

  return { data, isLoading, error, refetch }
}
