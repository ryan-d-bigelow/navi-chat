export type SyncEventType =
  | 'conversation_created'
  | 'conversation_deleted'
  | 'conversation_updated'
  | 'message_appended'

export interface SyncEvent {
  type: SyncEventType
  payload: unknown
}

type SSEController = ReadableStreamDefaultController<Uint8Array>

const clients = new Set<SSEController>()

export function addClient(controller: SSEController) {
  clients.add(controller)
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
