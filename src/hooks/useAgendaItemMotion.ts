import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { AgendaItemMotion, AgendaItemRollCall } from '../types/database'

export function useAgendaItemMotion(agendaItemId: string | undefined) {
  const [motion, setMotion] = useState<AgendaItemMotion | null>(null)
  const [rollCalls, setRollCalls] = useState<AgendaItemRollCall[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    if (!agendaItemId) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    Promise.all([
      supabase
        .from('agenda_item_motions')
        .select('*')
        .eq('agenda_item_id', agendaItemId)
        .maybeSingle(),
      supabase
        .from('agenda_item_roll_calls')
        .select('*')
        .eq('agenda_item_id', agendaItemId),
    ]).then(([motionResult, rollCallResult]) => {
      setMotion((motionResult.data as AgendaItemMotion) ?? null)
      setRollCalls((rollCallResult.data as AgendaItemRollCall[]) ?? [])
      setIsLoading(false)
    })
  }, [agendaItemId, refetchCount])

  return { motion, rollCalls, isLoading, refetch: () => setRefetchCount((c) => c + 1) }
}
