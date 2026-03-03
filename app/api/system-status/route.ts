import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import { readFile, stat, readdir } from 'fs/promises'
import { homedir } from 'os'
import path from 'path'

const exec = promisify(execCb)

export const dynamic = 'force-dynamic'

type ServiceStatus = 'ok' | 'warn' | 'error'

interface ServiceCheck {
  name: string
  status: ServiceStatus
  detail?: string
}

interface SystemStatusResponse {
  services: ServiceCheck[]
  activeAgents: number
  lastHeartbeat?: string
}

async function checkLaunchdService(label: string, displayName: string): Promise<ServiceCheck> {
  try {
    const { stdout } = await exec(`launchctl list | grep '${label}'`)
    const parts = stdout.trim().split(/\s+/)
    const pid = parts[0]
    const lastExitStatus = parts[1]

    if (pid && pid !== '-') {
      return { name: displayName, status: 'ok', detail: `PID ${pid}` }
    }
    if (lastExitStatus === '0') {
      return { name: displayName, status: 'warn', detail: 'not running (exit 0)' }
    }
    return { name: displayName, status: 'warn', detail: `exit ${lastExitStatus}` }
  } catch {
    return { name: displayName, status: 'warn', detail: 'not found' }
  }
}

async function checkGateway(): Promise<ServiceCheck> {
  try {
    // First try checking the gateway log modification time
    const logPath = '/tmp/gateway.log'
    const logStat = await stat(logPath)
    const ageMs = Date.now() - logStat.mtimeMs
    const ageMin = Math.floor(ageMs / 60_000)

    if (ageMin < 5) {
      return { name: 'Gateway', status: 'ok', detail: `active ${ageMin}m ago` }
    }

    // If log is stale, check for the process
    const { stdout } = await exec('pgrep -fl openclaw-gateway')
    if (stdout.trim()) {
      return { name: 'Gateway', status: 'ok', detail: 'process running' }
    }
    return { name: 'Gateway', status: 'warn', detail: `log stale (${ageMin}m)` }
  } catch {
    // Try process check as fallback
    try {
      const { stdout } = await exec('pgrep -fl openclaw-gateway')
      if (stdout.trim()) {
        return { name: 'Gateway', status: 'ok', detail: 'process running' }
      }
    } catch {
      // pgrep returns non-zero when no match
    }
    return { name: 'Gateway', status: 'warn', detail: 'not detected' }
  }
}

async function getLastHeartbeat(): Promise<string | undefined> {
  try {
    const heartbeatPath = path.join(
      homedir(),
      '.openclaw/workspace/memory/heartbeat-state.json'
    )
    const data = await readFile(heartbeatPath, 'utf-8')
    const parsed: Record<string, unknown> = JSON.parse(data)
    // Look for a timestamp field — common field names
    const ts = parsed.lastHeartbeat ?? parsed.timestamp ?? parsed.last_heartbeat ?? parsed.updatedAt
    if (typeof ts === 'string') return ts
    if (typeof ts === 'number') return new Date(ts).toISOString()
    // If no known field, return the file mod time
    const fileStat = await stat(heartbeatPath)
    return new Date(fileStat.mtimeMs).toISOString()
  } catch {
    return undefined
  }
}

async function countActiveAgents(): Promise<number> {
  try {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
    const entries = await readdir('/tmp')
    const agentLogs = entries.filter(
      (f) => f.startsWith('nav-') && f.endsWith('-agent.log')
    )
    let count = 0
    for (const name of agentLogs) {
      try {
        const fileStat = await stat(path.join('/tmp', name))
        if (fileStat.mtimeMs > twoHoursAgo) count++
      } catch {
        // skip unreadable files
      }
    }
    return count
  } catch {
    return 0
  }
}

export async function GET() {
  const [gateway, protonBridge, agentWatchdog, dbMaintenance, lastHeartbeat, activeAgents] =
    await Promise.all([
      checkGateway(),
      checkLaunchdService('ai.navi.proton-bridge', 'Proton Bridge'),
      checkLaunchdService('ai.navi.agent-watchdog', 'Agent Watchdog'),
      checkLaunchdService('ai.navi.db-maintenance', 'DB Maintenance'),
      getLastHeartbeat(),
      countActiveAgents(),
    ])

  const naviChat: ServiceCheck = { name: 'navi-chat', status: 'ok', detail: 'serving' }

  const response: SystemStatusResponse = {
    services: [naviChat, gateway, protonBridge, agentWatchdog, dbMaintenance],
    activeAgents,
    lastHeartbeat,
  }

  return Response.json(response)
}
