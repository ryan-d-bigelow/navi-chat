import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

interface HeartbeatEvent {
  timestamp: number
  check: string
  outcome: string
  source: 'healthcheck' | 'memory' | 'jsonl'
  severity?: 'info' | 'warn' | 'error'
}

const LOG_DIR = '/Users/naviagent/.openclaw/logs'
const MEMORY_DIR = '/Users/naviagent/.openclaw/workspace/memory'
const JSONL_CANDIDATES = [
  path.join(LOG_DIR, 'heartbeat-log.jsonl'),
  path.join(MEMORY_DIR, 'heartbeat-log.jsonl'),
]
const HEALTHCHECK_LOG = path.join(LOG_DIR, 'healthcheck.log')

async function fileExists(filePath: string) {
  try {
    await fs.stat(filePath)
    return true
  } catch {
    return false
  }
}

function splitMessage(message: string) {
  if (message.includes(' — ')) {
    const [left, ...rest] = message.split(' — ')
    return { check: left.trim(), outcome: rest.join(' — ').trim() }
  }
  if (message.includes(': ')) {
    const [left, ...rest] = message.split(': ')
    return { check: left.trim(), outcome: rest.join(': ').trim() }
  }
  return { check: message.trim(), outcome: '' }
}

function inferSeverity(text: string): HeartbeatEvent['severity'] {
  if (/failed|unresponsive|error|missing|not found|could not/i.test(text)) {
    return 'error'
  }
  if (/retry|attempt|restart|warning|revived|kickstart/i.test(text)) {
    return 'warn'
  }
  return 'info'
}

function parseHealthcheckLog(contents: string): HeartbeatEvent[] {
  const events: HeartbeatEvent[] = []
  const lines = contents.split('\n')
  for (const line of lines) {
    const match = line.match(
      /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) \\[healthcheck\\] (.*)$/
    )
    if (!match) continue
    const [, date, time, message] = match
    const timestamp = new Date(`${date}T${time}`).getTime()
    if (Number.isNaN(timestamp)) continue
    const { check, outcome } = splitMessage(message)
    events.push({
      timestamp,
      check,
      outcome,
      source: 'healthcheck',
      severity: inferSeverity(message),
    })
  }
  return events
}

function parseTimeString(date: Date, timeStr: string) {
  const match = timeStr.trim().match(/(\\d{1,2}):(\\d{2})\\s*(AM|PM)/i)
  if (!match) return null
  let hours = Number(match[1])
  const minutes = Number(match[2])
  const meridiem = match[3].toUpperCase()
  if (meridiem === 'PM' && hours < 12) hours += 12
  if (meridiem === 'AM' && hours === 12) hours = 0
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
    0
  ).getTime()
}

function parseHeartbeatSection(
  date: Date,
  timeStr: string,
  lines: string[]
): HeartbeatEvent[] {
  const timestamp = parseTimeString(date, timeStr)
  if (!timestamp) return []
  const events: HeartbeatEvent[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('- ')) continue
    const text = trimmed.slice(2).trim()
    if (!text) continue
    const { check, outcome } = splitMessage(text)
    events.push({
      timestamp,
      check,
      outcome,
      source: 'memory',
      severity: inferSeverity(text),
    })
  }
  return events
}

function parseMemoryFile(date: Date, contents: string): HeartbeatEvent[] {
  const events: HeartbeatEvent[] = []
  const lines = contents.split('\n')
  let activeTime: string | null = null
  let bucket: string[] = []

  const flush = () => {
    if (activeTime && bucket.length > 0) {
      events.push(...parseHeartbeatSection(date, activeTime, bucket))
    }
    bucket = []
  }

  for (const line of lines) {
    const headerMatch = line.match(/^##\\s+Heartbeat\\s+—\\s+(.+)$/)
    if (headerMatch) {
      flush()
      activeTime = headerMatch[1].trim()
      continue
    }
    if (line.startsWith('## ')) {
      flush()
      activeTime = null
      continue
    }
    if (activeTime) bucket.push(line)
  }
  flush()
  return events
}

async function parseMemoryHeartbeats(): Promise<HeartbeatEvent[]> {
  const events: HeartbeatEvent[] = []
  let files: string[] = []
  try {
    files = await fs.readdir(MEMORY_DIR)
  } catch {
    return events
  }
  const dailyNotes = files
    .filter((file) => /^\\d{4}-\\d{2}-\\d{2}\\.md$/.test(file))
    .sort()

  for (const file of dailyNotes) {
    const date = new Date(file.replace('.md', 'T00:00:00'))
    if (Number.isNaN(date.getTime())) continue
    try {
      const contents = await fs.readFile(path.join(MEMORY_DIR, file), 'utf8')
      events.push(...parseMemoryFile(date, contents))
    } catch {
      continue
    }
  }
  return events
}

function parseJsonl(contents: string): HeartbeatEvent[] {
  const events: HeartbeatEvent[] = []
  const lines = contents.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed) as Partial<HeartbeatEvent> & {
        timestamp?: number | string
        check?: string
        outcome?: string
        source?: HeartbeatEvent['source']
        severity?: HeartbeatEvent['severity']
      }
      if (!parsed.timestamp || !parsed.check) continue
      const timestamp =
        typeof parsed.timestamp === 'string'
          ? new Date(parsed.timestamp).getTime()
          : parsed.timestamp
      if (!Number.isFinite(timestamp)) continue
      events.push({
        timestamp,
        check: String(parsed.check),
        outcome: parsed.outcome ? String(parsed.outcome) : '',
        source: parsed.source ?? 'jsonl',
        severity: parsed.severity ?? inferSeverity(`${parsed.check} ${parsed.outcome ?? ''}`),
      })
    } catch {
      continue
    }
  }
  return events
}

export async function GET() {
  const events: HeartbeatEvent[] = []

  if (await fileExists(HEALTHCHECK_LOG)) {
    try {
      const contents = await fs.readFile(HEALTHCHECK_LOG, 'utf8')
      events.push(...parseHealthcheckLog(contents))
    } catch {
      // ignore read errors
    }
  }

  events.push(...(await parseMemoryHeartbeats()))

  for (const jsonlPath of JSONL_CANDIDATES) {
    if (!(await fileExists(jsonlPath))) continue
    try {
      const contents = await fs.readFile(jsonlPath, 'utf8')
      events.push(...parseJsonl(contents))
    } catch {
      continue
    }
  }

  events.sort((a, b) => b.timestamp - a.timestamp)

  return Response.json({
    events: events.slice(0, 250),
  })
}
