'use client'

import { ChatInput } from '@/components/chat/chat-input'
import { MessageList } from '@/components/chat/message-list'
import { Sidebar } from '@/components/chat/sidebar'
import { LinearPanel } from '@/components/linear/linear-panel'
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav'
import { AgentLogStack } from '@/components/agents/agent-log-stack'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  loadConversations,
  loadMessages,
  createConversation,
  deleteConversation,
  saveMessage,
  updateConversationTitle,
} from '@/lib/storage'
import type { Conversation, ChatMessage } from '@/lib/types'
import type { AgentInfo } from '@/lib/agents'
import type { SyncEvent } from '@/lib/sse'
import { useMobileNav } from '@/app/context/mobile-nav-context'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { Bot, LayoutList, Menu, MessageSquare, Plus, Terminal, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Stable ref accessor extracted outside render to satisfy react-hooks/refs.
// The body callback reads the ref at request time, not during render.
function makeTransport(activeIdRef: React.RefObject<string | null>) {
  return new DefaultChatTransport({
    api: '/api/chat',
    body: () => ({ conversationId: activeIdRef.current }),
  })
}

interface PendingStream {
  conversationId: string
  content: string
}

type ReasoningPart = { type: 'reasoning'; reasoning?: string; text?: string }
type ToolCallPart = { type: 'tool-call'; toolName?: string; name?: string }

type AgentStatus = 'running' | 'idle' | 'done'

const AGENT_REFRESH_MS = 30_000
const SPLIT_RATIO_KEY = 'navi.chat.splitRatio'
const SPLIT_MIN = 0.45
const SPLIT_MAX = 0.8
const DEFAULT_SPLIT_RATIO = 0.64

function getTextContent(message: UIMessage): string {
  const parts = message.parts ?? []
  const fromParts = parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
  if (fromParts.length > 0) return fromParts
  const content = (message as { content?: string }).content
  return typeof content === 'string' ? content : ''
}

function toUIMessages(messages: ChatMessage[]): UIMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: 'text' as const, text: m.content }],
  }))
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getSessionDisplayName(sessionKey?: string): string | null {
  if (!sessionKey) return null
  const parts = sessionKey.split(':')
  if (parts[0] !== 'agent') return 'Process'

  const role = parts[1] ?? 'main'
  if (role !== 'main') return role.charAt(0).toUpperCase() + role.slice(1)

  if (parts[2] === 'cron') return 'Cron Job'
  if (parts[2] === 'slack' || (parts[2] === 'main' && parts[3] === 'thread')) return 'Slack'
  if (parts[2] === 'openai' || parts[2] === 'openai-user') return 'Navi'
  if (parts[2] === 'main') return 'Navi'
  return 'Navi'
}


// ─── Mobile conversation list ────────────────────────────────────────────────

function MobileConversationList({
  conversations,
  onSelect,
  onNew,
}: {
  conversations: Conversation[]
  onSelect: (id: string) => void
  onNew: () => void
}) {
  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800/60 px-4 py-3">
        <span className="text-lg" role="img" aria-label="Navi">🧚</span>
        <h1 className="text-sm font-semibold tracking-tight text-zinc-200">Navi Chat</h1>
        <div className="flex-1" />
        <button
          onClick={onNew}
          aria-label="New chat"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 transition-colors hover:bg-emerald-500/20 focus-ring"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      {/* Conversation list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
              <MessageSquare className="h-6 w-6 text-zinc-700" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-zinc-400">No conversations yet</p>
            <p className="text-xs text-zinc-600">Tap the + button to start chatting</p>
          </div>
        ) : (
          <div className="flex flex-col py-2">
            {conversations.map((conv) => {
              const lastMsg = conv.messages.at(-1)
              const preview = lastMsg?.content.slice(0, 80) ?? 'No messages yet'
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => onSelect(conv.id)}
                  className="flex min-h-[68px] flex-col gap-1 border-b border-zinc-800/40 px-4 py-3 text-left transition-colors hover:bg-zinc-900/80 active:bg-zinc-800/60 focus-ring"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm font-medium text-zinc-200">
                      {conv.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-zinc-600">
                      {timeAgo(conv.updatedAt)}
                    </span>
                  </div>
                  <p className="line-clamp-1 text-xs text-zinc-500">
                    {lastMsg ? preview : 'No messages yet'}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

function ChatPageInner() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [linearOpen, setLinearOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(true)
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT_RATIO)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [isDesktop, setIsDesktop] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [input, setInput] = useState('')
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'logs'>('chat')
  const [liveAgentSessions, setLiveAgentSessions] = useState<Set<string>>(new Set())
  const [liveProcessAgentIds, setLiveProcessAgentIds] = useState<string[]>([])
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null)
  // Tracks in-progress stream content received via SSE (used when reconnecting
  // to a conversation that has an active stream from another tab/prior navigation)
  const [pendingStream, setPendingStream] = useState<PendingStream | null>(null)
  const pendingStreamRef = useRef<PendingStream | null>(null)
  const [thinkingText, setThinkingText] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const splitRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const activeIdRef = useRef<string | null>(null)
  const initialConversationBootstrappedRef = useRef(false)
  // Captures the session ID at request time so onFinish saves to the
  // originating session even if the user switches sessions mid-stream.
  const requestSessionIdRef = useRef<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Mobile back-action: when viewing a chat, register a back action to go back to list
  const { registerChatBack } = useMobileNav()

  useEffect(() => {
    if (mobileView === 'chat') {
      registerChatBack(() => setMobileView('list'))
    } else {
      registerChatBack(null)
    }
    return () => registerChatBack(null)
  }, [mobileView, registerChatBack])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(SPLIT_RATIO_KEY)
    if (!stored) return
    const next = Number.parseFloat(stored)
    if (!Number.isFinite(next)) return
    setSplitRatio(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, next)))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SPLIT_RATIO_KEY, String(splitRatio))
  }, [splitRatio])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(min-width: 768px)')
    const handleChange = () => {
      setIsDesktop(media.matches)
    }
    handleChange()
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (isDesktop) return
    if (mobileView === 'chat') {
      setMobilePanel('chat')
    }
  }, [isDesktop, mobileView])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleMove = (event: PointerEvent) => {
      if (!draggingRef.current) return
      const container = splitRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const next = (event.clientX - rect.left) / rect.width
      const clamped = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, next))
      setSplitRatio(clamped)
    }
    const handleUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      setIsDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [])

  // Keep ref in sync for use in callbacks
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  useEffect(() => {
    pendingStreamRef.current = pendingStream
  }, [pendingStream])

  const activeConversation = conversations.find((c) => c.id === activeId)
  const isLiveSession = activeConversation?.sessionKey
    ? liveAgentSessions.has(activeConversation.sessionKey)
    : false
  const activeSessionLabel = getSessionDisplayName(activeConversation?.sessionKey)
  const activeAgents = useMemo(
    () => agents.filter((agent) => agent.status !== 'done'),
    [agents]
  )

  // Find the single agent linked to the current conversation
  const conversationAgent = useMemo<AgentInfo | null>(() => {
    if (!activeConversation) return null

    // Match by sessionKey
    if (activeConversation.sessionKey) {
      const match = agents.find(
        (a) => a.sessionKey === activeConversation.sessionKey || a.id === activeConversation.sessionKey
      )
      if (match) return match
    }

    // Match by ticket number in conversation title (e.g. "NAV-152")
    const ticketMatch = activeConversation.title.match(/\b(NAV-\d+)\b/i)
    if (ticketMatch) {
      const ticketNum = ticketMatch[1].toUpperCase()
      const match = agents.find(
        (a) => a.ticket?.id?.toUpperCase() === ticketNum
      )
      if (match) return match
    }

    return null
  }, [activeConversation, agents])

  const panelAgents = useMemo(
    () => (conversationAgent ? [conversationAgent] : []),
    [conversationAgent]
  )
  const showChatPanel = isDesktop || mobilePanel === 'chat'
  const showLogsPanel = (isDesktop && logsOpen) || (!isDesktop && mobilePanel === 'logs')
  const logsToggleActive = isDesktop ? logsOpen : mobilePanel === 'logs'

  // Stable transport — body callback reads activeIdRef at request time, not during render
  // eslint-disable-next-line react-hooks/refs
  const transport = useMemo(() => makeTransport(activeIdRef), [])

  const { messages, sendMessage, status, setMessages, error } = useChat({
    messages: activeConversation ? toUIMessages(activeConversation.messages) : [],
    transport,
    onError: (err) => {
      console.error('[navi-chat] useChat error:', err)
      const originatingSessionId = requestSessionIdRef.current
      if (originatingSessionId) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === originatingSessionId
              ? { ...c, isPending: false, streamingMessageId: null }
              : c
          )
        )
      }
      setStreamingConversationId(null)
    },
    onFinish: ({ message }) => {
      let content = getTextContent(message)
      // Use the session ID captured at send time, NOT the current active
      // session — the user may have switched sessions while streaming.
      const originatingSessionId = requestSessionIdRef.current
      if (!originatingSessionId) return
      if (content.length === 0) {
        const fallback = pendingStreamRef.current
        if (fallback?.conversationId === originatingSessionId && fallback.content.length > 0) {
          content = fallback.content
        }
      }
      if (content.length === 0) return

      const msg: ChatMessage = {
        id: message.id,
        role: message.role as 'user' | 'assistant',
        content,
        timestamp: Date.now(),
      }
      // Check if already saved (from SSE)
      setConversations((prev) => {
        const conv = prev.find((c) => c.id === originatingSessionId)
        if (conv?.messages.some((m) => m.id === message.id)) return prev
        return prev.map((c) => {
          if (c.id !== originatingSessionId) return c
          return {
            ...c,
            messages: [...c.messages, msg],
            updatedAt: msg.timestamp,
            isPending: false,
            streamingMessageId: null,
          }
        })
      })

      // Persist to API (fire-and-forget)
      saveMessage(originatingSessionId, msg)
      setStreamingConversationId((prev) =>
        prev === originatingSessionId ? null : prev
      )
    },
  })

  const updateUrlForConversation = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (id) {
        params.set('id', id)
      } else {
        params.delete('id')
      }
      const query = params.toString()
      router.replace(query ? `?${query}` : '/chat', { scroll: false })
    },
    [router, searchParams]
  )

  const activateConversation = useCallback(
    (id: string, { syncUrl = true }: { syncUrl?: boolean } = {}) => {
      setActiveId(id)
      activeIdRef.current = id
      setInput('')
      setSidebarOpen(false)
      setMobileView('chat')
      if (syncUrl) updateUrlForConversation(id)
      // Don't clear pendingStream here — if there's an active stream for this
      // conversation, the SSE message_streaming_state event will populate it.
      // For other conversations, the render guard (conversationId check) hides it.
      // Load messages from API
      loadMessages(id).then((msgs) => {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, messages: msgs } : c))
        )
        setMessages(toUIMessages(msgs))
      })
    },
    [setMessages, updateUrlForConversation]
  )

  // Load conversations from API on mount
  useEffect(() => {
    let cancelled = false
    loadConversations().then((list) => {
      if (cancelled) return
      setConversations(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Bootstrap active conversation from URL (or most recent if missing)
  useEffect(() => {
    if (initialConversationBootstrappedRef.current) return
    if (conversations.length === 0) return
    const urlId = searchParams.get('id')
    const urlMatch = urlId && conversations.some((c) => c.id === urlId)
    let nextId: string | null = null

    if (urlMatch) {
      nextId = urlId!
    } else {
      let mostRecent = conversations[0]
      for (const conv of conversations) {
        if (conv.updatedAt > mostRecent.updatedAt) {
          mostRecent = conv
        }
      }
      nextId = mostRecent?.id ?? null
    }

    if (nextId) {
      activateConversation(nextId, { syncUrl: !urlMatch })
    }
    initialConversationBootstrappedRef.current = true
  }, [activateConversation, conversations, searchParams])

  const refreshAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents', { cache: 'no-store' })
      if (!res.ok) return
      const data: AgentInfo[] = await res.json()
      setAgents(data)
      const next = new Set<string>()
      const processIds: string[] = []
      for (const agent of data) {
        if (agent.status === 'running' || agent.status === 'idle') {
          // Prefer stable session keys for conversations; keep process IDs for fallbacks.
          const sessionKey = agent.sessionKey ?? agent.id
          next.add(sessionKey)
          if (agent.source === 'process') {
            next.add(agent.id)
            processIds.push(agent.id)
          }
        }
      }
      setLiveAgentSessions(next)
      setLiveProcessAgentIds(processIds)
    } catch (err) {
      console.warn('[navi-chat] failed to refresh agents:', err)
    }
  }, [])

  useEffect(() => {
    refreshAgents()
    const interval = setInterval(refreshAgents, AGENT_REFRESH_MS)
    return () => clearInterval(interval)
  }, [refreshAgents])

  useEffect(() => {
    if (!selectedAgentId) {
      const sessionKey = activeConversation?.sessionKey
      if (sessionKey) setSelectedAgentId(sessionKey)
      return
    }
    if (!agents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(null)
    }
  }, [activeConversation?.sessionKey, agents, selectedAgentId])

  // SSE subscription
  useEffect(() => {
    const es = new EventSource('/api/sync')

    es.onmessage = (event) => {
      try {
        const syncEvent: SyncEvent = JSON.parse(event.data)

        switch (syncEvent.type) {
          case 'conversation_created': {
            const payload = syncEvent.payload as {
              id: string
              title: string
              created_at: number
              updated_at: number
            }
            setConversations((prev) => {
              if (prev.some((c) => c.id === payload.id)) return prev
              return [
                {
                  id: payload.id,
                  title: payload.title,
                  messages: [],
                  createdAt: payload.created_at,
                  updatedAt: payload.updated_at,
                  isPending: false,
                  streamingMessageId: null,
                },
                ...prev,
              ]
            })
            break
          }
          case 'conversation_deleted': {
            const payload = syncEvent.payload as { id: string }
            setConversations((prev) => prev.filter((c) => c.id !== payload.id))
            break
          }
          case 'conversation_updated': {
            const payload = syncEvent.payload as { id: string; title: string }
            setConversations((prev) =>
              prev.map((c) =>
                c.id === payload.id ? { ...c, title: payload.title } : c
              )
            )
            break
          }
          case 'message_appended': {
            const payload = syncEvent.payload as {
              conversation_id: string
              message: {
                id: string
                role: 'user' | 'assistant' | 'system'
                content: string
                timestamp: number
              }
            }
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== payload.conversation_id) return c
                if (c.messages.some((m) => m.id === payload.message.id)) return c
                return {
                  ...c,
                  messages: [...c.messages, payload.message],
                  updatedAt: payload.message.timestamp,
                  isPending:
                    payload.message.role === 'assistant' ? false : c.isPending,
                  streamingMessageId:
                    payload.message.role === 'assistant' ? null : c.streamingMessageId,
                }
              })
            )
            // The stream is done — clear any pending stream placeholder for
            // this conversation so the real persisted message takes over.
            if (payload.message.role === 'assistant') {
              setPendingStream((prev) =>
                prev?.conversationId === payload.conversation_id ? null : prev
              )
              setStreamingConversationId((prev) =>
                prev === payload.conversation_id ? null : prev
              )
            }
            break
          }

          case 'message_streaming_state': {
            // Full accumulated content replayed on fresh SSE connect.
            // Only set if we are NOT actively streaming this ourselves (useChat
            // handles that case directly via the HTTP stream).
            const payload = syncEvent.payload as {
              conversation_id: string
              content: string
            }
            // We guard against overwriting useChat's own stream in the render
            // path (isStreaming check), but set the state so it's ready.
            setPendingStream((prev) => {
              // Don't regress content length (race: delta arrived before state)
              if (
                prev?.conversationId === payload.conversation_id &&
                prev.content.length >= payload.content.length
              ) {
                return prev
              }
              return {
                conversationId: payload.conversation_id,
                content: payload.content,
              }
            })
            setConversations((prev) =>
              prev.map((c) =>
                c.id === payload.conversation_id
                  ? { ...c, isPending: true }
                  : c
              )
            )
            break
          }

          case 'message_streaming': {
            // Incremental delta from an in-progress stream on another client/tab.
            const payload = syncEvent.payload as {
              conversation_id: string
              delta: string
            }
            setPendingStream((prev) => {
              if (!prev) {
                // No state yet — create it
                return { conversationId: payload.conversation_id, content: payload.delta }
              }
              if (prev.conversationId !== payload.conversation_id) return prev
              return { ...prev, content: prev.content + payload.delta }
            })
            setConversations((prev) =>
              prev.map((c) =>
                c.id === payload.conversation_id
                  ? { ...c, isPending: true }
                  : c
              )
            )
            break
          }

          case 'thinking_update': {
            const payload = syncEvent.payload as {
              conversation_id: string
              text: string
            }
            if (payload.conversation_id === activeIdRef.current) {
              setThinkingText(payload.text)
            }
            break
          }

          case 'conversation_session_linked': {
            const payload = syncEvent.payload as { conversation_id: string; session_key: string }
            setConversations((prev) =>
              prev.map((c) =>
                c.id === payload.conversation_id ? { ...c, sessionKey: payload.session_key } : c
              )
            )
            refreshAgents()
            break
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    return () => es.close()
  }, [refreshAgents])

  const isStreaming = status === 'streaming' || status === 'submitted'
  const isActiveStreaming = isStreaming && streamingConversationId === activeId
  const isActivePending =
    (activeConversation?.isPending ?? false) || isActiveStreaming

  // When not actively streaming via useChat (e.g. after navigating away and
  // back), show accumulated SSE tokens as a placeholder assistant message so
  // the user sees the in-progress response and gets new deltas in real time.
  const displayMessages = useMemo<UIMessage[]>(() => {
    if (isActiveStreaming) return messages // useChat owns the stream — no overlay needed
    if (!pendingStream || pendingStream.conversationId !== activeId) return messages
    if (pendingStream.content.length === 0) return messages
    // Don't duplicate if useChat already has this content (stream just finished)
    const lastMsg = messages.at(-1)
    if (lastMsg?.role === 'assistant') return messages
    return [
      ...messages,
      {
        id: '__pending_stream__',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: pendingStream.content }],
      } as UIMessage,
    ]
  }, [messages, pendingStream, activeId, isActiveStreaming])

  // True when we're showing a live-updating placeholder from SSE
  const isPendingStream = !isActiveStreaming && pendingStream?.conversationId === activeId && (pendingStream?.content.length ?? 0) > 0

  const displayAssistantText = useMemo(() => {
    const lastAssistant = displayMessages.filter((m) => m.role === 'assistant').at(-1)
    return lastAssistant ? getTextContent(lastAssistant) : ''
  }, [displayMessages])

  const thinkingTextFromParts = useMemo(() => {
    if (!isActiveStreaming) return null
    const last = messages.at(-1)
    if (!last || last.role !== 'assistant') return null
    const parts = last.parts ?? []
    const hasText = parts.some((p) => {
      if (p.type !== 'text') return false
      const text = (p as { type: 'text'; text?: string }).text ?? ''
      return text.length > 0
    })
    if (hasText) return null

    const reasoningPart = [...parts].reverse().find((p) => p.type === 'reasoning') as ReasoningPart | undefined
    if (reasoningPart) {
      const text = reasoningPart.reasoning ?? reasoningPart.text ?? ''
      if (text) return text
    }

    const toolCallPart = [...parts].reverse().find((p) => p.type === 'tool-call') as ToolCallPart | undefined
    if (toolCallPart) {
      const toolName = toolCallPart.toolName ?? toolCallPart.name
      if (toolName) return `Using ${toolName}...`
    }

    return null
  }, [messages, isActiveStreaming])

  const effectiveThinkingText = thinkingTextFromParts ?? thinkingText
  const isThinking =
    isActiveStreaming &&
    (status === 'submitted' || (status === 'streaming' && displayAssistantText.length === 0)) &&
    !isPendingStream


  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (status === 'ready') {
      setThinkingText(null)
    }
  }, [status])

  useEffect(() => {
    if (!isActiveStreaming) return
    if (displayAssistantText.length > 0) {
      setThinkingText(null)
    }
  }, [displayAssistantText, isActiveStreaming])

  useEffect(() => {
    setThinkingText(null)
  }, [activeId])

  const startResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!logsOpen || !isDesktop) return
    draggingRef.current = true
    setIsDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [isDesktop, logsOpen])

  const handleSeparatorKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? -0.02 : 0.02
    setSplitRatio((prev) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, prev + delta)))
  }, [])

  const handleAgentSelect = useCallback((agentId: string) => {
    setSelectedAgentId(agentId)
    if (isDesktop) {
      setLogsOpen(true)
      setLinearOpen(false)
    } else {
      setMobilePanel('logs')
    }
  }, [isDesktop])

  const handleNewChat = useCallback(() => {
    const id = crypto.randomUUID()
    createConversation(id, 'New Chat').then((conv) => {
      setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) return prev
        return [conv, ...prev]
      })
      setActiveId(conv.id)
      activeIdRef.current = conv.id
      setMessages([])
      setInput('')
      setSidebarOpen(false)
      setMobileView('chat')
      updateUrlForConversation(conv.id)
    })
  }, [setMessages, updateUrlForConversation])

  const handleSelectConversation = useCallback(
    (id: string) => {
      activateConversation(id)
    },
    [activateConversation]
  )

  const handleDeleteConversation = useCallback(
    (id: string) => {
      deleteConversation(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) {
        setActiveId(null)
        setMessages([])
        setMobileView('list')
        updateUrlForConversation(null)
      }
    },
    [activeId, setMessages, updateUrlForConversation]
  )

  const handleRenameConversation = useCallback(
    (id: string, title: string) => {
      updateConversationTitle(id, title)
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c))
      )
    },
    []
  )

  const handleFormSubmit = useCallback(() => {
    const text = input.trim()
    if (!text) return

    let currentActiveId = activeId

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }

    if (!currentActiveId) {
      // Create new conversation with first message
      const title = text.slice(0, 30) + (text.length > 30 ? '...' : '')
      const id = crypto.randomUUID()
      currentActiveId = id

      createConversation(id, title).then((conv) => {
        setConversations((prev) => {
          if (prev.some((c) => c.id === conv.id)) return prev
          return [{ ...conv, messages: [userMsg], isPending: true }, ...prev]
        })
        saveMessage(id, userMsg)
      })
      setActiveId(id)
      activeIdRef.current = id
      updateUrlForConversation(id)
    } else {
      // Auto-title if first message
      const conv = conversations.find((c) => c.id === currentActiveId)
      if (conv && conv.messages.length === 0) {
        const title = text.slice(0, 30) + (text.length > 30 ? '...' : '')
        updateConversationTitle(currentActiveId, title)
        setConversations((prev) =>
          prev.map((c) =>
            c.id === currentActiveId ? { ...c, title } : c
          )
        )
      }

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== currentActiveId) return c
          return {
            ...c,
            messages: [...c.messages, userMsg],
            updatedAt: userMsg.timestamp,
            isPending: true,
            streamingMessageId: null,
          }
        })
      )

      saveMessage(currentActiveId, userMsg)
    }

    // Capture session ID at send time so onFinish saves to this session
    // even if the user switches to a different session while streaming.
    requestSessionIdRef.current = currentActiveId
    setStreamingConversationId(currentActiveId)

    setInput('')
    setThinkingText(null)
    sendMessage(
      { text },
      {
        body: {
          conversationId: currentActiveId,
        },
      }
    )
  }, [activeId, input, sendMessage, conversations])

  return (
    <div className="flex h-dvh bg-zinc-900">
      {/* Skip navigation link */}
      <a href="#chat-input" className="skip-nav">
        Skip to chat input
      </a>

      {/* Desktop sidebar */}
      <div className="hidden md:flex h-full">
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelectConversation}
          onNew={handleNewChat}
          onDelete={handleDeleteConversation}
          onRename={handleRenameConversation}
          liveAgentSessions={liveAgentSessions}
          liveProcessAgentIds={liveProcessAgentIds}
          onAgentSelect={handleAgentSelect}
        />
      </div>

      {/* Mobile sidebar (Sheet) — kept for desktop sheet fallback, hidden on mobile */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[100vw] min-w-[280px] max-w-[420px] border-zinc-800/60 bg-zinc-950/95 p-0 backdrop-blur-xl sm:w-[320px]">
          <SheetTitle className="sr-only">Conversations</SheetTitle>
          <Sidebar
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelectConversation}
            onNew={handleNewChat}
            onDelete={handleDeleteConversation}
            onRename={handleRenameConversation}
            liveAgentSessions={liveAgentSessions}
            liveProcessAgentIds={liveProcessAgentIds}
            onAgentSelect={handleAgentSelect}
          />
        </SheetContent>
      </Sheet>

      {/* Mobile conversation list — shown when mobileView is 'list' */}
      <div className={`${mobileView === 'list' ? 'flex' : 'hidden'} h-full w-full flex-col pb-20 md:hidden`}>
        <MobileConversationList
          conversations={conversations}
          onSelect={handleSelectConversation}
          onNew={handleNewChat}
        />
        <MobileBottomNav />
      </div>

      {/* Main chat area + logs split */}
      <div
        className={`flex min-w-0 flex-1 flex-col overflow-hidden ${mobileView === 'chat' ? 'flex' : 'hidden md:flex'}`}
        id="main-content"
      >
        {!isDesktop && mobileView === 'chat' && (
          <div className="flex items-center gap-2 border-b border-zinc-800/60 bg-zinc-950/70 px-3 py-2">
            <button
              onClick={() => setMobilePanel('chat')}
              aria-pressed={mobilePanel === 'chat'}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-ring ${
                mobilePanel === 'chat'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setMobilePanel('logs')}
              aria-pressed={mobilePanel === 'logs'}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-ring ${
                mobilePanel === 'logs'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
              }`}
            >
              Logs
              {conversationAgent && (
                <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                  1
                </span>
              )}
            </button>
          </div>
        )}
        <div ref={splitRef} className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Chat panel */}
          {showChatPanel && (
            <section
              className={`flex min-h-0 flex-col ${isDesktop && logsOpen ? 'flex-none' : 'flex-1'} min-w-[320px]`}
              style={isDesktop && logsOpen ? { width: `${splitRatio * 100}%` } : undefined}
            >
            {/* Header */}
            <header className="glass-subtle flex items-center gap-3 border-b border-zinc-800/60 px-3 py-3 sm:px-4">
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Open conversation sidebar"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-ring md:hidden"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
              <span className="text-lg" role="img" aria-label="Navi">🧚</span>
              <h1 className="text-sm font-semibold tracking-tight text-zinc-200">Navi Chat</h1>
              {activeConversation?.sessionKey && activeSessionLabel && (
                <Link
                  href={`/agents?agentId=${activeConversation.sessionKey}`}
                  aria-label={`View ${activeSessionLabel} session`}
                  title={activeConversation.sessionKey}
                  className={`flex max-w-[150px] items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-ring sm:max-w-none ${
                    isLiveSession
                      ? 'border-emerald-700/80 bg-zinc-900/60 text-emerald-300 hover:border-emerald-400/60 hover:text-emerald-200'
                      : 'border-zinc-700/80 bg-zinc-900/60 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  <Bot className="h-3 w-3" aria-hidden="true" />
                  <span className="truncate">{activeSessionLabel}</span>
                </Link>
              )}
              <div className="flex-1" />
              <button
                onClick={() => {
                  if (!isDesktop) {
                    setMobilePanel('logs')
                    return
                  }
                  setLogsOpen((v) => {
                    const next = !v
                    if (next) setLinearOpen(false)
                    return next
                  })
                }}
                aria-label={logsToggleActive ? 'Hide agent logs panel' : 'Show agent logs panel'}
                aria-pressed={logsToggleActive}
                className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors focus-ring ${
                  logsToggleActive
                    ? 'bg-zinc-800 text-emerald-300'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
                }`}
              >
                <Terminal className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                onClick={() =>
                  setLinearOpen((v) => {
                    const next = !v
                    if (next) setLogsOpen(false)
                    return next
                  })
                }
                aria-label={linearOpen ? 'Hide Linear tasks panel' : 'Show Linear tasks panel'}
                aria-pressed={linearOpen}
                className={`hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors focus-ring md:flex ${
                  linearOpen
                    ? 'bg-zinc-800 text-violet-400'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
                }`}
              >
                <LayoutList className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            {/* Messages */}
            <ScrollArea className="min-h-0 flex-1" viewportRef={scrollRef}>
              <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
                <MessageList
                  messages={displayMessages}
                  isLoading={isActivePending || isPendingStream}
                  isThinking={isThinking}
                  thinkingText={effectiveThinkingText}
                />
              </div>
            </ScrollArea>

            {/* Error display */}
            {error && (
              <div className="mx-auto w-full max-w-3xl px-4 py-2 sm:px-6" role="alert" aria-live="assertive">
                <div className="rounded-xl border border-red-800/60 bg-red-950/80 px-4 py-2.5 text-xs text-red-300">
                  Error: {error.message}
                </div>
              </div>
            )}

            {/* Input — sticky at bottom */}
            <div id="chat-input" className="mx-auto w-full max-w-3xl px-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] pt-2 sm:px-6 md:pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <ChatInput
                input={input}
                setInput={setInput}
                onSubmit={handleFormSubmit}
                isLoading={isActivePending}
              />
            </div>
          </section>
          )}

          {/* Resize handle */}
          {logsOpen && isDesktop && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize chat and logs"
              aria-valuemin={Math.round(SPLIT_MIN * 100)}
              aria-valuemax={Math.round(SPLIT_MAX * 100)}
              aria-valuenow={Math.round(splitRatio * 100)}
              tabIndex={0}
              onKeyDown={handleSeparatorKeyDown}
              onPointerDown={startResize}
              className={`group relative hidden w-2 cursor-col-resize items-center justify-center bg-zinc-900 md:flex ${
                isDragging ? 'bg-zinc-800' : 'hover:bg-zinc-800/80'
              }`}
            >
              <span className="absolute left-1/2 top-1/2 h-10 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-700/80 group-hover:bg-zinc-500/80" />
            </div>
          )}

          {/* Logs panel */}
          {showLogsPanel && (
            <aside
              className={`flex min-h-0 flex-col border-t border-zinc-800/60 bg-zinc-950 md:border-t-0 md:border-l ${
                isDesktop ? 'min-w-[320px]' : 'flex-1 w-full'
              }`}
              style={isDesktop && logsOpen ? { width: `${(1 - splitRatio) * 100}%` } : undefined}
            >
              <header className="flex items-center justify-between gap-2 border-b border-zinc-800/60 bg-zinc-950/80 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-zinc-200">Agent Log</p>
                  <p className="truncate text-[10px] text-zinc-500">
                    {conversationAgent
                      ? conversationAgent.ticket?.id ?? conversationAgent.name
                      : 'No linked agent'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (isDesktop) {
                      setLogsOpen(false)
                    } else {
                      setMobilePanel('chat')
                    }
                  }}
                  aria-label={isDesktop ? 'Close agent logs panel' : 'Back to chat'}
                  className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-ring"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {panelAgents.length > 0 ? (
                  <AgentLogStack
                    agents={panelAgents}
                    selectedAgentId={selectedAgentId}
                    onSelect={(id) => setSelectedAgentId(id)}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                    <Bot className="h-6 w-6 text-zinc-700" aria-hidden="true" />
                    <p className="text-xs text-zinc-500">No agent for this conversation</p>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Linear task panel — desktop only */}
      {linearOpen && !logsOpen && (
        <div className="hidden md:flex">
          <LinearPanel onClose={() => setLinearOpen(false)} />
        </div>
      )}

      {/* Bottom nav — only show in chat view on mobile (list view has its own) */}
      <div className={`${mobileView === 'chat' ? 'block' : 'hidden'} md:block`}>
        <MobileBottomNav />
      </div>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center">Loading chat...</div>}>
      <ChatPageInner />
    </Suspense>
  )
}
