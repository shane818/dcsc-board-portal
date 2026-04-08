import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ActionItem, ActionItemStatus, ActionItemWithAssignee } from '../types/database'

export function useActionItems(userId: string | undefined) {
  const [data, setData] = useState<ActionItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setIsLoading(false)
      return
    }

    supabase
      .from('action_items')
      .select('*')
      .eq('assignee_id', userId)
      .in('status', ['pending', 'in_progress'])
      .order('due_date', { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as ActionItem[]) ?? [])
        setIsLoading(false)
      })
  }, [userId])

  return { data, isLoading, error }
}

interface ActionItemsFilter {
  assigneeId?: string
  status?: ActionItemStatus | 'active' | 'all'
  meetingId?: string
}

export function useAllActionItems(filter: ActionItemsFilter = {}) {
  const [data, setData] = useState<ActionItemWithAssignee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    setIsLoading(true)
    let query = supabase
      .from('action_items')
      .select('*, assignee:profiles!action_items_assignee_id_fkey(full_name), creator:profiles!action_items_created_by_fkey(full_name)')

    if (filter.assigneeId) {
      query = query.eq('assignee_id', filter.assigneeId)
    }

    if (filter.status === 'active') {
      query = query.in('status', ['pending', 'in_progress'])
    } else if (filter.status && filter.status !== 'all') {
      query = query.eq('status', filter.status)
    }

    if (filter.meetingId) {
      query = query.eq('meeting_id', filter.meetingId)
    }

    query
      .order('due_date', { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setData((data as ActionItemWithAssignee[]) ?? [])
        setIsLoading(false)
      })
  }, [filter.assigneeId, filter.status, filter.meetingId, refetchCount])

  const refetch = () => setRefetchCount((c) => c + 1)

  return { data, isLoading, error, refetch }
}
