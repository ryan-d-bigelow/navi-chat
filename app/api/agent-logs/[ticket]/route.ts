import { existsSync, statSync } from 'fs'
import { createReadStream } from 'fs'
import readline from 'readline'

export const dynamic = 'force-dynamic'

const POLL_MS = 500
const IDLE_TIMEOUT_MS = 60_000

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticket: string }> },
) {
  const { ticket } = await params

  // Validate ticket is a number
  if (!/^\d+$/.test(ticket)) {
    return new Response(JSON.stringify({ error: 'Invalid ticket number' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const logPath = `/tmp/nav-${ticket}-agent.log`

  if (!existsSync(logPath)) {
    return new Response(JSON.stringify({ error: `Log file not found: ${logPath}` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let alive = true
      let lastSize = 0
      let lastChangeAt = Date.now()

      const enqueue = (text: string) => {
        if (!alive) return
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          alive = false
        }
      }

      // Send SSE connection comment
      enqueue(': connected\n\n')

      // Phase 1: replay existing file content
      const rl = readline.createInterface({
        input: createReadStream(logPath),
        crlfDelay: Infinity,
      })

      rl.on('line', (line) => {
        if (!alive || !line.trim()) return
        enqueue(`data: ${JSON.stringify({ content: line, timestamp: Date.now() })}\n\n`)
      })

      rl.on('close', () => {
        if (!alive) return

        // Record file size after initial replay
        try {
          lastSize = statSync(logPath).size
        } catch {
          lastSize = 0
        }
        lastChangeAt = Date.now()

        // Phase 2: poll for new content
        const poll = setInterval(() => {
          if (!alive) {
            clearInterval(poll)
            return
          }

          // Check idle timeout
          if (Date.now() - lastChangeAt > IDLE_TIMEOUT_MS) {
            enqueue(`data: ${JSON.stringify({ content: '[stream ended — no new output for 60s]', timestamp: Date.now(), done: true })}\n\n`)
            alive = false
            clearInterval(poll)
            try { controller.close() } catch { /* already closed */ }
            return
          }

          try {
            if (!existsSync(logPath)) return
            const stat = statSync(logPath)
            if (stat.size <= lastSize) return

            // Read only the new bytes
            const readStream = createReadStream(logPath, { start: lastSize, end: stat.size - 1 })
            let buf = ''
            readStream.on('data', (chunk: string | Buffer) => { buf += typeof chunk === 'string' ? chunk : chunk.toString('utf-8') })
            readStream.on('end', () => {
              lastSize = stat.size
              lastChangeAt = Date.now()
              const lines = buf.split('\n')
              for (const line of lines) {
                if (!line.trim() || !alive) continue
                enqueue(`data: ${JSON.stringify({ content: line, timestamp: Date.now() })}\n\n`)
              }
            })
          } catch {
            // File may have been deleted or rotated
          }
        }, POLL_MS)

        ;(controller as unknown as Record<string, () => void>).__cleanup = () => {
          alive = false
          clearInterval(poll)
        }
      })

      rl.on('error', () => {
        alive = false
      })

      // Initial cleanup (before poll phase starts)
      ;(controller as unknown as Record<string, () => void>).__cleanup = () => {
        alive = false
        rl.close()
      }
    },

    cancel(controller) {
      const ctrl = controller as unknown as Record<string, (() => void) | undefined>
      ctrl.__cleanup?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
