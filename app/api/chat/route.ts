import { streamText, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { broadcast } from '@/lib/sse'
import { startStream, appendStreamChunk, finishStream } from '@/lib/streaming-buffer'

const GATEWAY_URL = 'http://127.0.0.1:18789'
const GATEWAY_TOKEN = '0793b4b96017e58f189b26117aa1e9a3258131b73482cdb8'

const openclaw = createOpenAI({
  baseURL: `${GATEWAY_URL}/v1`,
  apiKey: GATEWAY_TOKEN,
})

type MessagePart = { type: string; text?: string }
type InboundMessage = {
  role: 'user' | 'assistant' | 'system'
  content?: string | MessagePart[]
  parts?: MessagePart[]
  text?: string
}

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

  // Start buffering if we have a conversationId to key on
  if (conversationId) {
    startStream(conversationId)
  }

  const result = streamText({
    model: openclaw.chat('agent:main'),
    messages: coreMessages,
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
      }
    },
    onFinish: () => {
      if (conversationId) {
        finishStream(conversationId)
      }
    },
    onError: () => {
      if (conversationId) {
        finishStream(conversationId)
      }
    },
  })

  return result.toUIMessageStreamResponse()
}
