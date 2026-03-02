import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import path from 'path'

export interface AgentInfo {
  id: string
  name: string
  status: 'running' | 'idle' | 'done'
  model: string
  task: string
  startedAt: number
  pid: number
}

interface SessionEntry {
  sessionId: string
  updatedAt: number
  systemSent?: boolean
  skillsSnapshot?: { prompt?: string }
}

type SessionsJson = Record<string, SessionEntry>

const SESSIONS_PATH = path.join(
  homedir(),
  '.openclaw/agents/main/sessions/sessions.json',
)

function parseProcesses(): AgentInfo[] {
  try {
    const output = execSync(
      "ps aux | grep -E 'claude|codex|opencode|openclaw' | grep -v grep",
      { encoding: 'utf-8', timeout: 5000 },
    )

    const agents: AgentInfo[] = []
    for (const line of output.trim().split('\n')) {
      if (!line) continue
      const parts = line.split(/\s+/)
      const pid = parseInt(parts[1], 10)
      if (isNaN(pid)) continue

      const cmd = parts.slice(10).join(' ')
      let name = 'unknown'
      if (cmd.includes('claude')) name = 'Claude Code'
      else if (cmd.includes('codex')) name = 'Codex'
      else if (cmd.includes('opencode')) name = 'OpenCode'
      else if (cmd.includes('openclaw')) name = 'OpenClaw'

      // Skip helper processes (node internals, grep artifacts)
      if (cmd.includes('grep') || cmd.includes('/bin/sh -c')) continue

      agents.push({
        id: `proc-${pid}`,
        name,
        status: 'running',
        model: '',
        task: cmd.slice(0, 120),
        startedAt: Date.now(),
        pid,
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

    for (const [key, session] of Object.entries(sessions)) {
      // key format: "agent:main:main" or "agent:coder:main"
      const keyParts = key.split(':')
      const agentName = keyParts[1] ?? 'main'

      agents.push({
        id: session.sessionId,
        name: agentName.charAt(0).toUpperCase() + agentName.slice(1),
        status: session.systemSent ? 'running' : 'idle',
        model: 'claude-sonnet-4-6',
        task: `Session ${session.sessionId.slice(0, 8)}`,
        startedAt: session.updatedAt,
        pid: 0,
      })
    }
    return agents
  } catch {
    return []
  }
}

export function getAgents(): AgentInfo[] {
  const processAgents = parseProcesses()
  const sessionAgents = parseOpenClawSessions()

  // Deduplicate: session agents first, then process-only agents
  const sessionIds = new Set(sessionAgents.map((a) => a.id))
  const uniqueProcessAgents = processAgents.filter(
    (a) => !sessionIds.has(a.id),
  )

  return [...sessionAgents, ...uniqueProcessAgents]
}
