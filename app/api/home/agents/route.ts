import { NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(
  process.env.HOME ?? '/Users/naviagent',
  '.openclaw/workspace/data/navi.db'
)

type AgentTaskRow = Record<string, unknown>

function getColumns(db: Database.Database): string[] {
  try {
    const rows = db.prepare('PRAGMA table_info(agent_tasks)').all() as Array<{ name: string }>
    return rows.map((r) => r.name)
  } catch {
    return []
  }
}

function normalizeStatus(row: AgentTaskRow, statusKey: string | null): string {
  if (!statusKey) return 'unknown'
  const raw = row[statusKey]
  if (typeof raw === 'string') return raw.toLowerCase()
  if (typeof raw === 'number') return raw === 1 ? 'running' : 'unknown'
  return 'unknown'
}

function isRunningStatus(status: string): boolean {
  return ['running', 'active', 'in_progress', 'started', 'processing'].includes(status)
}

export async function GET() {
  try {
    const db = new Database(DB_PATH, { readonly: true })

    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_tasks'")
      .get()

    if (!tableExists) {
      db.close()
      return NextResponse.json({ running: 0, total: 0, tasks: [] })
    }

    const columns = getColumns(db)
    const statusKey = columns.includes('status')
      ? 'status'
      : columns.includes('state')
        ? 'state'
        : null

    const selectCols = [
      'id',
      'task_id',
      'title',
      'name',
      'agent_name',
      'status',
      'state',
      'started_at',
      'updated_at',
      'pid',
    ].filter((col) => columns.includes(col))

    const sql = `SELECT ${selectCols.length > 0 ? selectCols.join(', ') : '*'} FROM agent_tasks ORDER BY updated_at DESC LIMIT 50`
    const rows = db.prepare(sql).all() as AgentTaskRow[]
    db.close()

    const tasks = rows.map((row) => {
      const status = normalizeStatus(row, statusKey)
      const title =
        (typeof row.title === 'string' && row.title) ||
        (typeof row.name === 'string' && row.name) ||
        (typeof row.agent_name === 'string' && row.agent_name) ||
        (typeof row.task_id === 'string' && row.task_id) ||
        'Untitled task'

      return {
        id: (row.id ?? row.task_id ?? title) as string,
        title,
        status,
        updatedAt: row.updated_at ?? null,
        startedAt: row.started_at ?? null,
        pid: row.pid ?? null,
      }
    })

    const runningTasks = tasks.filter((t) => isRunningStatus(t.status))

    return NextResponse.json({
      running: runningTasks.length,
      total: tasks.length,
      tasks,
    })
  } catch (err) {
    console.error('[home agents] failed to read agent_tasks:', err)
    return NextResponse.json({ running: 0, total: 0, tasks: [], error: 'Failed to read agent_tasks' }, { status: 500 })
  }
}
