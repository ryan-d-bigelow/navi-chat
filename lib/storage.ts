import type { Conversation, ChatMessage } from './types'

export const LOCAL_CONVERSATION_INDEX_KEY = 'navi.chat.conversations'

export interface LocalConversationIndexEntry {
  id: string
  sessionKey?: string | null
  updatedAt: number
}

function readLocalConversationIndex(): LocalConversationIndexEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LOCAL_CONVERSATION_INDEX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry) =>
      entry && typeof entry.id === 'string' && typeof entry.updatedAt === 'number'
    ) as LocalConversationIndexEntry[]
  } catch {
    return []
  }
}

function writeLocalConversationIndex(entries: LocalConversationIndexEntry[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LOCAL_CONVERSATION_INDEX_KEY, JSON.stringify(entries))
}

export function getLocalConversationSessionKeys(): string[] {
  return readLocalConversationIndex()
    .map((entry) => entry.sessionKey)
    .filter((key): key is string => Boolean(key))
}

function syncLocalConversationIndex(conversations: Conversation[]): void {
  writeLocalConversationIndex(
    conversations.map((c) => ({
      id: c.id,
      sessionKey: c.sessionKey ?? null,
      updatedAt: c.updatedAt,
    }))
  )
}

function upsertLocalConversationIndex(conversation: Conversation): void {
  const entries = readLocalConversationIndex()
  const next = entries.filter((entry) => entry.id !== conversation.id)
  next.push({
    id: conversation.id,
    sessionKey: conversation.sessionKey ?? null,
    updatedAt: conversation.updatedAt,
  })
  writeLocalConversationIndex(next)
}

function removeLocalConversationIndex(id: string): void {
  const entries = readLocalConversationIndex().filter((entry) => entry.id !== id)
  writeLocalConversationIndex(entries)
}

interface ApiConversation {
  id: string
  title: string
  created_at: number
  updated_at: number
  last_message_preview: string | null
  openclaw_session_id: string | null
}

function toConversation(api: ApiConversation, messages: ChatMessage[] = []): Conversation {
  return {
    id: api.id,
    title: api.title,
    messages,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    sessionKey: api.openclaw_session_id ?? undefined,
    isPending: false,
    streamingMessageId: null,
  }
}

export async function loadConversations(): Promise<Conversation[]> {
  const res = await fetch('/api/conversations')
  if (!res.ok) return []
  const list: ApiConversation[] = await res.json()
  const conversations = list.map((c) => toConversation(c))
  syncLocalConversationIndex(conversations)
  return conversations
}

export async function loadMessages(conversationId: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/conversations/${conversationId}/messages`)
  if (!res.ok) return []
  const msgs: Array<{
    id: string
    conversation_id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: number
  }> = await res.json()
  return msgs.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
  }))
}

export async function createConversation(id: string, title: string): Promise<Conversation> {
  const res = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, title }),
  })
  const api: ApiConversation = await res.json()
  const conversation = toConversation(api)
  upsertLocalConversationIndex(conversation)
  return conversation
}

export async function deleteConversation(id: string): Promise<void> {
  await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
  removeLocalConversationIndex(id)
}

export async function saveMessage(
  conversationId: string,
  message: ChatMessage
): Promise<void> {
  await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
    }),
  })
}

export async function updateConversationTitle(
  id: string,
  title: string
): Promise<void> {
  await fetch(`/api/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}
