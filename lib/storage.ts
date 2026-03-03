import type { Conversation, ChatMessage } from './types'

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
  }
}

export async function loadConversations(): Promise<Conversation[]> {
  const res = await fetch('/api/conversations')
  if (!res.ok) return []
  const list: ApiConversation[] = await res.json()
  return list.map((c) => toConversation(c))
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
  return toConversation(api)
}

export async function deleteConversation(id: string): Promise<void> {
  await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
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
