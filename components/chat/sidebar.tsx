'use client'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { Conversation } from '@/lib/types'
import { MessageSquarePlus, Trash2 } from 'lucide-react'
import { useState } from 'react'

interface SidebarProps {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: SidebarProps) {
  return (
    <div className="flex h-full w-[260px] flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="p-3">
        <Button
          onClick={onNew}
          variant="outline"
          className="w-full justify-start gap-2 border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </Button>
      </div>
      <Separator className="bg-zinc-800" />
      <ScrollArea className="flex-1">
        <div className="p-2">
          {conversations.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-zinc-500">
              No conversations yet
            </p>
          )}
          {conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeId}
              onSelect={() => onSelect(conv.id)}
              onDelete={() => onDelete(conv.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
}: {
  conversation: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative mb-0.5 flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
        isActive
          ? 'bg-zinc-800 text-zinc-100'
          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{conversation.title}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {timeAgo(conversation.updatedAt)}
        </p>
      </div>
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="ml-2 shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </button>
  )
}
