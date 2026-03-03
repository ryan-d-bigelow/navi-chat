import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import path from 'path'

export type AgentType =
  | 'coder'
  | 'researcher'
  | 'home'
  | 'wevo'
  | 'browser'
  | 'cron'
  | 'navi'
  | 'slack'
  | 'webchat'
  | 'process'

export interface AgentInfo {
  id: string
  name: string
  agentType: AgentType
  status: 'running' | 'idle' | 'done'
  model: string
  task: string
  ticket?: { id: string; title: string }
  sessionKey?: string
  startedAt: number
  pid: number
  source: 'session' | 'process'
}

interface SessionEntry {
  sessionId: string
  updatedAt: number
  systemSent?: boolean
  skillsSnapshot?: { prompt?: string }
  lastMessage?: string
}

type SessionsJson = Record<string, SessionEntry>

const SESSIONS_PATH = path.join(
  homedir(),
  '.openclaw/agents/main/sessions/sessions.json',
)

/** Derive agent type + display name from session key */
function classifySession(key: string): { agentType: AgentType; name: string } {
  // key examples:
  //   agent:main:main
  //   agent:coder:main
  //   agent:main:cron:uuid
  //   agent:main:openai:uuid
  //   agent:main:slack:channel:general
  //   agent:main:main:thread:uuid

  const parts = key.split(':')
  const agentRole = parts[1] ?? 'main'

  if (agentRole === 'coder') return { agentType: 'coder', name: 'Coder' }
  if (agentRole === 'researcher') return { agentType: 'researcher', name: 'Researcher' }
  if (agentRole === 'home') return { agentType: 'home', name: 'Home' }
  if (agentRole === 'wevo') return { agentType: 'wevo', name: 'Wevo' }
  if (agentRole === 'browser') return { agentType: 'browser', name: 'Scout' }

  if (agentRole === 'main') {
    // Sub-classify by channel/context
    if (parts[2] === 'cron') return { agentType: 'cron', name: 'Cron Job' }
    if (parts[2] === 'slack') return { agentType: 'slack', name: 'Slack' }
    if (parts[2] === 'openai') return { agentType: 'webchat', name: 'Navi Chat' }
    if (parts[2] === 'main' && parts[3] === 'thread') return { agentType: 'slack', name: 'Slack Thread' }
    return { agentType: 'navi', name: 'Navi' }
  }

  return { agentType: 'process', name: agentRole.charAt(0).toUpperCase() + agentRole.slice(1) }
}

/** Best-effort task description from session data */
function extractTask(key: string, session: SessionEntry): string {
  const prompt = session.skillsSnapshot?.prompt
  if (prompt) {
    // First line, trimmed
    const firstLine = prompt.split('\n')[0].trim()
    if (firstLine.length > 0) return firstLine.slice(0, 120)
  }
  if (session.lastMessage) {
    return session.lastMessage.slice(0, 120)
  }

  // Fall back to session key context
  const parts = key.split(':')
  if (parts[2] === 'cron') return `Cron session ${session.sessionId.slice(0, 8)}`
  if (parts[2] === 'slack') return `Slack ${parts.slice(3).join(':') || 'channel'}`
  if (parts[2] === 'openai') return `Web chat session`
  return `Session ${session.sessionId.slice(0, 8)}`
}

function parseProcesses(): AgentInfo[] {
  try {
    const output = execSync(
      "ps aux | grep -E '(claude|codex|opencode)' | grep -v grep | grep -v '/bin/sh'",
      { encoding: 'utf-8', timeout: 5000 },
    )

    const agents: AgentInfo[] = []
    for (const line of output.trim().split('\n')) {
      if (!line) continue
      const parts = line.split(/\s+/)
      const pid = parseInt(parts[1], 10)
      if (isNaN(pid)) continue

      const cmd = parts.slice(10).join(' ')
      if (cmd.includes('grep')) continue

      let name = 'Claude Code'
      let agentType: AgentType = 'coder'
      if (cmd.includes('codex')) { name = 'Codex'; agentType = 'coder' }
      else if (cmd.includes('opencode')) { name = 'OpenCode'; agentType = 'coder' }

      // Try to extract task from command args
      let task = cmd.slice(0, 140)

      // Strip known flags to get to the actual task/prompt
      const taskMatch = cmd.match(/(?:--message|-m)\s+"?([^"]+)"?/)
      if (taskMatch) task = taskMatch[1].slice(0, 120)

      agents.push({
        id: `proc-${pid}`,
        name,
        agentType,
        status: 'running',
        model: '',
        task,
        startedAt: Date.now(),
        pid,
        source: 'process',
      })
    }
    return agents
  } catch {
    return []
  }
}

function parseOpenClawSessions(): AgentInfo[] {
  if (!existsSync(SESSIONS_PATH)) return []

  try {
    const raw = readFileSync(SESSIONS_PATH, 'utf-8')
    const sessions: SessionsJson = JSON.parse(raw)
    const agents: AgentInfo[] = []
    const now = Date.now()
    const THIRTY_MIN_MS = 30 * 60 * 1000

    for (const [key, session] of Object.entries(sessions)) {
      const age = now - (session.updatedAt ?? 0)
      const { agentType, name } = classifySession(key)
      const task = extractTask(key, session)

      // Determine status: recently updated = running/idle, old = done
      let status: AgentInfo['status'] = 'idle'
      if (age < THIRTY_MIN_MS) {
        status = session.systemSent ? 'running' : 'idle'
      } else {
        status = 'done'
      }

      agents.push({
        id: session.sessionId,
        name,
        agentType,
        status,
        model: 'claude-sonnet-4-6',
        task,
        sessionKey: key,
        startedAt: session.updatedAt ?? now,
        pid: 0,
        source: 'session',
      })
    }

    // Sort: running first, then idle, then done; within each group by updatedAt desc
    const statusOrder = { running: 0, idle: 1, done: 2 }
    agents.sort((a, b) => {
      const statusDiff = statusOrder[a.status] - statusOrder[b.status]
      if (statusDiff !== 0) return statusDiff
      return b.startedAt - a.startedAt
    })

    return agents
  } catch {
    return []
  }
}

export function getAgents(): AgentInfo[] {
  const processAgents = parseProcesses()
  const sessionAgents = parseOpenClawSessions()

  // Deduplicate: process agents take priority (they have live PIDs)
  const sessionIds = new Set(sessionAgents.map((a) => a.id))
  const uniqueProcessAgents = processAgents.filter((a) => !sessionIds.has(a.id))

  // Process agents first (always running), then sessions sorted by status
  return [...uniqueProcessAgents, ...sessionAgents]
}
