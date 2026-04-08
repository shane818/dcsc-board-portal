import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CommitteeMembershipWithCommittee } from '../types/database'

export function useCommittees(userId: string | undefined) {
  const [data, setData] = useState<CommitteeMembershipWithCommittee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setIsLoading(false)
      return
    }

    supabase
      .from('committee_memberships')
      .select('*, committee:committees(*)')
      .eq('profile_id', userId)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as CommitteeMembershipWithCommittee[]) ?? [])
        setIsLoading(false)
      })
  }, [userId])

  return { data, isLoading, error }
}
