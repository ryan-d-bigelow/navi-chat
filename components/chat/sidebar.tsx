'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Conversation } from '@/lib/types'
import {
  Bot,
  MessageSquare,
  MessageSquarePlus,
  Search,
  Terminal,
  Trash2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'

/* ── Helpers ──────────────────────────────────────────────────────────── */

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

const DATE_GROUP_ORDER = [
  'Today',
  'Yesterday',
  'Previous 7 days',
  'Previous 30 days',
  'Older',
] as const

type DateGroup = (typeof DATE_GROUP_ORDER)[number]

function getDateGroup(timestamp: number): DateGroup {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const ms = today.getTime()
  if (timestamp >= ms) return 'Today'
  if (timestamp >= ms - 86_400_000) return 'Yesterday'
  if (timestamp >= ms - 7 * 86_400_000) return 'Previous 7 days'
  if (timestamp >= ms - 30 * 86_400_000) return 'Previous 30 days'
  return 'Older'
}

function groupByDate(
  conversations: Conversation[]
): Array<{ label: DateGroup; items: Conversation[] }> {
  const map = new Map<DateGroup, Conversation[]>()
  for (const c of conversations) {
    const group = getDateGroup(c.updatedAt)
    const arr = map.get(group)
    if (arr) arr.push(c)
    else map.set(group, [c])
  }
  return DATE_GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
    label: g,
    items: map.get(g)!,
  }))
}

/* ── SidebarNav ───────────────────────────────────────────────────────── */

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

/* ── Sidebar ──────────────────────────────────────────────────────────── */

interface SidebarProps {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: SidebarProps) {
  const [search, setSearch] = useState('')
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(
    () => new Set()
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  // Filter & group
  const filtered = useMemo(() => {
    let items = conversations.filter((c) => !pendingDeleteIds.has(c.id))
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter((c) => c.title.toLowerCase().includes(q))
    }
    return items
  }, [conversations, pendingDeleteIds, search])

  const groups = useMemo(() => groupByDate(filtered), [filtered])

  const flatList = useMemo(
    () => groups.flatMap((g) => g.items),
    [groups]
  )

  // Reset focus index when list changes
  useEffect(() => {
    setFocusedIndex(-1)
  }, [search, conversations.length])

  const handleDeleteRequest = useCallback(
    (id: string, title: string) => {
      let undone = false
      const displayTitle =
        title.length > 25 ? title.slice(0, 25) + '\u2026' : title

      setPendingDeleteIds((prev) => new Set([...prev, id]))

      const cleanup = () => {
        setPendingDeleteIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }

      const timerId = setTimeout(() => {
        if (!undone) {
          cleanup()
          onDelete(id)
        }
      }, 4000)

      toast(`Deleted "${displayTitle}"`, {
        duration: 4000,
        action: {
          label: 'Undo',
          onClick: () => {
            undone = true
            clearTimeout(timerId)
            cleanup()
          },
        },
      })
    },
    [onDelete]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        setFocusedIndex((i) =>
          i === -1 ? 0 : Math.min(i + 1, flatList.length - 1)
        )
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        setFocusedIndex((i) =>
          i === -1 ? flatList.length - 1 : Math.max(i - 1, 0)
        )
        break
      }
      case 'Enter': {
        e.preventDefault()
        const conv = flatList[focusedIndex]
        if (conv) onSelect(conv.id)
        break
      }
      case 'Delete':
      case 'Backspace': {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          const conv = flatList[focusedIndex]
          if (conv) handleDeleteRequest(conv.id, conv.title)
        }
        break
      }
    }
  }

  return (
    <nav
      aria-label="Conversations"
      className="glass flex h-full w-[260px] flex-col border-r border-zinc-800/60"
      onKeyDown={handleKeyDown}
    >
      <SidebarNav />
      <Separator className="bg-zinc-800/60" />
      <div className="space-y-2 p-3">
        <Button
          onClick={onNew}
          variant="outline"
          aria-label="Start a new chat"
          className="w-full justify-start gap-2 border-zinc-700/60 bg-zinc-800/60 text-zinc-300 transition-all hover:bg-zinc-700 hover:text-zinc-100 focus-ring"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          New Chat
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats\u2026"
            aria-label="Filter conversations"
            className="h-8 w-full rounded-md border border-zinc-700/60 bg-zinc-800/60 pl-8 pr-8 text-xs text-zinc-300 placeholder:text-zinc-500 transition-colors focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <Separator className="bg-zinc-800/60" />

      {/* BUG FIX: overflow-hidden on ScrollArea root constrains height so viewport scrolls */}
      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState hasSearch={search.trim().length > 0} query={search} />
        ) : (
          <ul
            role="listbox"
            aria-label="Conversation history"
            className="p-2"
            tabIndex={0}
          >
            {groups.map((group) => (
              <li key={group.label} role="presentation">
                <p className="mb-1 mt-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {group.label}
                </p>
                <ul role="group" aria-label={group.label}>
                  {group.items.map((conv) => {
                    const flatIdx = flatList.indexOf(conv)
                    return (
                      <li
                        key={conv.id}
                        role="option"
                        aria-selected={conv.id === activeId}
                        className="animate-slide-in-left"
                      >
                        <ConversationItem
                          conversation={conv}
                          isActive={conv.id === activeId}
                          isFocused={flatIdx === focusedIndex}
                          isEditing={conv.id === editingId}
                          onSelect={() => onSelect(conv.id)}
                          onDelete={() =>
                            handleDeleteRequest(conv.id, conv.title)
                          }
                          onStartRename={() => setEditingId(conv.id)}
                          onRename={(title) => {
                            setEditingId(null)
                            onRename(conv.id, title)
                          }}
                          onCancelRename={() => setEditingId(null)}
                        />
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </nav>
  )
}

/* ── EmptyState ───────────────────────────────────────────────────────── */

function EmptyState({
  hasSearch,
  query,
}: {
  hasSearch: boolean
  query: string
}) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <Search className="h-8 w-8 text-zinc-600" />
        <p className="text-xs text-zinc-500">
          No chats matching &ldquo;{query}&rdquo;
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <MessageSquare className="h-8 w-8 text-zinc-600" />
      <p className="text-sm font-medium text-zinc-400">No conversations yet</p>
      <p className="text-xs text-zinc-500">Start a new chat to begin</p>
    </div>
  )
}

/* ── ConversationItem ─────────────────────────────────────────────────── */

function ConversationItem({
  conversation,
  isActive,
  isFocused,
  isEditing,
  onSelect,
  onDelete,
  onStartRename,
  onRename,
  onCancelRename,
}: {
  conversation: Conversation
  isActive: boolean
  isFocused: boolean
  isEditing: boolean
  onSelect: () => void
  onDelete: () => void
  onStartRename: () => void
  onRename: (title: string) => void
  onCancelRename: () => void
}) {
  const router = useRouter()
  const editInputRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLParagraphElement>(null)
  const itemRef = useRef<HTMLDivElement>(null)
  const [editValue, setEditValue] = useState(conversation.title)
  const [isTruncated, setIsTruncated] = useState(false)

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      setEditValue(conversation.title)
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [isEditing, conversation.title])

  useEffect(() => {
    if (isFocused && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [isFocused])

  useEffect(() => {
    const el = titleRef.current
    if (el) {
      setIsTruncated(el.scrollWidth > el.clientWidth)
    }
  }, [conversation.title])

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const trimmed = editValue.trim()
      if (trimmed && trimmed !== conversation.title) {
        onRename(trimmed)
      } else {
        onCancelRename()
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancelRename()
    }
  }

  const handleEditBlur = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== conversation.title) {
      onRename(trimmed)
    } else {
      onCancelRename()
    }
  }

  const timeLabel = timeAgo(conversation.updatedAt)

  return (
    <div
      ref={itemRef}
      className={`group relative mb-0.5 flex w-full items-center rounded-lg text-left text-sm transition-colors ${
        isActive
          ? 'bg-zinc-800/80 text-zinc-100'
          : isFocused
            ? 'bg-zinc-800/50 text-zinc-200'
            : 'text-zinc-300 hover:bg-zinc-800/40 hover:text-zinc-200'
      }`}
    >
      {/* Active indicator rail */}
      {isActive && (
        <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-emerald-400" />
      )}

      <button
        onClick={onSelect}
        onDoubleClick={(e) => {
          e.preventDefault()
          onStartRename()
        }}
        aria-current={isActive ? 'page' : undefined}
        aria-label={`${conversation.title}, ${timeLabel}`}
        className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left focus-ring"
      >
        {isEditing ? (
          <input
            ref={editInputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={handleEditBlur}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded bg-zinc-700 px-1.5 py-0.5 text-sm font-medium text-zinc-100 outline-none ring-1 ring-zinc-500"
            aria-label="Rename conversation"
          />
        ) : (
          <Tooltip open={isTruncated ? undefined : false}>
            <TooltipTrigger asChild>
              <p ref={titleRef} className="truncate font-medium">
                {conversation.title}
              </p>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {conversation.title}
            </TooltipContent>
          </Tooltip>
        )}
        <p className="mt-0.5 text-xs text-zinc-500">{timeLabel}</p>
      </button>

      {/* BUG FIX: action buttons wrapped in a flex container with pr-1.5
          so they don't get clipped by the ScrollArea viewport/scrollbar.
          group-focus-within ensures buttons stay visible when any has focus. */}
      <div className="flex shrink-0 items-center gap-0.5 pr-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {conversation.sessionId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/agents?agentId=${conversation.sessionId}`)
                }}
                aria-label={`View agent for ${conversation.title}`}
                className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-300 focus-ring"
              >
                <Bot className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={4}>
              View agent
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              aria-label={`Delete ${conversation.title}`}
              className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-red-900/40 hover:text-red-400 focus-ring"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={4}>
            Delete
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
