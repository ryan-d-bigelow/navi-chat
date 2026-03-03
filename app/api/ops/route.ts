import { NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import path from 'path'

export const dynamic = 'force-dynamic'

const DB_PATH = path.join(
  process.env.HOME ?? '/Users/naviagent',
  '.openclaw/workspace/data/navi.db'
)

type Row = Record<string, unknown>

function getColumns(db: Database.Database): string[] {
  try {
    const rows = db.prepare('PRAGMA table_info(navi_ops)').all() as Array<{ name: string }>
    return rows.map((r) => r.name)
  } catch {
    return []
  }
}

function pickString(row: Row, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function pickNumber(row: Row, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'number' && !Number.isNaN(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isNaN(parsed)) return parsed
    }
  }
  return null
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

function toMsTimestamp(value: number | null): number | null {
  if (!value) return null
  return value < 1_000_000_000_000 ? value * 1000 : value
}

function buildLogPath(ticketId: string | null): string | null {
  if (!ticketId) return null
  const match = ticketId.match(/NAV-(\d+)/i)
  if (!match) return null
  return `/tmp/nav-${match[1]}-agent.log`
}

export async function GET() {
  try {
    const db = new Database(DB_PATH, { readonly: true })

    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='navi_ops'")
      .get()

    if (!tableExists) {
      db.close()
      return NextResponse.json([])
    }

    const columns = getColumns(db)
    const phaseKey = columns.includes('phase') ? 'phase' : columns.includes('state') ? 'state' : null

    const selectCols = [
      'pid',
      'started_at',
      'project_name',
      'task_type',
      'title',
      'task_id',
      'ticket_id',
      'linear_key',
      'issue_id',
      'linear_issue_id',
      phaseKey,
    ].filter((col): col is string => Boolean(col && columns.includes(col)))

    const where = phaseKey ? `WHERE ${phaseKey} = 'running'` : ''
    const sql = `SELECT ${selectCols.length > 0 ? selectCols.join(', ') : '*'} FROM navi_ops ${where} ORDER BY started_at DESC LIMIT 50`
    const rows = db.prepare(sql).all() as Row[]
    db.close()

    const running = rows
      .map((row) => {
        const pid = pickNumber(row, 'pid')
        if (!pid || !isPidAlive(pid)) return null

        const ticketId = pickString(row, 'ticket_id', 'linear_key', 'task_id')
        const issueId = pickString(row, 'issue_id', 'linear_issue_id')
        const phase = (phaseKey ? pickString(row, phaseKey) : null) ?? 'running'
        const startedAt = toMsTimestamp(pickNumber(row, 'started_at'))
        const projectName = pickString(row, 'project_name')
        const taskType = pickString(row, 'task_type') ?? 'agent'
        const title = pickString(row, 'title')

        return {
          ticketId,
          issueId,
          pid,
          phase,
          startedAt,
          projectName,
          taskType,
          title,
          logPath: buildLogPath(ticketId),
        }
      })
      .filter(Boolean)

    return NextResponse.json(running)
  } catch (err) {
    console.error('[ops] failed to read navi_ops:', err)
    return NextResponse.json([])
  }
}
