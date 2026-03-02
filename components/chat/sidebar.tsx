'use client'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { Conversation } from '@/lib/types'
import { MessageSquare, MessageSquarePlus, Terminal, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

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

export function SidebarNav() {
  const pathname = usePathname()

  const links = [
    { href: '/chat', label: 'Chat', icon: MessageSquare },
    { href: '/agents', label: 'Agents', icon: Terminal },
  ] as const

  return (
    <nav aria-label="Main navigation" className="flex gap-1 p-3">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors focus-ring ${
              active
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: SidebarProps) {
  return (
    <nav
      aria-label="Conversations"
      className="glass flex h-full w-[260px] flex-col border-r border-zinc-800/60"
    >
      <SidebarNav />
      <Separator className="bg-zinc-800/60" />
      <div className="p-3">
        <Button
          onClick={onNew}
          variant="outline"
          aria-label="Start a new chat"
          className="w-full justify-start gap-2 border-zinc-700/60 bg-zinc-800/60 text-zinc-300 transition-all hover:bg-zinc-700 hover:text-zinc-100 focus-ring"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          New Chat
        </Button>
      </div>
      <Separator className="bg-zinc-800/60" />
      <ScrollArea className="flex-1">
        <ul role="list" aria-label="Conversation history" className="p-2">
          {conversations.length === 0 && (
            <li>
              <p className="px-3 py-6 text-center text-xs text-zinc-500">
                No conversations yet
              </p>
            </li>
          )}
          {conversations.map((conv) => (
            <li key={conv.id} className="animate-slide-in-left">
              <ConversationItem
                conversation={conv}
                isActive={conv.id === activeId}
                onSelect={() => onSelect(conv.id)}
                onDelete={() => onDelete(conv.id)}
              />
            </li>
          ))}
        </ul>
      </ScrollArea>
    </nav>
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
  return (
    <div
      className={`group relative mb-0.5 flex w-full items-center rounded-lg text-left text-sm transition-colors ${
        isActive
          ? 'bg-zinc-800/80 text-zinc-100'
          : 'text-zinc-300 hover:bg-zinc-800/40 hover:text-zinc-200'
      }`}
    >
      <button
        onClick={onSelect}
        aria-current={isActive ? 'page' : undefined}
        aria-label={`${conversation.title}, ${timeAgo(conversation.updatedAt)}`}
        className="min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left focus-ring"
      >
        <p className="truncate font-medium">{conversation.title}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {timeAgo(conversation.updatedAt)}
        </p>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        aria-label={`Delete ${conversation.title}`}
        className="ml-1 mr-1 shrink-0 rounded p-2 text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-700 hover:text-zinc-300 focus-visible:opacity-100 focus-ring group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
