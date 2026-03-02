import { getMessages, appendMessage } from '@/lib/db'
import { broadcast } from '@/lib/sse'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const messages = getMessages(id)
  return NextResponse.json(messages)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = (await req.json()) as {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: number
  }
  const msg = appendMessage({
    id: body.id,
    conversation_id: id,
    role: body.role,
    content: body.content,
    timestamp: body.timestamp,
  })
  broadcast({
    type: 'message_appended',
    payload: { conversation_id: id, message: msg },
  })
  return NextResponse.json(msg, { status: 201 })
}
