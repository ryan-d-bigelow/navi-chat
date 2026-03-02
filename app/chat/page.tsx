'use client'

import { ChatInput } from '@/components/chat/chat-input'
import { MessageList } from '@/components/chat/message-list'
import { Sidebar } from '@/components/chat/sidebar'
import { LinearPanel } from '@/components/linear/linear-panel'
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
import type { SyncEvent } from '@/lib/sse'
import { useChat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { LayoutList, Menu } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [linearOpen, setLinearOpen] = useState(true)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeIdRef = useRef<string | null>(null)

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

  const { messages, sendMessage, status, setMessages, error } = useChat({
    messages: activeConversation ? toUIMessages(activeConversation.messages) : [],
    onError: (err) => {
      console.error('[navi-chat] useChat error:', err)
    },
    onFinish: ({ message }) => {
      const content = getTextContent(message)
      const currentActiveId = activeIdRef.current
      if (!currentActiveId) return

      const msg: ChatMessage = {
        id: message.id,
        role: message.role as 'user' | 'assistant',
        content,
        timestamp: Date.now(),
      }

      // Check if already saved (from SSE)
      setConversations((prev) => {
        const conv = prev.find((c) => c.id === currentActiveId)
        if (conv?.messages.some((m) => m.id === message.id)) return prev
        return prev.map((c) => {
          if (c.id !== currentActiveId) return c
          return {
            ...c,
            messages: [...c.messages, msg],
            updatedAt: msg.timestamp,
          }
        })
      })

      // Persist to API (fire-and-forget)
      saveMessage(currentActiveId, msg)
    },
  })

  const isStreaming = status === 'streaming' || status === 'submitted'

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
      setSidebarOpen(false)
    })
  }, [setMessages])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveId(id)
      setInput('')
      setSidebarOpen(false)
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
      }
    },
    [activeId, setMessages]
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

    setInput('')
    sendMessage({ text })
  }, [activeId, input, sendMessage, conversations])

  return (
    <div className="flex h-dvh bg-zinc-900">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelectConversation}
          onNew={handleNewChat}
          onDelete={handleDeleteConversation}
        />
      </div>

      {/* Mobile sidebar (Sheet) */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[260px] border-zinc-800 bg-zinc-950 p-0">
          <SheetTitle className="sr-only">Conversations</SheetTitle>
          <Sidebar
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelectConversation}
            onNew={handleNewChat}
            onDelete={handleDeleteConversation}
          />
        </SheetContent>
      </Sheet>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-lg">🧚</span>
          <h1 className="text-sm font-medium text-zinc-200">Navi Chat</h1>
          <div className="flex-1" />
          <button
            onClick={() => setLinearOpen((v) => !v)}
            className={`rounded-lg p-1.5 transition-colors ${
              linearOpen
                ? 'bg-zinc-800 text-violet-400'
                : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
            title={linearOpen ? 'Hide tasks' : 'Show tasks'}
          >
            <LayoutList className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="mx-auto max-w-3xl px-4 py-6">
            <MessageList messages={messages} isLoading={isStreaming} />
          </div>
        </ScrollArea>

        {/* Error display */}
        {error && (
          <div className="mx-auto w-full max-w-3xl px-4 py-2">
            <div className="rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-300">
              Error: {error.message}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-2">
          <ChatInput
            input={input}
            setInput={setInput}
            onSubmit={handleFormSubmit}
            isLoading={isStreaming}
          />
        </div>
      </div>

      {/* Linear task panel — desktop only */}
      {linearOpen && (
        <div className="hidden md:flex">
          <LinearPanel onClose={() => setLinearOpen(false)} />
        </div>
      )}
    </div>
  )
}
