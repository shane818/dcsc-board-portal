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
      .select('*')
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as BoardRosterEntry[]) ?? [])
        setIsLoading(false)
      })
  }, [refetchCount])

  const refetch = () => setRefetchCount((c) => c + 1)

  return { data, isLoading, error, refetch }
}
