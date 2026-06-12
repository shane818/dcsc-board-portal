import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BoardRosterEntry } from '../types/database'

export function useBoardRoster() {
  const [data, setData] = useState<BoardRosterEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    setIsLoading(true)
    supabase
      .from('board_roster')
      .select(
        '*, profile:profiles!board_roster_profile_id_fkey(invite_pending)'
      )
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message)
        } else {
          const mapped: BoardRosterEntry[] = ((data as any[]) ?? []).map((row) => {
            let account_status: BoardRosterEntry['account_status'] = 'none'
            if (row.profile_id) {
              account_status = row.profile?.invite_pending ? 'pending' : 'active'
            }
            const { profile: _p, ...rest } = row
            return { ...(rest as BoardRosterEntry), account_status }
          })
          setData(mapped)
        }
        setIsLoading(false)
      })
  }, [refetchCount])

  const refetch = () => setRefetchCount((c) => c + 1)

  return { data, isLoading, error, refetch }
}
