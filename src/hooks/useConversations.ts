import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ConversationWithDetails } from '../types/database'

interface UseConversationsResult {
  data: ConversationWithDetails[]
  isLoading: boolean
  error: string | null
  totalUnread: number
  refetch: () => void
}

export function useConversations(profileId: string | undefined): UseConversationsResult {
  const [data, setData] = useState<ConversationWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    if (!profileId) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    supabase
      .from('conversation_members')
      .select(`
        last_read_at,
        conversation:conversations!inner(
          id, name, committee_id, auto_created, created_by, created_at, updated_at,
          members:conversation_members(
            id, profile_id, last_read_at, joined_at,
            profile:profiles!inner(id, full_name, avatar_url)
          ),
          last_message:messages(body, created_at, sender_id)
        )
      `)
      .eq('profile_id', profileId)
      .order('updated_at', { referencedTable: 'conversations', ascending: false })
      .then(({ data: rows, error: err }) => {
        if (err) {
          setError(err.message)
          setIsLoading(false)
          return
        }

        const conversations: ConversationWithDetails[] = []

        for (const row of (rows ?? [])) {
          const conv = row.conversation as unknown as ConversationWithDetails & {
            last_message: { body: string; created_at: string; sender_id: string }[]
          }
          const msgs = (conv.last_message ?? []) as { body: string; created_at: string; sender_id: string }[]
          const sorted = [...msgs].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
          conversations.push({
            ...conv,
            last_message: sorted[0] ?? null,
            my_last_read_at: row.last_read_at,
          })
        }

        setData(conversations)
        setIsLoading(false)
      })
  }, [profileId, refetchCount])

  const totalUnread = data.reduce((sum, conv) => {
    if (!conv.last_message || !conv.my_last_read_at) return sum
    const unread = new Date(conv.last_message.created_at) > new Date(conv.my_last_read_at)
    return sum + (unread ? 1 : 0)
  }, 0)

  return { data, isLoading, error, totalUnread, refetch: () => setRefetchCount((c) => c + 1) }
}
