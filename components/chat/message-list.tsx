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
      <div className="flex h-[60vh] flex-col items-center justify-center text-center">
        <span className="mb-4 text-6xl">🧚</span>
        <p className="text-lg text-zinc-400">How can I help you today?</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
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
    </div>
  )
}
