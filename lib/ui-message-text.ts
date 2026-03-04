import type { UIMessage } from 'ai'

type ToolPart = {
  type: string
  state?: string
  output?: unknown
  errorText?: string
  toolName?: string
  title?: string
}

const TOOL_TYPE_PREFIX = 'tool-'
const CANVAS_TOOL_HINT = /(canvas|diagram|presentation|whiteboard|render|visual|ui)/i
const READ_TOOL_HINT = /(read|file|cat|open|load)/i

function isToolPart(part: unknown): part is ToolPart {
  return Boolean(part && typeof part === 'object' && typeof (part as ToolPart).type === 'string')
}

function getToolName(part: ToolPart): string | null {
  if (typeof part.toolName === 'string' && part.toolName.trim().length > 0) {
    return part.toolName
  }
  if (typeof part.title === 'string' && part.title.trim().length > 0) {
    return part.title
  }
  if (part.type.startsWith(TOOL_TYPE_PREFIX)) {
    return part.type.slice(TOOL_TYPE_PREFIX.length)
  }
  return null
}

function extractPreferredText(output: Record<string, unknown>): string | null {
  const candidates = [
    output.content,
    output.text,
    output.markdown,
    output.md,
    output.html,
    output.canvas,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return null
}

function stringifyToolOutput(output: unknown): string {
  if (typeof output === 'string') return output
  if (typeof output === 'number' || typeof output === 'boolean' || typeof output === 'bigint') {
    return String(output)
  }
  if (output == null) return ''
  if (Array.isArray(output)) {
    return JSON.stringify(output, null, 2)
  }
  if (output instanceof Uint8Array) {
    try {
      return new TextDecoder().decode(output)
    } catch {
      return JSON.stringify(Array.from(output))
    }
  }
  if (typeof output === 'object') {
    const preferred = extractPreferredText(output as Record<string, unknown>)
    if (preferred) return preferred
    try {
      return JSON.stringify(output, null, 2)
    } catch {
      return String(output)
    }
  }
  return String(output)
}

function shouldRenderAsCanvas(toolName: string | null, output: unknown, text: string): boolean {
  if (!text || text.includes('```canvas')) return false
  const toolHint = toolName ? CANVAS_TOOL_HINT.test(toolName) : false
  const readHint = toolName ? READ_TOOL_HINT.test(toolName) : false

  if (typeof output === 'object' && output) {
    const obj = output as Record<string, unknown>
    const kind = obj.type ?? obj.format ?? obj.kind
    if (kind === 'canvas') return true
    const mime = obj.mimeType ?? obj.mediaType
    if (mime === 'text/html') return true
    if (typeof obj.canvas === 'string' && obj.canvas.trim().length > 0) return true
    if (typeof obj.html === 'string' && obj.html.trim().length > 0 && toolHint) return true
  }

  if (toolHint && text.trim().startsWith('<')) return true
  if (readHint) return false
  return false
}

function formatToolOutput(part: ToolPart): string | null {
  const toolName = getToolName(part)

  if (part.state === 'output-error') {
    const errorText = typeof part.errorText === 'string' ? part.errorText : 'Tool output failed.'
    return toolName ? `Tool error (${toolName}):\n${errorText}` : `Tool error:\n${errorText}`
  }

  if (part.state === 'output-denied') {
    return toolName ? `Tool output (${toolName}) was denied.` : 'Tool output was denied.'
  }

  if (part.state !== 'output-available') return null

  const outputText = stringifyToolOutput(part.output)
  if (!outputText.trim()) return null

  const text = shouldRenderAsCanvas(toolName, part.output, outputText)
    ? `\n\n\`\`\`canvas\n${outputText}\n\`\`\``
    : outputText

  return toolName ? `Tool output (${toolName}):\n${text}` : `Tool output:\n${text}`
}

function appendWithSpacing(base: string, addition: string): string {
  if (!addition) return base
  if (!base) return addition
  if (base.endsWith('\n')) return `${base}\n${addition}`
  return `${base}\n\n${addition}`
}

export function getMessageText(
  message: UIMessage,
  { includeToolOutputs = true }: { includeToolOutputs?: boolean } = {}
): string {
  const parts = message.parts ?? []
  let combined = ''
  let lastWasToolOutput = false

  for (const part of parts) {
    if (part.type === 'text') {
      const text = (part as { text?: string }).text ?? ''
      if (!text) continue
      if (lastWasToolOutput) {
        combined = appendWithSpacing(combined, text)
      } else {
        combined += text
      }
      lastWasToolOutput = false
      continue
    }

    if (includeToolOutputs && isToolPart(part)) {
      const rendered = formatToolOutput(part)
      if (!rendered) continue
      combined = appendWithSpacing(combined, rendered)
      lastWasToolOutput = true
    }
  }

  if (combined.length > 0) return combined
  const content = (message as { content?: string }).content
  return typeof content === 'string' ? content : ''
}

export function hasToolOutputParts(message: UIMessage): boolean {
  const parts = message.parts ?? []
  for (const part of parts) {
    if (!isToolPart(part)) continue
    if (part.state === 'output-available' && part.output != null) return true
    if (part.state === 'output-error' && typeof part.errorText === 'string') return true
    if (part.state === 'output-denied') return true
  }
  return false
}
