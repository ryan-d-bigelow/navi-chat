import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'

const openclaw = createOpenAI({
  baseURL: `${process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789'}/v1`,
  apiKey: process.env.OPENCLAW_TOKEN || 'navi',
})

export async function POST(req: Request) {
  const { messages } = await req.json()
  const result = streamText({
    model: openclaw('agent:main'),
    messages,
  })
  return result.toUIMessageStreamResponse()
}
