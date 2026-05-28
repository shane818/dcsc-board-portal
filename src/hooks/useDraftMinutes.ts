import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface DraftMinutesSummary {
  id: string
  meeting_id: string
  meeting_title: string
  meeting_date: string
  status: 'draft' | 'approved'
}

interface UseDraftMinutesResult {
  data: DraftMinutesSummary[]
  isLoading: boolean
  error: string | null
}

/** Fetches all draft (unapproved) meeting minutes from past meetings.
 *  Used in the Meeting Form to let officers attach pending drafts for review.
 *  Optional `excludeMeetingId` skips drafts that belong to the meeting being edited. */
export function useDraftMinutes(excludeMeetingId?: string): UseDraftMinutesResult {
  const [data, setData] = useState<DraftMinutesSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIsLoading(true)
    supabase
      .from('meeting_minutes')
      .select('id, meeting_id, status, meeting:meetings!meeting_id(title, meeting_date)')
      .eq('status', 'draft')
      .then(({ data: rows, error: err }) => {
        if (err) {
          setError(err.message)
          setIsLoading(false)
          return
        }
        const flat: DraftMinutesSummary[] = (rows ?? [])
          .map((r: any) => ({
            id: r.id,
            meeting_id: r.meeting_id,
            meeting_title: r.meeting?.title ?? 'Untitled meeting',
            meeting_date: r.meeting?.meeting_date ?? '',
            status: r.status,
          }))
          .filter((r) => r.meeting_id !== excludeMeetingId)
          .sort((a, b) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime())
        setData(flat)
        setIsLoading(false)
      })
  }, [excludeMeetingId])

  return { data, isLoading, error }
}
