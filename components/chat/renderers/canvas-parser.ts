export type CanvasSegment = { type: 'text' | 'canvas'; content: string }

const CANVAS_FENCE_START = /```canvas[ \t]*\n/g
const CANVAS_FENCE_END = /\n```/g

export function parseCanvasSegments(input: string): CanvasSegment[] {
  if (!input) return []

  const segments: CanvasSegment[] = []
  let cursor = 0

  while (cursor < input.length) {
    CANVAS_FENCE_START.lastIndex = cursor
    const startMatch = CANVAS_FENCE_START.exec(input)
    if (!startMatch) break

    const startIndex = startMatch.index
    if (startIndex > cursor) {
      segments.push({ type: 'text', content: input.slice(cursor, startIndex) })
    }

    const contentStart = startIndex + startMatch[0].length
    CANVAS_FENCE_END.lastIndex = contentStart
    const endMatch = CANVAS_FENCE_END.exec(input)

    if (!endMatch) {
      segments.push({ type: 'text', content: input.slice(startIndex) })
      return segments
    }

    const rawContent = input.slice(contentStart, endMatch.index)
    const cleanedContent = rawContent.replace(/^\n/, '').replace(/\n$/, '')
    segments.push({ type: 'canvas', content: cleanedContent })

    cursor = endMatch.index + endMatch[0].length
    if (input[cursor] === '\n') cursor += 1
  }

  if (cursor < input.length) {
    segments.push({ type: 'text', content: input.slice(cursor) })
  }

  if (segments.length === 0) {
    return [{ type: 'text', content: input }]
  }

  return segments
}
