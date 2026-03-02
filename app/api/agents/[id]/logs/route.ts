import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import path from 'path'

export const dynamic = 'force-dynamic'

interface LogLine {
  type: 'log' | 'thinking' | 'error'
  content: string
  timestamp: number
}

function classifyLine(line: string): LogLine['type'] {
  if (
    line.includes('Thinking') ||
    line.includes('<parameter name="thinking">') ||
    line.includes('[thinking]') ||
    line.includes('\u{1F914}')
  ) {
    return 'thinking'
  }
  if (
    line.toLowerCase().includes('error') ||
    line.toLowerCase().includes('fatal') ||
    line.startsWith('E ')
  ) {
    return 'error'
  }
  return 'log'
}

function formatSSE(data: LogLine): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const encoder = new TextEncoder()

  // Try to find a log file for this agent
  const logsDir = path.join(homedir(), '.openclaw/logs')
  const gatewayLog = path.join(logsDir, 'gateway.log')

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'))

      // Strategy 1: Try openclaw process log command
      if (id.startsWith('proc-') || id.length === 36) {
        const sessionArg = id.startsWith('proc-') ? id : id
        const child = spawn('openclaw', ['process', 'log', '--session-id', sessionArg], {
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        let alive = true

        child.stdout.on('data', (chunk: Buffer) => {
          if (!alive) return
          const lines = chunk.toString('utf-8').split('\n')
          for (const line of lines) {
            if (!line.trim()) continue
            const logLine: LogLine = {
              type: classifyLine(line),
              content: line,
              timestamp: Date.now(),
            }
            try {
              controller.enqueue(encoder.encode(formatSSE(logLine)))
            } catch {
              alive = false
              child.kill()
            }
          }
        })

        child.stderr.on('data', (chunk: Buffer) => {
          if (!alive) return
          const logLine: LogLine = {
            type: 'error',
            content: chunk.toString('utf-8').trim(),
            timestamp: Date.now(),
          }
          try {
            controller.enqueue(encoder.encode(formatSSE(logLine)))
          } catch {
            alive = false
            child.kill()
          }
        })

        child.on('error', () => {
          // openclaw command not found — fall back to tailing log file
          streamLogFile(controller, encoder, gatewayLog)
        })

        child.on('close', () => {
          alive = false
          // If the process ended quickly, fall back to log file
          streamLogFile(controller, encoder, gatewayLog)
        })

        // Store cleanup ref
        const cleanup = () => {
          alive = false
          if (!child.killed) child.kill()
        }
        ;(controller as unknown as Record<string, () => void>).__cleanup = cleanup
        return
      }

      // Strategy 2: tail the gateway log
      streamLogFile(controller, encoder, gatewayLog)
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

function streamLogFile(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  logPath: string,
) {
  if (!existsSync(logPath)) {
    const msg: LogLine = {
      type: 'error',
      content: 'No log file found for this agent.',
      timestamp: Date.now(),
    }
    controller.enqueue(encoder.encode(formatSSE(msg)))
    return
  }

  // Tail the last portion of the file
  const child = spawn('tail', ['-n', '200', '-f', logPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let alive = true

  child.stdout.on('data', (chunk: Buffer) => {
    if (!alive) return
    const lines = chunk.toString('utf-8').split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      const logLine: LogLine = {
        type: classifyLine(line),
        content: line,
        timestamp: Date.now(),
      }
      try {
        controller.enqueue(encoder.encode(formatSSE(logLine)))
      } catch {
        alive = false
        child.kill()
      }
    }
  })

  child.on('close', () => {
    alive = false
  })

  ;(controller as unknown as Record<string, () => void>).__cleanup = () => {
    alive = false
    if (!child.killed) child.kill()
  }
}
