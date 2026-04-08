import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MeetingStatus, MeetingWithCommittee, MeetingWithDetails } from '../types/database'

export function useMeetings(limit = 5) {
  const [data, setData] = useState<MeetingWithCommittee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('meetings')
      .select('*, committee:committees(name)')
      .gte('meeting_date', new Date().toISOString())
      .order('meeting_date', { ascending: true })
      .limit(limit)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as MeetingWithCommittee[]) ?? [])
        setIsLoading(false)
      })
  }, [limit])

  return { data, isLoading, error }
}

interface MeetingsFilter {
  committeeId?: string | null
  status?: MeetingStatus | 'all'
  upcoming?: boolean
  limit?: number
}

export function useFilteredMeetings(filter: MeetingsFilter = {}) {
  const [data, setData] = useState<MeetingWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let query = supabase
      .from('meetings')
      .select('*, committee:committees(name), creator:profiles!meetings_created_by_fkey(full_name)')

    if (filter.committeeId === 'board') {
      query = query.is('committee_id', null)
    } else if (filter.committeeId) {
      query = query.eq('committee_id', filter.committeeId)
    }

    if (filter.status && filter.status !== 'all') {
      query = query.eq('status', filter.status)
    }

    if (filter.upcoming) {
      query = query.gte('meeting_date', new Date().toISOString())
    }

    // Upcoming: soonest first (ascending). Past: most recent first (descending).
    query = query.order('meeting_date', { ascending: filter.upcoming !== false })

    if (filter.limit) {
      query = query.limit(filter.limit)
    }

    query.then(({ data, error }) => {
      if (error) setError(error.message)
      else setData((data as MeetingWithDetails[]) ?? [])
      setIsLoading(false)
    })
  }, [filter.committeeId, filter.status, filter.upcoming, filter.limit])

  return { data, isLoading, error }
}
