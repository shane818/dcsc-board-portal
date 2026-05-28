import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface PendingMinutesEntry {
  link_id: string             // meeting_minutes_for_review.id
  minutes_id: string          // meeting_minutes.id (the draft itself)
  meeting_id: string          // the meeting the minutes belong to
  meeting_title: string
  meeting_date: string
  content: string             // markdown draft content
  drafter_name: string | null
  status: 'draft' | 'approved'
}

interface UsePendingMinutesResult {
  data: PendingMinutesEntry[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/** Fetches draft minutes linked to a future meeting for review/approval.
 *  Used by the meeting detail page to show "Pending Minutes for Approval". */
export function usePendingMinutesForReview(
  reviewingMeetingId: string | undefined
): UsePendingMinutesResult {
  const [data, setData] = useState<PendingMinutesEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    if (!reviewingMeetingId) {
      setData([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    supabase
      .from('meeting_minutes_for_review')
      .select(`
        id,
        minutes_id,
        minutes:meeting_minutes!minutes_id(
          id, content, status, meeting_id,
          drafter:profiles!drafted_by(full_name),
          meeting:meetings!meeting_id(title, meeting_date)
        )
      `)
      .eq('reviewing_meeting_id', reviewingMeetingId)
      .then(({ data: rows, error: err }) => {
        if (err) {
          setError(err.message)
          setIsLoading(false)
          return
        }
        const flat: PendingMinutesEntry[] = ((rows ?? []) as any[])
          .map((r) => ({
            link_id: r.id,
            minutes_id: r.minutes_id,
            meeting_id: r.minutes?.meeting_id ?? '',
            meeting_title: r.minutes?.meeting?.title ?? 'Untitled',
            meeting_date: r.minutes?.meeting?.meeting_date ?? '',
            content: r.minutes?.content ?? '',
            drafter_name: r.minutes?.drafter?.full_name ?? null,
            status: r.minutes?.status ?? 'draft',
          }))
          .sort((a, b) => new Date(a.meeting_date).getTime() - new Date(b.meeting_date).getTime())
        setData(flat)
        setIsLoading(false)
      })
  }, [reviewingMeetingId, refetchCount])

  return { data, isLoading, error, refetch: () => setRefetchCount((c) => c + 1) }
}
