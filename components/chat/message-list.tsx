'use client'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { UIMessage } from 'ai'
import { MessageItem } from './message-item'

interface MessageListProps {
  messages: UIMessage[]
  isLoading: boolean
  isThinking: boolean
  thinkingText?: string | null
}

function ThinkingBubble({ thinkingText }: { thinkingText?: string | null }) {
  const trimmedText = thinkingText?.trim()
  const displayText =
    trimmedText && trimmedText.length > 100
      ? `${trimmedText.slice(0, 100).trimEnd()}…`
      : trimmedText

  return (
    <article aria-label="Navi is thinking" className="animate-fade-in">
      <div className="flex gap-3">
        <Avatar className="h-7 w-7 shrink-0" aria-hidden="true">
          <AvatarFallback className="bg-transparent text-base">
            <span role="img" aria-label="Navi">🧚</span>
          </AvatarFallback>
        </Avatar>
        {displayText ? (
          <div className="flex items-start gap-2 pt-0.5 text-xs text-zinc-500 italic transition-opacity duration-200">
            <span aria-hidden="true">🧠</span>
            <span key={displayText} className="line-clamp-2 max-w-[80%] animate-fade-in">
              {displayText}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 pt-1.5">
            <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:300ms]" />
            <span className="sr-only">Navi is thinking...</span>
          </div>
        )}
      </div>
    </article>
  )
}

export function MessageList({ messages, isLoading, isThinking, thinkingText }: MessageListProps) {
  if (messages.length === 0 && !isThinking) {
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
      {isThinking && <ThinkingBubble thinkingText={thinkingText} />}
      {isLoading && (
        <div role="status" aria-live="assertive" className="sr-only">
          Navi is responding...
        </div>
      )}
    </div>
  )
}
