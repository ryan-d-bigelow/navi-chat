import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

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
  const { messages } = await req.json()

  // Normalize to simple CoreMessage format that streamText always accepts
  const coreMessages = (messages as InboundMessage[])
    .filter(m => ['user', 'assistant', 'system'].includes(m.role))
    .map(m => ({ role: m.role, content: extractText(m) }))
    .filter(m => m.content.length > 0)

  const result = streamText({
    model: openclaw.chat('agent:main'),
    messages: coreMessages,
  })
  return result.toUIMessageStreamResponse()
}
