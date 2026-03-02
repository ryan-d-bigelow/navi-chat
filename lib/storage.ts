import type { Conversation } from './types'

const STORAGE_KEY = 'navi-chat-conversations'

export function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveConversations(conversations: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
}

export function createConversation(title: string): Conversation {
  return {
    id: crypto.randomUUID(),
    title,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function deleteConversation(
  conversations: Conversation[],
  id: string
): Conversation[] {
  const updated = conversations.filter((c) => c.id !== id)
  saveConversations(updated)
  return updated
}
