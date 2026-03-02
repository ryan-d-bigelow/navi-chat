'use client'

import { ChatInput } from '@/components/chat/chat-input'
import { MessageList } from '@/components/chat/message-list'
import { Sidebar } from '@/components/chat/sidebar'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  loadConversations,
  saveConversations,
  createConversation,
  deleteConversation,
} from '@/lib/storage'
import type { Conversation } from '@/lib/types'
import { useChat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { Menu } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

function toUIMessages(messages: Conversation['messages']): UIMessage[] {
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
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setConversations(loadConversations())
  }, [])

  const activeConversation = conversations.find((c) => c.id === activeId)

  const { messages, sendMessage, status, setMessages } = useChat({
    messages: activeConversation ? toUIMessages(activeConversation.messages) : [],
    onFinish: ({ message }) => {
      const content = getTextContent(message)
      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.id !== activeId) return c
          const exists = c.messages.some((m) => m.id === message.id)
          if (exists) return c
          return {
            ...c,
            messages: [
              ...c.messages,
              {
                id: message.id,
                role: message.role as 'user' | 'assistant',
                content,
                timestamp: Date.now(),
              },
            ],
            updatedAt: Date.now(),
          }
        })
        saveConversations(updated)
        return updated
      })
    },
  })

  const isStreaming = status === 'streaming' || status === 'submitted'

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleNewChat = useCallback(() => {
    const conv = createConversation('New Chat')
    setConversations((prev) => {
      const updated = [conv, ...prev]
      saveConversations(updated)
      return updated
    })
    setActiveId(conv.id)
    setMessages([])
    setInput('')
    setSidebarOpen(false)
  }, [setMessages])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveId(id)
      const conv = conversations.find((c) => c.id === id)
      if (conv) {
        setMessages(toUIMessages(conv.messages))
      }
      setInput('')
      setSidebarOpen(false)
    },
    [conversations, setMessages]
  )

  const handleDeleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const updated = deleteConversation(prev, id)
        return updated
      })
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

    if (!currentActiveId) {
      const title = text.slice(0, 30) + (text.length > 30 ? '...' : '')
      const conv = createConversation(title)
      conv.messages.push({
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      })
      currentActiveId = conv.id
      setConversations((prev) => {
        const updated = [conv, ...prev]
        saveConversations(updated)
        return updated
      })
      setActiveId(conv.id)
    } else {
      setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c.id !== currentActiveId) return c
          const title =
            c.messages.length === 0
              ? text.slice(0, 30) + (text.length > 30 ? '...' : '')
              : c.title
          return {
            ...c,
            title,
            messages: [
              ...c.messages,
              {
                id: crypto.randomUUID(),
                role: 'user' as const,
                content: text,
                timestamp: Date.now(),
              },
            ],
            updatedAt: Date.now(),
          }
        })
        saveConversations(updated)
        return updated
      })
    }

    setInput('')
    sendMessage({ text })
  }, [activeId, input, sendMessage])

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
      <div className="flex flex-1 flex-col">
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
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="mx-auto max-w-3xl px-4 py-6">
            <MessageList messages={messages} isLoading={isStreaming} />
          </div>
        </ScrollArea>

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
    </div>
  )
}
