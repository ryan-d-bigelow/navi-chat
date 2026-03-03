import { streamText, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { broadcast } from '@/lib/sse'
import { startStream, appendStreamChunk, finishStream } from '@/lib/streaming-buffer'
import { updateConversationSessionKey } from '@/lib/db'
import { readFileSync, existsSync, createReadStream, statSync } from 'fs'
import { homedir } from 'os'
import path from 'path'

const GATEWAY_URL = 'http://127.0.0.1:18789'
const GATEWAY_TOKEN = '0793b4b96017e58f189b26117aa1e9a3258131b73482cdb8'

const openclaw = createOpenAI({
  baseURL: `${GATEWAY_URL}/v1`,
  apiKey: GATEWAY_TOKEN,
})

function findLatestOpenAISessionKey(): string | null {
  const sessionsPath = path.join(homedir(), '.openclaw/agents/main/sessions/sessions.json')
  if (!existsSync(sessionsPath)) return null
  try {
    const raw = readFileSync(sessionsPath, 'utf-8')
    const sessions = JSON.parse(raw) as Record<string, { sessionId: string; updatedAt: number }>
    let latest: { key: string; updatedAt: number } | null = null
    for (const [key, session] of Object.entries(sessions)) {
      if (!key.startsWith('agent:main:openai:') && !key.startsWith('agent:main:openai-user:')) continue
      if (!latest || session.updatedAt > latest.updatedAt) {
        latest = { key, updatedAt: session.updatedAt }
      }
    }
    return latest?.key ?? null
  } catch {
    return null
  }
}

function findOpenAiSessionKeyForConversation(conversationId: string): string | null {
  const sessionsPath = path.join(homedir(), '.openclaw/agents/main/sessions/sessions.json')
  if (!existsSync(sessionsPath)) return null
  const normalizedId = conversationId.trim().toLowerCase()
  if (!normalizedId) return null
  const sessionKey = `agent:main:openai-user:${normalizedId}`
  try {
    const raw = readFileSync(sessionsPath, 'utf-8')
    const sessions = JSON.parse(raw) as Record<string, { sessionId?: string }>
    const entry = sessions[sessionKey]
    return entry ? sessionKey : null
  } catch {
    return null
  }
}

function findOpenAiSessionFileForConversation(conversationId: string): string | null {
  const sessionsPath = path.join(homedir(), '.openclaw/agents/main/sessions/sessions.json')
  if (!existsSync(sessionsPath)) return null
  const normalizedId = conversationId.trim().toLowerCase()
  if (!normalizedId) return null
  const sessionKey = `agent:main:openai-user:${normalizedId}`
  try {
    const raw = readFileSync(sessionsPath, 'utf-8')
    const sessions = JSON.parse(raw) as Record<string, { sessionFile?: string }>
    const entry = sessions[sessionKey]
    const sessionFile = entry?.sessionFile
    if (sessionFile && existsSync(sessionFile)) return sessionFile
  } catch {
    return null
  }
  return null
}

type MessagePart = { type: string; text?: string }
type InboundMessage = {
  role: 'user' | 'assistant' | 'system'
  content?: string | MessagePart[]
  parts?: MessagePart[]
  text?: string
}

type ReasoningChunk = { type: 'reasoning-delta'; reasoning?: string; text?: string }
type ToolCallChunk = { type: 'tool-call'; toolName?: string; name?: string }
type ToolInputStartChunk = { type: 'tool-input-start'; toolName?: string; name?: string }

type SessionLogEntry =
  | {
      type: 'message'
      message?: { content?: Array<{ type?: string; thinking?: string }> }
    }
  | { type: 'thinking'; thinking?: string }

/** Extract plain text from any message format the Vercel AI SDK might send */
function extractText(msg: InboundMessage): string {
  // Plain string content
  if (typeof msg.content === 'string') return msg.content
  // Content array (CoreMessage style)
  if (Array.isArray(msg.content)) {
    return msg.content.filter(p => p.type === 'text').map(p => p.text ?? '').join('')
  }
  // UIMessage v3 parts array
  if (Array.isArray(msg.parts)) {
    return msg.parts.filter(p => p.type === 'text').map(p => p.text ?? '').join('')
  }
  // Fallback
  return msg.text ?? ''
}

function extractThinkingBlocks(line: string): string[] {
  if (!line.trim()) return []
  let obj: SessionLogEntry
  try {
    obj = JSON.parse(line) as SessionLogEntry
  } catch {
    return []
  }

  if (obj.type === 'thinking') {
    return typeof obj.thinking === 'string' ? [obj.thinking] : []
  }

  if (obj.type === 'message') {
    const content = obj.message?.content
    if (!Array.isArray(content)) return []
    return content
      .filter((block) => block?.type === 'thinking' && typeof block.thinking === 'string')
      .map((block) => block.thinking as string)
  }

  return []
}

function startThinkingWatcher(conversationId: string) {
  let stopped = false
  let pollTimer: NodeJS.Timeout | null = null
  let tailTimer: NodeJS.Timeout | null = null
  let sessionPath: string | null = null
  let lastSize = 0
  let pending = ''
  let lastThinking = ''

  const stop = () => {
    stopped = true
    if (pollTimer) clearInterval(pollTimer)
    if (tailTimer) clearInterval(tailTimer)
  }

  const readNew = () => {
    if (stopped || !sessionPath) return
    try {
      const size = statSync(sessionPath).size
      if (size <= lastSize) return
      const stream = createReadStream(sessionPath, { start: lastSize, end: size - 1 })
      let buf = ''
      stream.on('data', (chunk: string | Buffer) => {
        buf += Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : chunk
      })
      stream.on('end', () => {
        lastSize = size
        const combined = pending + buf
        const lines = combined.split('\n')
        pending = lines.pop() ?? ''
        for (const line of lines) {
          const thinkingBlocks = extractThinkingBlocks(line)
          for (const text of thinkingBlocks) {
            const trimmed = text.trim()
            if (!trimmed || trimmed === lastThinking) continue
            lastThinking = trimmed
            broadcast({
              type: 'thinking_update',
              payload: {
                conversation_id: conversationId,
                text: trimmed,
              },
            })
          }
        }
      })
      stream.on('error', () => {
        // ignore read errors; next poll will retry
      })
    } catch {
      // file may be missing or truncated; ignore
    }
  }

  const maybeStart = () => {
    if (stopped) return
    if (!sessionPath) {
      const found = findOpenAiSessionFileForConversation(conversationId)
      if (!found) return
      sessionPath = found
      try {
        lastSize = statSync(sessionPath).size
      } catch {
        lastSize = 0
      }
      tailTimer = setInterval(readNew, 400)
    }
  }

  pollTimer = setInterval(maybeStart, 300)
  return stop
}

export async function POST(req: Request) {
  const body = await req.json()
  const { messages, conversationId } = body as {
    messages: InboundMessage[]
    conversationId?: string
  }

  // Normalize to simple CoreMessage format that streamText always accepts
  const coreMessages = (messages as InboundMessage[])
    .filter(m => ['user', 'assistant', 'system'].includes(m.role))
    .map(m => ({ role: m.role, content: extractText(m) }))
    .filter(m => m.content.length > 0)
  const systemNote = {
    role: 'system' as const,
    content:
      'You can embed canvas content inline using triple-backtick canvas fences. Use this for plans, architecture diagrams, tables, dashboards, or any concept where visual beats text. Canvas supports HTML/CSS/JS.',
  }
  const finalMessages = [systemNote, ...coreMessages]

  // Start buffering if we have a conversationId to key on
  if (conversationId) {
    startStream(conversationId)
  }

  const thinkingStopper = conversationId ? startThinkingWatcher(conversationId) : null
  const openaiUser = conversationId ? conversationId.trim().toLowerCase() : undefined

  const result = streamText({
    model: openclaw.chat('agent:main'),
    messages: finalMessages,
    providerOptions: openaiUser ? { openai: { user: openaiUser } } : undefined,
    tools: {
      canvas: {
        description:
          'Present visual content in the canvas side panel. Use this when your response includes structured data, diagrams, plans, tables, or formatted content that benefits from a dedicated visual space. Actions: "present" shows content, "hide" closes the panel, "navigate" loads a URL.',
        inputSchema: z.object({
          action: z
            .enum(['present', 'hide', 'navigate'])
            .describe('Canvas action to perform'),
          content: z
            .string()
            .optional()
            .describe(
              'Markdown or HTML content to display (for present action)'
            ),
          url: z
            .string()
            .optional()
            .describe('URL to load in the canvas (for navigate action)'),
          title: z
            .string()
            .optional()
            .describe('Title for the canvas panel header'),
        }),
        // Canvas tool is client-side — result is forwarded to the UI for rendering.
        execute: async (args: { action: string; content?: string; url?: string; title?: string }) => args,
      },
    },
    stopWhen: stepCountIs(3),
    // Tap each text chunk to buffer + broadcast via SSE so reconnecting clients
    // can see in-progress tokens.
    onChunk: ({ chunk }) => {
      if (!conversationId) return
      if (chunk.type === 'text-delta') {
        // AI SDK v6: text-delta chunk uses `.text` (not `.textDelta`)
        const delta = (chunk as { type: 'text-delta'; text: string }).text
        appendStreamChunk(conversationId, delta)
        broadcast({
          type: 'message_streaming',
          payload: {
            conversation_id: conversationId,
            delta,
          },
        })
        return
      }

      if (chunk.type === 'reasoning-delta') {
        const reasoningChunk = chunk as ReasoningChunk
        const text = reasoningChunk.reasoning ?? reasoningChunk.text ?? ''
        if (!text) return
        broadcast({
          type: 'thinking_update',
          payload: {
            conversation_id: conversationId,
            text,
          },
        })
        return
      }

      if (chunk.type === 'tool-call' || chunk.type === 'tool-input-start') {
        const toolChunk =
          chunk.type === 'tool-call'
            ? (chunk as ToolCallChunk)
            : (chunk as ToolInputStartChunk)
        const toolName = toolChunk.toolName ?? toolChunk.name
        if (!toolName) return
        broadcast({
          type: 'thinking_update',
          payload: {
            conversation_id: conversationId,
            text: `Using ${toolName}...`,
          },
        })
        return
      }
    },
    onFinish: () => {
      thinkingStopper?.()
      if (conversationId) {
        finishStream(conversationId)
        // Give OpenClaw a moment to flush session state, then link the session
        const capturedConversationId = conversationId
        setTimeout(() => {
          const sessionKey =
            findOpenAiSessionKeyForConversation(capturedConversationId) ?? findLatestOpenAISessionKey()
          if (sessionKey) {
            updateConversationSessionKey(capturedConversationId, sessionKey)
            broadcast({
              type: 'conversation_session_linked',
              payload: { conversation_id: capturedConversationId, session_key: sessionKey },
            })
          }
        }, 500)
      }
    },
    onError: () => {
      thinkingStopper?.()
      if (conversationId) {
        finishStream(conversationId)
      }
    },
  })

  return result.toUIMessageStreamResponse({ sendReasoning: false })
}
