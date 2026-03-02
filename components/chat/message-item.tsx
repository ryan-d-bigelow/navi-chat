'use client'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { MessageType } from '@/lib/types'
import type { UIMessage } from 'ai'
import { type ComponentType } from 'react'
import { TextMessage } from './renderers/text-message'

interface MessageItemProps {
  message: UIMessage
  isStreaming?: boolean
}

// Registry of message renderers — add new types here
const renderers: Record<
  MessageType,
  ComponentType<{ message: UIMessage; isStreaming?: boolean }>
> = {
  text: TextMessage,
  audio: TextMessage, // placeholder — swap for AudioMessage when ready
  video: TextMessage, // placeholder — swap for VideoMessage when ready
  'react-component': TextMessage, // placeholder
}

function getMessageType(message: UIMessage): MessageType {
  const meta = message.metadata as Record<string, unknown> | undefined
  return (meta?.type as MessageType) ?? 'text'
}

function getUserText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

export function MessageItem({ message, isStreaming }: MessageItemProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-zinc-700 px-4 py-2.5 text-zinc-100">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {getUserText(message)}
          </p>
        </div>
      </div>
    )
  }

  const messageType = getMessageType(message)
  const Renderer = renderers[messageType] ?? renderers.text

  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-transparent text-lg">
          🧚
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 max-w-[85%]">
        <Renderer message={message} isStreaming={isStreaming} />
        {isStreaming && (
          <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-zinc-400" />
        )}
      </div>
    </div>
  )
}
