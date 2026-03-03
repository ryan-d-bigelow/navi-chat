/**
 * Server-side in-memory buffer for in-progress LLM streams.
 *
 * Keyed by conversationId. When a client reconnects mid-stream, the SSE
 * endpoint replays the accumulated content so the user sees what's been
 * streamed so far and continues receiving deltas.
 */

export interface StreamingState {
  conversationId: string
  /** Monotonically growing accumulated text */
  accumulated: string
  startedAt: number
}

const buffers = new Map<string, StreamingState>()

export function startStream(conversationId: string): void {
  buffers.set(conversationId, {
    conversationId,
    accumulated: '',
    startedAt: Date.now(),
  })
}

export function appendStreamChunk(conversationId: string, delta: string): void {
  const state = buffers.get(conversationId)
  if (state) {
    state.accumulated += delta
  }
}

export function finishStream(conversationId: string): void {
  buffers.delete(conversationId)
}

/** Returns the current streaming state for a conversation, or undefined if none. */
export function getActiveStream(conversationId: string): StreamingState | undefined {
  return buffers.get(conversationId)
}

/** Returns all currently active (in-progress) streams. */
export function getAllActiveStreams(): StreamingState[] {
  return Array.from(buffers.values())
}
