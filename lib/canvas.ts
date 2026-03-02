import type { UIMessage } from 'ai'

export type CanvasAction = 'present' | 'hide' | 'navigate'

export interface CanvasCommand {
  action: CanvasAction
  content?: string
  url?: string
  title?: string
}

export interface CanvasState {
  content: string | null
  url: string | null
  title: string
  visible: boolean
}

export const CANVAS_INITIAL: CanvasState = {
  content: null,
  url: null,
  title: 'Canvas',
  visible: false,
}

/** Apply a canvas command to produce the next canvas state. */
export function applyCanvasCommand(
  state: CanvasState,
  command: CanvasCommand
): CanvasState {
  switch (command.action) {
    case 'present':
      return {
        content: command.content ?? state.content,
        url: command.url ?? state.url,
        title: command.title ?? state.title,
        visible: true,
      }
    case 'hide':
      return { ...state, visible: false }
    case 'navigate':
      return {
        content: command.url ? null : command.content ?? null,
        url: command.url ?? null,
        title: command.title ?? state.title,
        visible: true,
      }
  }
}

interface ToolInvocationPart {
  type: 'tool-invocation'
  toolInvocation: {
    toolName: string
    args: Record<string, unknown>
    state: string
  }
}

function isToolInvocationPart(part: unknown): part is ToolInvocationPart {
  if (typeof part !== 'object' || part === null) return false
  const p = part as Record<string, unknown>
  if (p.type !== 'tool-invocation') return false
  const inv = p.toolInvocation
  if (typeof inv !== 'object' || inv === null) return false
  return true
}

/**
 * Extract canvas commands from a message's parts array.
 * Looks for tool-invocation parts where toolName is 'canvas'.
 */
export function extractCanvasCommands(message: UIMessage): CanvasCommand[] {
  const commands: CanvasCommand[] = []

  for (const part of message.parts) {
    if (!isToolInvocationPart(part)) continue
    const { toolName, args } = part.toolInvocation
    if (toolName !== 'canvas') continue

    const action = args.action as string | undefined
    if (action !== 'present' && action !== 'hide' && action !== 'navigate')
      continue

    commands.push({
      action,
      content: typeof args.content === 'string' ? args.content : undefined,
      url: typeof args.url === 'string' ? args.url : undefined,
      title: typeof args.title === 'string' ? args.title : undefined,
    })
  }

  return commands
}
