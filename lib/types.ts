export type MessageType = 'text' | 'audio' | 'video' | 'react-component'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  type?: MessageType
  metadata?: Record<string, unknown>
  timestamp: number
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  sessionKey?: string
}
