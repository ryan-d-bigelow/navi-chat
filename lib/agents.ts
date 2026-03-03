import { execSync } from 'child_process'
import Database from 'better-sqlite3'
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
  updatedAt?: number
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
  lastChannel?: string
  displayName?: string
  origin?: { provider?: string; chatType?: string }
  deliveryContext?: { channel?: string }
  model?: string
  fallbackNoticeActiveModel?: string
  fallbackNoticeSelectedModel?: string
}

type SessionsJson = Record<string, SessionEntry>

const SESSIONS_PATH = path.join(
  homedir(),
  '.openclaw/agents/main/sessions/sessions.json',
)

const NAVI_DB_PATH = path.join(
  homedir(),
  '.openclaw/workspace/data/navi.db',
)
const NAVI_CHAT_DB_PATH = path.join(process.cwd(), 'navi-chat.db')

/** Derive agent type + display name from session key */
function classifySession(
  key: string,
  session?: SessionEntry,
): { agentType: AgentType; name: string } {
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
    if (parts[2] === 'slack') return { agentType: 'slack', name: 'Slack Channel' }
    if (parts[2] === 'openai') return { agentType: 'webchat', name: 'Navi Chat' }
    if (parts[2] === 'openai-user') return { agentType: 'webchat', name: 'Navi Chat' }
    if (parts[2] === 'main' && parts[3] === 'thread') {
      const channelId = extractSlackThreadChannelId(session)
      const name = channelId?.startsWith('D') ? 'Slack DM' : 'Slack Thread'
      return { agentType: 'slack', name }
    }
    const provider = session?.origin?.provider ?? session?.deliveryContext?.channel ?? session?.lastChannel
    if (provider === 'slack') return { agentType: 'slack', name: 'Slack Channel' }
    if (provider === 'openai') return { agentType: 'webchat', name: 'Navi Chat' }
    // Primary Navi agent session
    if (parts[2] === 'main') return { agentType: 'navi', name: 'Navi' }
    if (parts[2] === 'openai-user') return { agentType: 'navi', name: 'Navi' }
    // Unknown sub-context — label with the context segment so duplicates are distinguishable
    const ctx = parts[2]
    if (ctx) {
      const label = ctx.charAt(0).toUpperCase() + ctx.slice(1)
      return { agentType: 'navi', name: `Navi (${label})` }
    }
    return { agentType: 'navi', name: 'Navi' }
  }

  return { agentType: 'process', name: agentRole.charAt(0).toUpperCase() + agentRole.slice(1) }
}

function extractSlackThreadChannelId(session?: SessionEntry): string | null {
  const label = session?.displayName
  if (!label) return null
  const hashIndex = label.indexOf('#')
  if (hashIndex === -1) return null
  const colonIndex = label.indexOf(':', hashIndex)
  const endIndex = colonIndex === -1 ? label.length : colonIndex
  const channelId = label.slice(hashIndex + 1, endIndex).trim()
  return channelId || null
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
      const lowerCmd = cmd.toLowerCase()
      const isVendorBinary =
        lowerCmd.includes('codex-darwin-arm64') ||
        lowerCmd.includes('aarch64-apple-darwin') ||
        lowerCmd.includes('node_modules/@openai/codex/node_modules') ||
        /\/vendor(\/|$)/.test(lowerCmd)
      if (isVendorBinary) continue

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
        updatedAt: Date.now(),
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

function isPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function loadRunningNaviOpsPids(): Set<number> {
  const pids = new Set<number>()
  const dbPaths = [NAVI_DB_PATH, NAVI_CHAT_DB_PATH]

  for (const dbPath of dbPaths) {
    try {
      if (!existsSync(dbPath)) continue
      const db = new Database(dbPath, { readonly: true })

      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='navi_ops'")
        .get()
      if (!tableExists) {
        db.close()
        continue
      }

      const columns = db.prepare('PRAGMA table_info(navi_ops)').all() as Array<{ name: string }>
      const names = new Set(columns.map((c) => c.name))
      const phaseKey = names.has('phase') ? 'phase' : names.has('state') ? 'state' : null
      const where = phaseKey ? `WHERE ${phaseKey} = 'running'` : ''
      const rows = db.prepare(`SELECT pid FROM navi_ops ${where}`).all() as Array<{ pid: number }>
      db.close()

      for (const row of rows) {
        const pid = Number(row.pid)
        if (!Number.isNaN(pid) && isPidAlive(pid)) pids.add(pid)
      }
    } catch {
      // ignore DB-level failures
    }
  }

  return pids
}

function parseOpenClawSessions(): AgentInfo[] {
  if (!existsSync(SESSIONS_PATH)) return []

  try {
    const raw = readFileSync(SESSIONS_PATH, 'utf-8')
    const sessions: SessionsJson = JSON.parse(raw)
    const uniqueSessions = new Map<string, { key: string; session: SessionEntry }>()
    const agents: AgentInfo[] = []
    const now = Date.now()
    const envWindowMs = Number.parseInt(process.env.NAVI_SESSION_WINDOW_MS ?? '', 10)
    const envWindowMin = Number.parseInt(process.env.NAVI_SESSION_WINDOW_MINUTES ?? '', 10)
    const sessionWindowMs =
      (Number.isFinite(envWindowMs) && envWindowMs > 0
        ? envWindowMs
        : Number.isFinite(envWindowMin) && envWindowMin > 0
          ? envWindowMin * 60 * 1000
          : 30 * 60 * 1000)
    const runningNaviOpsPids = loadRunningNaviOpsPids()
    const hasActiveNaviOps = runningNaviOpsPids.size > 0

    for (const [key, session] of Object.entries(sessions)) {
      const existing = uniqueSessions.get(session.sessionId)
      if (existing) {
        const existingUpdated = existing.session.updatedAt ?? 0
        const nextUpdated = session.updatedAt ?? 0
        if (
          nextUpdated > existingUpdated ||
          (nextUpdated === existingUpdated && key.length > existing.key.length)
        ) {
          uniqueSessions.set(session.sessionId, { key, session })
        }
      } else {
        uniqueSessions.set(session.sessionId, { key, session })
      }
    }

    for (const { key, session } of uniqueSessions.values()) {
      const updatedAt = session.updatedAt ?? 0
      const age = now - updatedAt

      if (age > sessionWindowMs) continue

      const { agentType, name } = classifySession(key, session)
      const task = extractTask(key, session)

      const isConversation = agentType === 'slack' || agentType === 'webchat'
      const isSystem = agentType === 'cron'
      const isAgentSession = !isConversation && !isSystem
      const isMainNaviSession = key === 'agent:main:main'

      if (isAgentSession && !hasActiveNaviOps && !isMainNaviSession) continue
      if (isSystem && !hasActiveNaviOps) continue

      const status: AgentInfo['status'] = session.systemSent ? 'running' : 'idle'

      const model =
        session.model ??
        session.fallbackNoticeActiveModel ??
        session.fallbackNoticeSelectedModel ??
        ''

      agents.push({
        id: key,
        name,
        agentType,
        status,
        model,
        task,
        sessionKey: key,
        updatedAt,
        startedAt: updatedAt || now,
        pid: 0,
        source: 'session',
      })
    }

    // Sort: running first, then idle; within each group by updatedAt desc
    const statusOrder: Record<string, number> = { running: 0, idle: 1 }
    agents.sort((a, b) => {
      const statusDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
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

  // Deduplicate navi-typed session agents: multiple sessions can resolve to
  // agentType 'navi' (e.g. agent:main:main and agent:main:<unknown>). These
  // represent the same logical Navi agent, so keep only the most recently
  // updated one per name.
  const naviByName = new Map<string, AgentInfo>()
  const deduped: AgentInfo[] = []
  for (const agent of sessionAgents) {
    if (agent.agentType === 'navi') {
      const existing = naviByName.get(agent.name)
      if (!existing || (agent.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
        naviByName.set(agent.name, agent)
      }
    } else {
      deduped.push(agent)
    }
  }
  deduped.push(...naviByName.values())
  // Re-sort after dedup: running first, then idle; within each group by updatedAt desc
  const statusOrder: Record<string, number> = { running: 0, idle: 1 }
  deduped.sort((a, b) => {
    const statusDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
    if (statusDiff !== 0) return statusDiff
    return b.startedAt - a.startedAt
  })

  // Deduplicate: process agents take priority (they have live PIDs)
  const sessionIds = new Set(deduped.map((a) => a.id))
  const uniqueProcessAgents = processAgents.filter((a) => !sessionIds.has(a.id))

  // Process agents first (always running), then sessions sorted by status
  return [...uniqueProcessAgents, ...deduped]
}
