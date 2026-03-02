import { createReadStream } from 'fs'
import { existsSync, statSync } from 'fs'
import { homedir } from 'os'
import path from 'path'
import { spawn } from 'child_process'
import readline from 'readline'

export const dynamic = 'force-dynamic'

interface LogLine {
  type: 'log' | 'thinking' | 'error' | 'tool' | 'system'
  content: string
  timestamp: number
}

function formatSSE(data: LogLine): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

/** Parse a single JSONL entry from an OpenClaw session file into a LogLine (or null to skip) */
function parseSessionEntry(raw: string): LogLine | null {
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }

  const type = obj.type as string
  const timestamp = obj.timestamp
    ? new Date(obj.timestamp as string).getTime()
    : Date.now()

  if (type === 'message') {
    const msg = obj.message as { role: string; content: unknown; timestamp?: number } | undefined
    if (!msg) return null
    const ts = msg.timestamp ?? timestamp
    const role = msg.role

    // Flatten content blocks
    const content = msg.content
    const texts: string[] = []
    const tools: string[] = []
    const thinkings: string[] = []

    if (typeof content === 'string') {
      texts.push(content)
    } else if (Array.isArray(content)) {
      for (const block of content as Record<string, unknown>[]) {
        if (block.type === 'text' && typeof block.text === 'string') {
          texts.push(block.text)
        } else if (block.type === 'tool_use') {
          tools.push(`→ ${block.name}(${JSON.stringify(block.input ?? {}).slice(0, 120)})`)
        } else if (block.type === 'tool_result') {
          const resultText =
            typeof block.content === 'string'
              ? block.content
              : JSON.stringify(block.content).slice(0, 200)
          tools.push(`← ${resultText}`)
        } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
          thinkings.push(block.thinking)
        }
      }
    }

    const lines: LogLine[] = []
    for (const t of thinkings) {
      lines.push({ type: 'thinking', content: t.slice(0, 500), timestamp: ts })
    }
    for (const t of tools) {
      lines.push({ type: 'tool', content: t, timestamp: ts })
    }
    const combined = texts.join('\n').trim()
    if (combined) {
      const lineType: LogLine['type'] = role === 'user' ? 'system' : 'log'
      lines.push({ type: lineType, content: combined.slice(0, 1000), timestamp: ts })
    }

    // Return the first meaningful line; caller will handle multi-line via a batch approach
    // (We use a different streaming approach below that handles this)
    return lines[0] ?? null
  }

  if (type === 'thinking') {
    const thinking = obj.thinking as string | undefined
    if (!thinking) return null
    return { type: 'thinking', content: thinking.slice(0, 500), timestamp }
  }

  // Skip session/model/custom metadata silently
  return null
}

/** Emit all LogLines from a session message entry (may produce multiple) */
function parseSessionEntryAll(raw: string): LogLine[] {
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(raw)
  } catch {
    return []
  }

  const type = obj.type as string
  const timestamp = obj.timestamp
    ? new Date(obj.timestamp as string).getTime()
    : Date.now()

  if (type === 'message') {
    const msg = obj.message as { role: string; content: unknown; timestamp?: number } | undefined
    if (!msg) return []
    const ts = (msg.timestamp as number | undefined) ?? timestamp
    const role = msg.role
    const content = msg.content
    const lines: LogLine[] = []

    if (typeof content === 'string') {
      lines.push({ type: role === 'user' ? 'system' : 'log', content: content.slice(0, 1000), timestamp: ts })
    } else if (Array.isArray(content)) {
      for (const block of content as Record<string, unknown>[]) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          lines.push({
            type: role === 'user' ? 'system' : 'log',
            content: (block.text as string).slice(0, 1000),
            timestamp: ts,
          })
        } else if (block.type === 'tool_use') {
          lines.push({
            type: 'tool',
            content: `→ ${block.name}(${JSON.stringify(block.input ?? {}).slice(0, 120)})`,
            timestamp: ts,
          })
        } else if (block.type === 'tool_result') {
          const resultText =
            typeof block.content === 'string'
              ? (block.content as string)
              : JSON.stringify(block.content).slice(0, 200)
          lines.push({ type: 'tool', content: `← ${resultText.slice(0, 200)}`, timestamp: ts })
        } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
          lines.push({ type: 'thinking', content: (block.thinking as string).slice(0, 500), timestamp: ts })
        }
      }
    }
    return lines
  }

  if (type === 'thinking') {
    const thinking = obj.thinking as string | undefined
    if (!thinking) return []
    return [{ type: 'thinking', content: thinking.slice(0, 500), timestamp }]
  }

  return []
}

/** Stream a session JSONL file — first replay history, then tail for new lines */
function streamSessionFile(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  sessionPath: string,
) {
  let alive = true
  let lastSize = 0

  // Phase 1: replay historical lines
  const rl = readline.createInterface({
    input: createReadStream(sessionPath),
    crlfDelay: Infinity,
  })

  rl.on('line', (line) => {
    if (!alive || !line.trim()) return
    const entries = parseSessionEntryAll(line)
    for (const entry of entries) {
      try {
        controller.enqueue(encoder.encode(formatSSE(entry)))
      } catch {
        alive = false
        rl.close()
      }
    }
  })

  rl.on('close', () => {
    if (!alive) return
    // Phase 2: tail for new lines
    try {
      lastSize = statSync(sessionPath).size
    } catch {
      lastSize = 0
    }

    const pollInterval = setInterval(() => {
      if (!alive) {
        clearInterval(pollInterval)
        return
      }
      try {
        const size = statSync(sessionPath).size
        if (size <= lastSize) return

        const child = spawn('tail', ['-c', `+${lastSize + 1}`, sessionPath], {
          stdio: ['ignore', 'pipe', 'ignore'],
        })

        let buf = ''
        child.stdout.on('data', (chunk: Buffer) => {
          buf += chunk.toString('utf-8')
        })

        child.on('close', () => {
          lastSize = size
          const newLines = buf.split('\n')
          for (const line of newLines) {
            if (!line.trim() || !alive) continue
            const entries = parseSessionEntryAll(line)
            for (const entry of entries) {
              try {
                controller.enqueue(encoder.encode(formatSSE(entry)))
              } catch {
                alive = false
                clearInterval(pollInterval)
              }
            }
          }
        })
      } catch {
        // file may have been deleted
      }
    }, 2000)

    const cleanup = () => {
      alive = false
      clearInterval(pollInterval)
    }
    ;(controller as unknown as Record<string, () => void>).__cleanup = cleanup
  })

  ;(controller as unknown as Record<string, () => void>).__cleanup = () => {
    alive = false
    rl.close()
  }
}

/** Tail a log file (generic, for process agents or fallback) */
function tailLogFile(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  logPath: string,
  label?: string,
) {
  if (!existsSync(logPath)) {
    const msg: LogLine = {
      type: 'error',
      content: label ? `No log file found for ${label}.` : 'No log file found for this agent.',
      timestamp: Date.now(),
    }
    try {
      controller.enqueue(encoder.encode(formatSSE(msg)))
    } catch {
      // ignore
    }
    return
  }

  const child = spawn('tail', ['-n', '200', '-f', logPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let alive = true

  child.stdout.on('data', (chunk: Buffer) => {
    if (!alive) return
    const lines = chunk.toString('utf-8').split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      let lineType: LogLine['type'] = 'log'
      const lower = line.toLowerCase()
      if (lower.includes('error') || lower.includes('fatal')) lineType = 'error'
      else if (line.includes('🧠') || lower.includes('[thinking]')) lineType = 'thinking'
      const logLine: LogLine = { type: lineType, content: line, timestamp: Date.now() }
      try {
        controller.enqueue(encoder.encode(formatSSE(logLine)))
      } catch {
        alive = false
        child.kill()
      }
    }
  })

  child.on('close', () => { alive = false })

  ;(controller as unknown as Record<string, () => void>).__cleanup = () => {
    alive = false
    if (!child.killed) child.kill()
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'))

      // ── Strategy 1: OpenClaw session (UUID) ──────────────────────────────
      // Look for the per-session JSONL in ~/.openclaw/agents/main/sessions/
      if (id.length === 36 && !id.startsWith('proc-')) {
        const sessionsDir = path.join(homedir(), '.openclaw/agents/main/sessions')
        const sessionFile = path.join(sessionsDir, `${id}.jsonl`)

        if (existsSync(sessionFile)) {
          streamSessionFile(controller, encoder, sessionFile)
          return
        }

        // Session file not found — could be a deleted/pruned session
        const msg: LogLine = {
          type: 'error',
          content: `No session log found for ${id}. The session may have been pruned.`,
          timestamp: Date.now(),
        }
        try {
          controller.enqueue(encoder.encode(formatSSE(msg)))
        } catch {
          // ignore
        }
        return
      }

      // ── Strategy 2: Local process (proc-<pid>) ───────────────────────────
      if (id.startsWith('proc-')) {
        const pid = id.slice(5)
        const logsDir = path.join(homedir(), '.openclaw/logs')

        // Look for a pid-specific log file (e.g. written by navi_ops)
        const pidLog = path.join(logsDir, `agent-${pid}.log`)
        if (existsSync(pidLog)) {
          tailLogFile(controller, encoder, pidLog, `PID ${pid}`)
          return
        }

        // No per-process log — inform the user rather than showing gateway.log
        const info: LogLine = {
          type: 'system',
          content: `Process PID ${pid} — no dedicated log file found. Output may be in a terminal session.`,
          timestamp: Date.now(),
        }
        try {
          controller.enqueue(encoder.encode(formatSSE(info)))
        } catch {
          // ignore
        }
        return
      }

      // ── Fallback: unknown id format ──────────────────────────────────────
      const msg: LogLine = {
        type: 'error',
        content: `Unknown agent id format: ${id}`,
        timestamp: Date.now(),
      }
      try {
        controller.enqueue(encoder.encode(formatSSE(msg)))
      } catch {
        // ignore
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
