import { NextResponse, type NextRequest } from 'next/server'
import { promises as fs } from 'fs'

export const dynamic = 'force-dynamic'

function isSafeTicketNum(value: string): boolean {
  return /^\d+$/.test(value)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticketNum: string }> }
) {
  const { ticketNum } = await params

  if (!isSafeTicketNum(ticketNum)) {
    return new NextResponse('Invalid ticket number.', { status: 400 })
  }

  const logPath = `/tmp/nav-${ticketNum}-agent.log`

  try {
    const content = await fs.readFile(logPath, 'utf8')
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException
    if (nodeErr?.code === 'ENOENT') {
      return new NextResponse('Log file not found.', { status: 404 })
    }
    console.error('[agent-logs] failed to read log', err)
    return new NextResponse('Failed to read log.', { status: 500 })
  }
}
