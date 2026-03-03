'use client'

import { ChatInput } from '@/components/chat/chat-input'
import { MessageList } from '@/components/chat/message-list'
import { Sidebar } from '@/components/chat/sidebar'
import { CanvasPanel } from '@/components/canvas/canvas-panel'
import { LinearPanel } from '@/components/linear/linear-panel'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  loadConversations,
  loadMessages,
  createConversation,
  deleteConversation,
  saveMessage,
  updateConversationTitle,
} from '@/lib/storage'
import {
  CANVAS_INITIAL,
  applyCanvasCommand,
  extractCanvasCommands,
} from '@/lib/canvas'
import type { CanvasState } from '@/lib/canvas'
import type { Conversation, ChatMessage } from '@/lib/types'
import type { SyncEvent } from '@/lib/sse'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { LayoutList, PanelRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

function toUIMessages(messages: ChatMessage[]): UIMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: 'text' as const, text: m.content }],
  }))
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [linearOpen, setLinearOpen] = useState(true)
  const [canvas, setCanvas] = useState<CanvasState>(CANVAS_INITIAL)
  const [input, setInput] = useState('')
  // Tracks in-progress stream content received via SSE (used when reconnecting
  // to a conversation that has an active stream from another tab/prior navigation)
  const [pendingStream, setPendingStream] = useState<PendingStream | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeIdRef = useRef<string | null>(null)
  // Captures the session ID at request time so onFinish saves to the
  // originating session even if the user switches sessions mid-stream.
  const requestSessionIdRef = useRef<string | null>(null)
  const canvasCommandCountRef = useRef(0)

  // Keep ref in sync for use in callbacks
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  // Load conversations from API on mount
  useEffect(() => {
    loadConversations().then(setConversations)
  }, [])

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
                }
              })
            )
            // The stream is done — clear any pending stream placeholder for
            // this conversation so the real persisted message takes over.
            if (payload.message.role === 'assistant') {
              setPendingStream((prev) =>
                prev?.conversationId === payload.conversation_id ? null : prev
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
            break
          }

          case 'conversation_session_linked': {
            const payload = syncEvent.payload as { conversation_id: string; session_id: string }
            setConversations((prev) =>
              prev.map((c) =>
                c.id === payload.conversation_id ? { ...c, sessionId: payload.session_id } : c
              )
            )
            break
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    return () => es.close()
  }, [])

  const activeConversation = conversations.find((c) => c.id === activeId)

  // Stable transport — body callback reads activeIdRef at request time, not during render
  // eslint-disable-next-line react-hooks/refs
  const transport = useMemo(() => makeTransport(activeIdRef), [])

  const { messages, sendMessage, status, setMessages, error } = useChat({
    messages: activeConversation ? toUIMessages(activeConversation.messages) : [],
    transport,
    onError: (err) => {
      console.error('[navi-chat] useChat error:', err)
    },
    onFinish: ({ message }) => {
      const content = getTextContent(message)
      // Use the session ID captured at send time, NOT the current active
      // session — the user may have switched sessions while streaming.
      const originatingSessionId = requestSessionIdRef.current
      if (!originatingSessionId) return

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
          }
        })
      })

      // Persist to API (fire-and-forget)
      saveMessage(originatingSessionId, msg)
    },
  })

  const isStreaming = status === 'streaming' || status === 'submitted'
  const isThinking = status === 'submitted'

  // When not actively streaming via useChat (e.g. after navigating away and
  // back), show accumulated SSE tokens as a placeholder assistant message so
  // the user sees the in-progress response and gets new deltas in real time.
  const displayMessages = useMemo<UIMessage[]>(() => {
    if (isStreaming) return messages // useChat owns the stream — no overlay needed
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
  }, [messages, pendingStream, activeId, isStreaming])

  // True when we're showing a live-updating placeholder from SSE
  const isPendingStream = !isStreaming && pendingStream?.conversationId === activeId && (pendingStream?.content.length ?? 0) > 0

  // Watch for canvas tool calls in streaming messages
  useEffect(() => {
    const lastAssistant = messages.filter((m) => m.role === 'assistant').at(-1)
    if (!lastAssistant) return

    const commands = extractCanvasCommands(lastAssistant)
    if (commands.length === 0) return

    // Only apply new commands (avoid re-applying on every render)
    if (commands.length > canvasCommandCountRef.current) {
      const newCommands = commands.slice(canvasCommandCountRef.current)
      setCanvas((prev) =>
        newCommands.reduce((state, cmd) => applyCanvasCommand(state, cmd), prev)
      )
      canvasCommandCountRef.current = commands.length
    }
  }, [messages])

  // Reset canvas command counter when conversation changes
  useEffect(() => {
    canvasCommandCountRef.current = 0
  }, [activeId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleNewChat = useCallback(() => {
    const id = crypto.randomUUID()
    createConversation(id, 'New Chat').then((conv) => {
      setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) return prev
        return [conv, ...prev]
      })
      setActiveId(conv.id)
      setMessages([])
      setInput('')

      setCanvas(CANVAS_INITIAL)
    })
  }, [setMessages])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveId(id)
      setInput('')

      setCanvas(CANVAS_INITIAL)
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
    [setMessages]
  )

  const handleDeleteConversation = useCallback(
    (id: string) => {
      deleteConversation(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) {
        setActiveId(null)
        setMessages([])
        setCanvas(CANVAS_INITIAL)
      }
    },
    [activeId, setMessages]
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
          return [{ ...conv, messages: [userMsg] }, ...prev]
        })
        saveMessage(id, userMsg)
      })
      setActiveId(id)
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
          }
        })
      )

      saveMessage(currentActiveId, userMsg)
    }

    // Reset canvas command counter for new response
    canvasCommandCountRef.current = 0

    // Capture session ID at send time so onFinish saves to this session
    // even if the user switches to a different session while streaming.
    requestSessionIdRef.current = currentActiveId

    setInput('')
    sendMessage({ text })
  }, [activeId, input, sendMessage, conversations])

  const handleCanvasClose = useCallback(() => {
    setCanvas((prev) => ({ ...prev, visible: false }))
  }, [])

  const handleCanvasToggle = useCallback(() => {
    setCanvas((prev) => ({ ...prev, visible: !prev.visible }))
  }, [])

  const canvasHasContent = canvas.content !== null || canvas.url !== null

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
        />
      </div>

      {/* Mobile sidebar — replaced by BottomNav; Sheet kept for desktop only */}

      {/* Main chat area */}
      <main className="flex flex-1 flex-col overflow-hidden pb-16 md:pb-0" id="main-content">
        {/* Header */}
        <header className="glass-subtle flex items-center gap-3 border-b border-zinc-800/60 px-4 py-3">
          {/* Hamburger removed — mobile uses BottomNav */}
          <span className="text-lg" role="img" aria-label="Navi">🧚</span>
          <h1 className="text-sm font-semibold tracking-tight text-zinc-200">Navi Chat</h1>
          <div className="flex-1" />
          <button
            onClick={handleCanvasToggle}
            aria-label={canvas.visible ? 'Hide canvas panel' : 'Show canvas panel'}
            aria-pressed={canvas.visible}
            className={`hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors focus-ring md:flex ${
              canvas.visible
                ? 'bg-zinc-800 text-emerald-400'
                : canvasHasContent
                  ? 'text-emerald-400/60 hover:bg-zinc-800 hover:text-emerald-400'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
          >
            <PanelRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => setLinearOpen((v) => !v)}
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
            <MessageList messages={displayMessages} isLoading={isStreaming || isPendingStream} isThinking={isThinking} />
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
        <div id="chat-input" className="mx-auto w-full max-w-3xl px-4 pb-4 pt-2 sm:px-6">
          <ChatInput
            input={input}
            setInput={setInput}
            onSubmit={handleFormSubmit}
            isLoading={isStreaming}
          />
        </div>
      </main>

      {/* Canvas panel — desktop only */}
      {canvas.visible && (
        <div className="hidden md:flex">
          <CanvasPanel
            canvas={canvas}
            onClose={handleCanvasClose}
            isStreaming={isStreaming}
          />
        </div>
      )}

      {/* Linear task panel — desktop only */}
      {linearOpen && (
        <div className="hidden md:flex">
          <LinearPanel onClose={() => setLinearOpen(false)} />
        </div>
      )}
    </div>
  )
}
