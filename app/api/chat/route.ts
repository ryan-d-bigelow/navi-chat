import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const GATEWAY_URL = 'http://127.0.0.1:18789'
const GATEWAY_TOKEN = '0793b4b96017e58f189b26117aa1e9a3258131b73482cdb8'

const openclaw = createOpenAI({
  baseURL: `${GATEWAY_URL}/v1`,
  apiKey: GATEWAY_TOKEN,
})

export async function POST(req: Request) {
  const { messages } = await req.json()
  // Use .chat() to force /v1/chat/completions — OpenClaw doesn't support /v1/responses
  const result = streamText({
    model: openclaw.chat('agent:main'),
    messages,
  })
  return result.toUIMessageStreamResponse()
}
