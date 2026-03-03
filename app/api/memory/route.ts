import { readFile, stat } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { NextResponse } from 'next/server'

const MEMORY_PATH = join(homedir(), '.openclaw', 'workspace', 'MEMORY.md')

export async function GET() {
  try {
    const [content, info] = await Promise.all([
      readFile(MEMORY_PATH, 'utf-8'),
      stat(MEMORY_PATH),
    ])
    return NextResponse.json({
      content,
      updatedAt: info.mtimeMs,
    })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return NextResponse.json({ content: '', updatedAt: 0 })
    }
    return NextResponse.json(
      { error: 'Failed to read memory file' },
      { status: 500 }
    )
  }
}
