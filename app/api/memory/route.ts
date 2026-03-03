import { promises as fs } from 'fs'

export const dynamic = 'force-dynamic'

const MEMORY_PATH = '/Users/naviagent/.openclaw/workspace/MEMORY.md'

export async function GET() {
  try {
    const content = await fs.readFile(MEMORY_PATH, 'utf-8')
    return Response.json({ content })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read memory'
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { content?: unknown }
    if (typeof body.content !== 'string') {
      return Response.json({ error: 'Invalid content' }, { status: 400 })
    }
    await fs.writeFile(MEMORY_PATH, body.content, 'utf-8')
    return Response.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to write memory'
    return Response.json({ error: message }, { status: 500 })
  }
}
