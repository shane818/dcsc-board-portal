import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useConversations } from '../hooks/useConversations'
import { useMessages } from '../hooks/useMessages'
import { useProfiles } from '../hooks/useProfiles'
import type { ConversationWithDetails } from '../types/database'

// ---- Utilities ----

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

  const activeConv = conversations.find((c) => c.id === activeId) ?? null

  // Separate hook instance for the active conversation
  const {
    data: activeMessages,
    isLoading: messagesLoading,
    sendMessage: send,
  } = useMessages(activeId ?? undefined, profile?.id)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages])

  async function handleSend() {
    const text = inputText.trim()
    if (!text) return
    setInputText('')
    await send(text)
    refetch()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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
                      {conv.last_message?.body ?? 'No messages yet'}
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
                        <div
                          className={`rounded-2xl px-3.5 py-2 text-sm ${
                            isMe
                              ? 'bg-navy text-white rounded-br-sm'
                              : 'bg-white text-gray-900 border border-gray-200 rounded-bl-sm'
                          }`}
                        >
                          {msg.body}
                        </div>
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
            <div className="bg-white border-t border-gray-200 px-4 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
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
