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
  const parts = message.parts ?? []
  const fromParts = parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
  if (fromParts.length > 0) return fromParts
  const content = (message as { content?: string }).content
  return typeof content === 'string' ? content : ''
}

function stripUserLabelPrefix(message: UIMessage, text: string): string {
  if (!text) return text
  const meta = message.metadata as Record<string, unknown> | undefined
  const rawCandidates = [
    meta?.name,
    meta?.label,
    meta?.userName,
    (message as { name?: unknown }).name,
  ]
  const candidates = rawCandidates.filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  )
  if (candidates.length === 0) return text

  const trimmed = text.trimStart()
  for (const candidate of candidates) {
    const prefix = `${candidate.trim()}:`
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trimStart()
    }
  }

  return text
}

export function MessageItem({ message, isStreaming }: MessageItemProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    const userText = stripUserLabelPrefix(message, getUserText(message))
    return (
      <article aria-label="You" className="animate-fade-in">
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl bg-zinc-700/80 px-4 py-3">
            <p className="whitespace-pre-wrap text-sm leading-[1.6] text-zinc-100">
              {userText}
            </p>
          </div>
        </div>
      </article>
    )
  }

  const messageType = getMessageType(message)
  const Renderer = renderers[messageType] ?? renderers.text

  return (
    <article aria-label="Navi said" className="animate-fade-in">
      <div className="flex gap-3">
        <Avatar className="h-7 w-7 shrink-0" aria-hidden="true">
          <AvatarFallback className="bg-transparent text-base">
            <span role="img" aria-label="Navi">🧚</span>
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 max-w-[85%] pt-0.5">
          <Renderer message={message} isStreaming={isStreaming} />
          {isStreaming && (
            <span
              className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-full bg-zinc-400 motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </article>
  )
}
