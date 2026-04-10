import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useConversations } from '../hooks/useConversations'
import { useMessages } from '../hooks/useMessages'
import { useReactions } from '../hooks/useReactions'
import { useProfiles } from '../hooks/useProfiles'
import type { ConversationWithDetails, ReactionGroup } from '../types/database'

const QUICK_EMOJIS = ['\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F602}', '\u{1F389}', '\u{1F440}', '\u{2705}']

// ---- Mention utilities ----

const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g

function renderMessageBody(body: string, currentUserId: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  MENTION_REGEX.lastIndex = 0
  while ((match = MENTION_REGEX.exec(body)) !== null) {
    const [fullMatch, name, uuid] = match
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index))
    }
    const isMe = uuid === currentUserId
    parts.push(
      <span
        key={match.index}
        className={`font-semibold rounded px-0.5 ${
          isMe ? 'bg-yellow-100 text-yellow-800' : 'bg-white/20 underline'
        }`}
      >
        @{name}
      </span>
    )
    lastIndex = match.index + fullMatch.length
  }
  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex))
  }
  return parts.length > 0 ? <>{parts}</> : <>{body}</>
}

function stripMentions(body: string): string {
  return body.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1')
}

// ---- General utilities ----

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function getConversationName(
  conv: ConversationWithDetails,
  myId: string
): string {
  if (conv.name) return conv.name
  const other = conv.members.find((m) => m.profile_id !== myId)
  return other?.profile.full_name ?? 'Direct Message'
}

function getConversationAvatarInitials(
  conv: ConversationWithDetails,
  myId: string
): string {
  if (conv.name) return conv.name.slice(0, 2).toUpperCase()
  const other = conv.members.find((m) => m.profile_id !== myId)
  return getInitials(other?.profile.full_name ?? '?')
}

// ---- New Conversation Modal ----

type ConvMode = 'dm' | 'group'

interface NewConversationModalProps {
  myId: string
  onClose: () => void
  onCreated: (conversationId: string) => void
  existingConversations: ConversationWithDetails[]
}

function NewConversationModal({
  myId,
  onClose,
  onCreated,
  existingConversations,
}: NewConversationModalProps) {
  const { data: allProfiles } = useProfiles()
  const [mode, setMode] = useState<ConvMode>('dm')
  const [groupName, setGroupName] = useState('')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const otherProfiles = (allProfiles ?? []).filter((p) => p.id !== myId)
  const filtered = otherProfiles.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase())
  )

  function toggleMember(id: string) {
    if (mode === 'dm') {
      setSelectedIds([id])
      return
    }
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function handleCreate() {
    if (selectedIds.length === 0) return
    setError(null)
    setSaving(true)

    // For DMs: check if a 1:1 conversation already exists
    if (mode === 'dm') {
      const otherId = selectedIds[0]
      const existing = existingConversations.find(
        (c) =>
          c.name === null &&
          c.members.length === 2 &&
          c.members.some((m) => m.profile_id === otherId)
      )
      if (existing) {
        onCreated(existing.id)
        return
      }
    }

    if (mode === 'group' && !groupName.trim()) {
      setError('Group name is required.')
      setSaving(false)
      return
    }

    const allMemberIds = Array.from(new Set([myId, ...selectedIds]))
    const { data: convId, error: rpcErr } = await supabase.rpc('create_conversation', {
      p_name: mode === 'group' ? groupName.trim() : null,
      p_member_ids: allMemberIds,
    })

    if (rpcErr || typeof convId !== 'string') {
      if (rpcErr) console.error('[MessagesPage] create_conversation failed:', rpcErr)
      setError('Failed to create conversation. Please try again.')
      setSaving(false)
      return
    }

    onCreated(convId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Conversation</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['dm', 'group'] as ConvMode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setSelectedIds([]); setGroupName('') }}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  mode === m ? 'bg-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {m === 'dm' ? 'Direct Message' : 'Group'}
              </button>
            ))}
          </div>

          {/* Group name */}
          {mode === 'group' && (
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name (required)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
            />
          )}

          {/* Member search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
          />

          {/* Selected chips */}
          {mode === 'group' && selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedIds.map((id) => {
                const p = otherProfiles.find((x) => x.id === id)
                return (
                  <span
                    key={id}
                    className="flex items-center gap-1 rounded-full bg-navy/10 px-2.5 py-0.5 text-xs font-medium text-navy"
                  >
                    {p?.full_name}
                    <button
                      onClick={() => toggleMember(id)}
                      className="text-navy/60 hover:text-navy ml-0.5"
                    >
                      ✕
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          {/* Profile list */}
          <div className="max-h-52 overflow-y-auto space-y-1">
            {filtered.map((p) => {
              const isSelected = selectedIds.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => toggleMember(p.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    isSelected ? 'bg-navy/10' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy/20 text-navy text-xs font-semibold">
                    {getInitials(p.full_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{p.full_name}</p>
                    <p className="text-xs text-gray-400 truncate">{p.email}</p>
                  </div>
                  {isSelected && <span className="ml-auto text-navy text-sm">✓</span>}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-3">No members found.</p>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || selectedIds.length === 0}
            className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-dark disabled:opacity-40"
          >
            {saving ? 'Creating...' : mode === 'dm' ? 'Open Chat' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Main Page ----

export default function MessagesPage() {
  const { profile } = useAuth()
  const { data: conversations, isLoading, refetch } = useConversations(profile?.id)
  const { data: messages } = useMessages(
    undefined,
    profile?.id
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Mention picker state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStartIndex, setMentionStartIndex] = useState(0)
  const [mentionHighlight, setMentionHighlight] = useState(0)
  // Track inserted mentions: display text → uuid mapping
  const pendingMentions = useRef<{ name: string; id: string }[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeConv = conversations.find((c) => c.id === activeId) ?? null

  // Separate hook instance for the active conversation
  const {
    data: activeMessages,
    isLoading: messagesLoading,
    sendMessage: send,
  } = useMessages(activeId ?? undefined, profile?.id)

  // Reactions
  const messageIds = useMemo(() => activeMessages.map((m) => m.id), [activeMessages])
  const { reactions, toggleReaction } = useReactions(activeId ?? undefined, profile?.id, messageIds)
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState<string | null>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages])

  // Mention candidates — filtered from active conversation members
  const mentionCandidates =
    mentionQuery !== null && activeConv
      ? activeConv.members
          .filter((m) => m.profile_id !== profile?.id)
          .filter((m) =>
            m.profile.full_name.toLowerCase().includes(mentionQuery.toLowerCase())
          )
          .slice(0, 6)
      : []

  // Reset highlight when candidates change
  useEffect(() => {
    setMentionHighlight(0)
  }, [mentionQuery])

  // Reset state when switching conversations
  useEffect(() => {
    setEmojiPickerMsgId(null)
    pendingMentions.current = []
  }, [activeId])

  const insertMention = useCallback(
    (member: { profile_id: string; profile: { full_name: string } }) => {
      const displayText = `@${member.profile.full_name}`
      const before = inputText.slice(0, mentionStartIndex)
      const after = inputText.slice(mentionStartIndex + 1 + (mentionQuery?.length ?? 0))
      const newText = `${before}${displayText} ${after}`
      setInputText(newText)
      setMentionQuery(null)
      // Track this mention for conversion on send
      if (!pendingMentions.current.some((m) => m.id === member.profile_id)) {
        pendingMentions.current.push({ name: member.profile.full_name, id: member.profile_id })
      }
      setTimeout(() => {
        const ta = textareaRef.current
        if (ta) {
          const newCursor = before.length + displayText.length + 1
          ta.focus()
          ta.setSelectionRange(newCursor, newCursor)
        }
      }, 0)
    },
    [inputText, mentionStartIndex, mentionQuery]
  )

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setInputText(val)
    const cursor = e.target.selectionStart ?? val.length
    const textBeforeCursor = val.slice(0, cursor)
    const match = textBeforeCursor.match(/@([^@\s]*)$/)
    if (match) {
      setMentionQuery(match[1])
      setMentionStartIndex(cursor - match[0].length)
    } else {
      setMentionQuery(null)
    }
  }

  async function handleSend() {
    let text = inputText.trim()
    if (!text) return
    // Convert display mentions (@Name) to storage format (@[Name](uuid))
    for (const m of pendingMentions.current) {
      text = text.replaceAll(`@${m.name}`, `@[${m.name}](${m.id})`)
    }
    setInputText('')
    setMentionQuery(null)
    pendingMentions.current = []
    await send(text)
    refetch()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Mention picker navigation
    if (mentionQuery !== null && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionHighlight((h) => (h + 1) % mentionCandidates.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionHighlight((h) => (h - 1 + mentionCandidates.length) % mentionCandidates.length)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        insertMention(mentionCandidates[mentionHighlight])
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        insertMention(mentionCandidates[mentionHighlight])
        return
      }
      if (e.key === 'Escape') {
        setMentionQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  void messages // suppress unused warning — used via activeMessages

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel — conversation list */}
      <div
        className={`flex flex-col border-r border-gray-200 bg-white ${
          activeId ? 'hidden md:flex md:w-80' : 'flex w-full md:w-80'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <h1 className="text-base font-semibold text-gray-900">Messages</h1>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-dark"
          >
            + New
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-6 text-sm text-center text-gray-400">Loading...</p>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-400">No conversations yet.</p>
              <button
                onClick={() => setShowModal(true)}
                className="mt-3 text-sm font-medium text-navy hover:underline"
              >
                Start one
              </button>
            </div>
          ) : (
            conversations.map((conv) => {
              const name = getConversationName(conv, profile?.id ?? '')
              const initials = getConversationAvatarInitials(conv, profile?.id ?? '')
              const isUnread =
                conv.last_message &&
                conv.my_last_read_at &&
                new Date(conv.last_message.created_at) > new Date(conv.my_last_read_at)
              const isActive = conv.id === activeId

              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveId(conv.id)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-gray-50 ${
                    isActive ? 'bg-navy/5' : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Avatar */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy/15 text-navy text-xs font-bold">
                    {initials}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                        {name}
                      </p>
                      {conv.last_message && (
                        <span className="text-[10px] text-gray-400 shrink-0">
                          {formatTime(conv.last_message.created_at)}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${isUnread ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                      {conv.last_message ? stripMentions(conv.last_message.body) : 'No messages yet'}
                    </p>
                  </div>

                  {isUnread && (
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-dcsc-red" />
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Right panel — active conversation */}
      <div
        className={`flex flex-col flex-1 bg-gray-50 ${
          activeId ? 'flex' : 'hidden md:flex'
        }`}
      >
        {!activeConv ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-gray-400">Select a conversation or start a new one.</p>
          </div>
        ) : (
          <>
            {/* Conversation header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
              <button
                onClick={() => setActiveId(null)}
                className="md:hidden text-gray-400 hover:text-gray-600 mr-1"
              >
                ←
              </button>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy/15 text-navy text-xs font-bold">
                {getConversationAvatarInitials(activeConv, profile?.id ?? '')}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {getConversationName(activeConv, profile?.id ?? '')}
                </p>
                <p className="text-xs text-gray-400">
                  {activeConv.members.length} member{activeConv.members.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messagesLoading ? (
                <p className="text-center text-sm text-gray-400 py-8">Loading messages...</p>
              ) : activeMessages.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">
                  No messages yet. Say something!
                </p>
              ) : (
                activeMessages.map((msg) => {
                  const isMe = msg.sender_id === profile?.id
                  const msgReactions: ReactionGroup[] = reactions[msg.id] ?? []
                  return (
                    <div
                      key={msg.id}
                      className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      {/* Avatar */}
                      {!isMe && (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy/15 text-navy text-[10px] font-bold">
                          {getInitials(msg.sender?.full_name ?? '?')}
                        </div>
                      )}

                      <div className={`max-w-xs lg:max-w-md ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                        {/* Sender name — only for groups and not for own messages */}
                        {!isMe && activeConv.members.length > 2 && (
                          <p className="text-[10px] text-gray-400 mb-0.5 px-1">
                            {msg.sender?.full_name}
                          </p>
                        )}

                        {/* Message bubble row: bubble + emoji trigger inline */}
                        <div className={`group flex items-center gap-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div
                            className={`rounded-2xl px-3.5 py-2 text-sm ${
                              isMe
                                ? 'bg-navy text-white rounded-br-sm'
                                : 'bg-white text-gray-900 border border-gray-200 rounded-bl-sm'
                            }`}
                          >
                            {renderMessageBody(msg.body, profile?.id ?? '')}
                          </div>

                          {/* Emoji add button — appears on hover next to the bubble */}
                          <div className="relative">
                            <button
                              onClick={() => setEmojiPickerMsgId(emojiPickerMsgId === msg.id ? null : msg.id)}
                              className={`h-6 w-6 flex items-center justify-center rounded-full bg-gray-100 text-xs hover:bg-gray-200 transition-opacity ${
                                emojiPickerMsgId === msg.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              }`}
                              title="Add reaction"
                            >
                              +
                            </button>

                            {/* Quick emoji picker */}
                            {emojiPickerMsgId === msg.id && (
                              <div
                                className={`absolute ${isMe ? 'right-0' : 'left-0'} bottom-full mb-1 z-30 flex items-center gap-0.5 rounded-full bg-white shadow-lg border border-gray-200 px-1.5 py-1`}
                              >
                                {QUICK_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={() => {
                                      toggleReaction(msg.id, emoji)
                                      setEmojiPickerMsgId(null)
                                    }}
                                    className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-base transition-transform hover:scale-125"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Reaction pills */}
                        {msgReactions.length > 0 && (
                          <div className={`flex flex-wrap gap-1 mt-0.5 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            {msgReactions.map((r) => (
                              <button
                                key={r.emoji}
                                onClick={() => toggleReaction(msg.id, r.emoji)}
                                title={r.profiles.join(', ')}
                                className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs border transition-colors ${
                                  r.reacted
                                    ? 'bg-navy/10 border-navy/30 text-navy'
                                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                }`}
                              >
                                <span>{r.emoji}</span>
                                <span className="font-medium">{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        <p className="text-[10px] text-gray-400 mt-0.5 px-1">
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="relative bg-white border-t border-gray-200 px-4 py-3">
              {/* Mention picker dropdown */}
              {mentionQuery !== null && mentionCandidates.length > 0 && (
                <div className="absolute bottom-full left-4 right-4 mb-1 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden z-20">
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    Mention a member
                  </p>
                  {mentionCandidates.map((m, i) => (
                    <button
                      key={m.profile_id}
                      onMouseDown={(e) => { e.preventDefault(); insertMention(m) }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                        i === mentionHighlight ? 'bg-navy/10' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy/15 text-navy text-[10px] font-bold">
                        {getInitials(m.profile.full_name)}
                      </div>
                      <span className="font-medium text-gray-900">{m.profile.full_name}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message… (@ to mention, Enter to send)"
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30 max-h-32 overflow-y-auto"
                  style={{ minHeight: '42px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy text-white hover:bg-navy-dark disabled:opacity-40 transition-colors"
                >
                  ↑
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* New Conversation Modal */}
      {showModal && profile && (
        <NewConversationModal
          myId={profile.id}
          onClose={() => setShowModal(false)}
          onCreated={(id) => {
            setShowModal(false)
            setActiveId(id)
            refetch()
          }}
          existingConversations={conversations}
        />
      )}
    </div>
  )
}
