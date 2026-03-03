import { getAgents } from '@/lib/agents'
import Database from 'better-sqlite3'
import path from 'path'

export const dynamic = 'force-dynamic'

const DB_PATH = path.join(
  process.env.HOME ?? '/Users/naviagent',
  '.openclaw/workspace/data/navi.db'
)

type TicketInfo = { id: string; title: string }

function loadTicketsByPid(): Map<number, TicketInfo> {
  try {
    const db = new Database(DB_PATH, { readonly: true })
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_tasks'")
      .get()

    if (!tableExists) {
      db.close()
      return new Map()
    }

    const rows = db
      .prepare(
        'SELECT ticket_id, title, pid, updated_at FROM agent_tasks WHERE pid IS NOT NULL AND pid != 0 ORDER BY updated_at DESC',
      )
      .all() as Array<{ ticket_id: string; title: string; pid: number }>

    db.close()

    const map = new Map<number, TicketInfo>()
    for (const row of rows) {
      if (!row.pid || map.has(row.pid)) continue
      if (!row.ticket_id || !row.title) continue
      map.set(row.pid, { id: row.ticket_id, title: row.title })
    }

    return map
  } catch (err) {
    console.error('[agents] failed to read agent_tasks:', err)
    return new Map()
  }
}

export async function GET() {
  const agents = getAgents()
  const ticketsByPid = loadTicketsByPid()
  const enriched = agents.map((agent) => {
    if (agent.pid > 0) {
      const ticket = ticketsByPid.get(agent.pid)
      if (ticket) return { ...agent, ticket }
    }
    return agent
  })
  return Response.json(enriched)
}
