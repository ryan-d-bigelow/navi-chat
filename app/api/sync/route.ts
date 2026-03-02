import { addClient, removeClient } from '@/lib/sse'

export const dynamic = 'force-dynamic'

export async function GET() {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      addClient(controller)
      // Send initial keepalive
      controller.enqueue(new TextEncoder().encode(': connected\n\n'))
    },
    cancel(controller) {
      removeClient(controller)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
