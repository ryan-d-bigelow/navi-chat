/* eslint-disable react/no-unescaped-entities */
'use client'

import { SidebarNav } from '@/components/chat/sidebar'
import { Separator } from '@/components/ui/separator'
import { RefreshCw, HeartPulse, CircleAlert, CircleCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface HeartbeatEvent {
  timestamp: number
  check: string
  outcome: string
  source: 'healthcheck' | 'memory' | 'jsonl'
  severity?: 'info' | 'warn' | 'error'
}

const REFRESH_INTERVAL = 60_000

function formatTimestamp(ts: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(ts)
}

function formatFullTimestamp(ts: number) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(ts)
}

function severityIcon(severity?: HeartbeatEvent['severity']) {
  if (severity === 'error') return <CircleAlert className="h-4 w-4 text-rose-400" />
  if (severity === 'warn') return <CircleAlert className="h-4 w-4 text-amber-400" />
  return <CircleCheck className="h-4 w-4 text-emerald-400" />
}

export default function HeartbeatPage() {
  const [events, setEvents] = useState<HeartbeatEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  const fetchEvents = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/heartbeats', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load heartbeats')
      const data = (await res.json()) as { events: HeartbeatEvent[] }
      setEvents(data.events ?? [])
      setLastUpdated(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
    const interval = setInterval(fetchEvents, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchEvents])

  const statusLine = useMemo(() => {
    if (!lastUpdated) return 'Not updated yet'
    return `Last updated ${formatTimestamp(lastUpdated)}`
  }, [lastUpdated])

  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-900">
      {/* Left rail */}
      <aside className="glass hidden w-[260px] shrink-0 flex-col border-r border-zinc-800/60 md:flex">
        <SidebarNav />
        <Separator className="bg-zinc-800/60" />
        <div className="space-y-4 px-4 py-4">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <HeartPulse className="h-4 w-4 text-emerald-400" />
            <span>Heartbeat Timeline</span>
          </div>
          <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3 text-xs text-zinc-400">
            <p className="text-zinc-300">Auto-refresh</p>
            <p className="mt-1">Every 60 seconds</p>
          </div>
          <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3 text-xs text-zinc-400">
            <p className="text-zinc-300">Sources</p>
            <p className="mt-1">Healthcheck log + Memory notes + JSONL</p>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <div className="glass md:hidden">
          <SidebarNav />
        </div>
        <Separator className="bg-zinc-800/60 md:hidden" />

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/60 bg-zinc-950/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
              <HeartPulse className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-zinc-100">Heartbeat Timeline</h1>
              <p className="text-xs text-zinc-500">{statusLine}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            {error && <span className="text-rose-400">{error}</span>}
            <button
              onClick={fetchEvents}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-800/60 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800/60 focus-ring"
              aria-label="Refresh heartbeat timeline"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          {loading ? (
            <div className="text-sm text-zinc-500">Loading heartbeats…</div>
          ) : events.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-800/60 bg-zinc-900/40 p-6 text-center text-sm text-zinc-500">
              No heartbeat entries yet.
            </div>
          ) : (
            <ol className="space-y-4">
              {events.map((event, index) => (
                <li key={`${event.timestamp}-${index}`} className="relative pl-6">
                  <span className="absolute left-1 top-2 h-full w-px bg-zinc-800/60" aria-hidden="true" />
                  <span className="absolute left-0 top-2 flex h-3 w-3 items-center justify-center rounded-full bg-zinc-900 ring-2 ring-zinc-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                  </span>
                  <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/60 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800/60 px-2 py-0.5">
                        {severityIcon(event.severity)}
                        {event.source}
                      </span>
                      <span title={formatFullTimestamp(event.timestamp)}>
                        {formatTimestamp(event.timestamp)}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-zinc-200">
                      <p className="font-medium text-zinc-100">{event.check}</p>
                      {event.outcome && (
                        <p className="mt-1 text-xs text-zinc-400">{event.outcome}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </main>
    </div>
  )
}
