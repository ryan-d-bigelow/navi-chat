import { getAllActiveStreams } from './streaming-buffer'

export type SyncEventType =
  | 'conversation_created'
  | 'conversation_deleted'
  | 'conversation_updated'
  | 'message_appended'
  /** A new token delta from an in-progress stream */
  | 'message_streaming'
  /** Full accumulated content replayed to a freshly connected client */
  | 'message_streaming_state'

export interface SyncEvent {
  type: SyncEventType
  payload: unknown
}

type SSEController = ReadableStreamDefaultController<Uint8Array>

const clients = new Set<SSEController>()

function sendToController(controller: SSEController, event: SyncEvent): boolean {
  const data = `data: ${JSON.stringify(event)}\n\n`
  const encoded = new TextEncoder().encode(data)
  try {
    controller.enqueue(encoded)
    return true
  } catch {
    return false
  }
}

export function addClient(controller: SSEController) {
  clients.add(controller)

  // Immediately replay any in-progress streams to the new client so it can
  // show accumulated tokens if the user reconnected mid-response.
  const activeStreams = getAllActiveStreams()
  for (const stream of activeStreams) {
    if (stream.accumulated.length === 0) continue
    const ok = sendToController(controller, {
      type: 'message_streaming_state',
      payload: {
        conversation_id: stream.conversationId,
        content: stream.accumulated,
      },
    })
    if (!ok) {
      clients.delete(controller)
      return
    }
  }
}

export function removeClient(controller: SSEController) {
  clients.delete(controller)
}

export function broadcast(event: SyncEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`
  const encoded = new TextEncoder().encode(data)
  for (const controller of clients) {
    try {
      controller.enqueue(encoded)
    } catch {
      clients.delete(controller)
    }
  }
}
