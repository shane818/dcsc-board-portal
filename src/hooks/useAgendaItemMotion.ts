import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { AgendaItemMotion, AgendaItemRollCall, VoteScope } from '../types/database'

export function useAgendaItemMotion(
  agendaItemId: string | undefined,
  scope: VoteScope = 'board'
) {
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
        .eq('vote_scope', scope)
        .maybeSingle(),
      supabase
        .from('agenda_item_roll_calls')
        .select('*')
        .eq('agenda_item_id', agendaItemId)
        .eq('vote_scope', scope),
    ]).then(([motionResult, rollCallResult]) => {
      setMotion((motionResult.data as AgendaItemMotion) ?? null)
      setRollCalls((rollCallResult.data as AgendaItemRollCall[]) ?? [])
      setIsLoading(false)
    })
  }, [agendaItemId, scope, refetchCount])

  return { motion, rollCalls, isLoading, refetch: () => setRefetchCount((c) => c + 1) }
}
