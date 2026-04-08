import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { MessageWithSender } from '../types/database'

interface UseMessagesResult {
  data: MessageWithSender[]
  isLoading: boolean
  error: string | null
  sendMessage: (body: string) => Promise<void>
}

export function useMessages(
  conversationId: string | undefined,
  profileId: string | undefined
): UseMessagesResult {
  const [data, setData] = useState<MessageWithSender[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!conversationId || !profileId) {
      setData([])
      return
    }

    setIsLoading(true)
    setError(null)

    // Initial fetch
    supabase
      .from('messages')
      .select('*, sender:profiles!sender_id(id, full_name, avatar_url)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .then(({ data: rows, error: err }) => {
        if (err) setError(err.message)
        else setData((rows as MessageWithSender[]) ?? [])
        setIsLoading(false)
      })

    // Mark conversation as read
    supabase
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('profile_id', profileId)
      .then(() => {})

    // Realtime subscription for new messages
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          // Fetch sender profile for the new message
          const { data: senderData } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .eq('id', payload.new.sender_id)
            .single()

          const newMsg: MessageWithSender = {
            ...(payload.new as MessageWithSender),
            sender: senderData ?? { id: payload.new.sender_id, full_name: 'Unknown', avatar_url: null },
          }

          setData((prev) => {
            // Avoid duplicates if sender's own message arrives via Realtime after optimistic insert
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })

          // Mark as read immediately if this is our conversation
          supabase
            .from('conversation_members')
            .update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .eq('profile_id', profileId)
            .then(() => {})
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [conversationId, profileId])

  async function sendMessage(body: string): Promise<void> {
    if (!conversationId || !profileId || !body.trim()) return
    const { error: err } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: profileId,
      body: body.trim(),
    })
    if (err) setError(err.message)
  }

  return { data, isLoading, error, sendMessage }
}
