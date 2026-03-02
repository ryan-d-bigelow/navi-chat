'use client'

import type { UIMessage } from 'ai'
import { MessageItem } from './message-item'

interface MessageListProps {
  messages: UIMessage[]
  isLoading: boolean
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div
        className="flex h-[60vh] flex-col items-center justify-center text-center"
        role="status"
      >
        <span className="mb-4 text-6xl" role="img" aria-label="Fairy">🧚</span>
        <p className="text-base font-medium text-zinc-400">How can I help you today?</p>
        <p className="mt-1 text-sm text-zinc-600">Type a message below to get started</p>
      </div>
    )
  }

  return (
    <div
      className="space-y-6"
      role="log"
      aria-label="Chat messages"
      aria-live="polite"
      aria-relevant="additions"
    >
      {messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          isStreaming={
            isLoading &&
            message.role === 'assistant' &&
            index === messages.length - 1
          }
        />
      ))}
      {isLoading && (
        <div role="status" aria-live="assertive" className="sr-only">
          Navi is responding...
        </div>
      )}
    </div>
  )
}
