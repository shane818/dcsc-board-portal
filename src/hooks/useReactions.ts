import { useEffect, useRef, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { MessageReaction, ReactionGroup } from '../types/database'

interface ProfileName {
  id: string
  full_name: string
}

interface UseReactionsResult {
  /** Map of messageId → grouped reactions */
  reactions: Record<string, ReactionGroup[]>
  /** Toggle a reaction: adds if not present, removes if already reacted */
  toggleReaction: (messageId: string, emoji: string) => Promise<void>
}

export function useReactions(
  conversationId: string | undefined,
  profileId: string | undefined,
  messageIds: string[]
): UseReactionsResult {
  const [rawReactions, setRawReactions] = useState<
    (MessageReaction & { profile: ProfileName })[]
  >([])
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Fetch all reactions for the current conversation's messages
  useEffect(() => {
    if (!conversationId || messageIds.length === 0) {
      setRawReactions([])
      return
    }

    supabase
      .from('message_reactions')
      .select('*, profile:profiles!profile_id(id, full_name)')
      .in('message_id', messageIds)
      .then(({ data }) => {
        if (data) setRawReactions(data as (MessageReaction & { profile: ProfileName })[])
      })

    // Realtime subscription for reaction changes
    const channel = supabase
      .channel(`reactions:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as { id: string }
            setRawReactions((prev) => prev.filter((r) => r.id !== old.id))
          } else {
            // INSERT — fetch profile name
            const newRow = payload.new as MessageReaction
            // Only care about messages in current conversation
            if (!messageIds.includes(newRow.message_id)) return

            const { data: profileData } = await supabase
              .from('profiles')
              .select('id, full_name')
              .eq('id', newRow.profile_id)
              .single()

            const enriched = {
              ...newRow,
              profile: profileData ?? { id: newRow.profile_id, full_name: 'Unknown' },
            }

            setRawReactions((prev) => {
              if (prev.some((r) => r.id === enriched.id)) return prev
              return [...prev, enriched]
            })
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messageIds.join(',')])

  // Group reactions by message + emoji
  const reactions: Record<string, ReactionGroup[]> = {}
  for (const r of rawReactions) {
    if (!reactions[r.message_id]) reactions[r.message_id] = []
    const group = reactions[r.message_id].find((g) => g.emoji === r.emoji)
    if (group) {
      group.count++
      group.profiles.push(r.profile.full_name)
      if (r.profile_id === profileId) group.reacted = true
    } else {
      reactions[r.message_id].push({
        emoji: r.emoji,
        count: 1,
        reacted: r.profile_id === profileId,
        profiles: [r.profile.full_name],
      })
    }
  }

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!profileId) return

      // Check if already reacted
      const existing = rawReactions.find(
        (r) => r.message_id === messageId && r.profile_id === profileId && r.emoji === emoji
      )

      if (existing) {
        // Remove reaction (optimistic)
        setRawReactions((prev) => prev.filter((r) => r.id !== existing.id))
        await supabase.from('message_reactions').delete().eq('id', existing.id)
      } else {
        // Add reaction (optimistic)
        const optimisticId = crypto.randomUUID()
        const optimistic = {
          id: optimisticId,
          message_id: messageId,
          profile_id: profileId,
          emoji,
          created_at: new Date().toISOString(),
          profile: { id: profileId, full_name: '' }, // will be corrected by realtime
        }
        setRawReactions((prev) => [...prev, optimistic])

        const { data, error } = await supabase
          .from('message_reactions')
          .insert({ message_id: messageId, profile_id: profileId, emoji })
          .select('id')
          .single()

        if (error) {
          // Rollback optimistic
          setRawReactions((prev) => prev.filter((r) => r.id !== optimisticId))
        } else if (data) {
          // Replace optimistic id with real id
          setRawReactions((prev) =>
            prev.map((r) => (r.id === optimisticId ? { ...r, id: data.id } : r))
          )
        }
      }
    },
    [profileId, rawReactions]
  )

  return { reactions, toggleReaction }
}
