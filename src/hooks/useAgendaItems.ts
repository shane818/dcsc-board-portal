import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AgendaItemWithPresenter } from '../types/database'

export function useAgendaItems(meetingId: string | undefined) {
  const [data, setData] = useState<AgendaItemWithPresenter[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    if (!meetingId) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    supabase
      .from('agenda_items')
      .select(
        '*, presenter:profiles(full_name), presenters:agenda_item_presenters(profile_id, guest_name, order_position, profile:profiles(full_name))'
      )
      .eq('meeting_id', meetingId)
      .order('order_position')
      .then(({ data, error }) => {
        if (error) {
          setError(error.message)
        } else {
          const mapped: AgendaItemWithPresenter[] = ((data as any[]) ?? []).map((row) => {
            const rawPresenters = (row.presenters ?? []) as Array<{
              profile_id: string | null
              guest_name: string | null
              order_position: number
              profile: { full_name: string } | null
            }>
            const presenters = rawPresenters
              .sort((a, b) => a.order_position - b.order_position)
              .map((p) => ({
                profile_id: p.profile_id,
                guest_name: p.guest_name,
                full_name: p.guest_name ?? p.profile?.full_name ?? 'Unknown',
              }))
            return { ...row, presenters } as AgendaItemWithPresenter
          })
          setData(mapped)
        }
        setIsLoading(false)
      })
  }, [meetingId, refetchCount])

  const refetch = () => setRefetchCount((c) => c + 1)

  return { data, isLoading, error, refetch }
}
