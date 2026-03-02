import { listConversations, createConversation } from '@/lib/db'
import { broadcast } from '@/lib/sse'
import { NextResponse } from 'next/server'

export async function GET() {
  const conversations = listConversations()
  return NextResponse.json(conversations)
}

export async function POST(req: Request) {
  const body = (await req.json()) as { id?: string; title?: string }
  const id = body.id ?? crypto.randomUUID()
  const title = body.title ?? 'New Chat'
  const conv = createConversation(id, title)
  broadcast({ type: 'conversation_created', payload: conv })
  return NextResponse.json(conv, { status: 201 })
}
