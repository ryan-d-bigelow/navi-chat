import { deleteConversation, updateConversationTitle } from '@/lib/db'
import { broadcast } from '@/lib/sse'
import { NextResponse } from 'next/server'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deleted = deleteConversation(id)
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  broadcast({ type: 'conversation_deleted', payload: { id } })
  return NextResponse.json({ ok: true })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = (await req.json()) as { title?: string }
  if (body.title) {
    updateConversationTitle(id, body.title)
    broadcast({ type: 'conversation_updated', payload: { id, title: body.title } })
  }
  return NextResponse.json({ ok: true })
}
