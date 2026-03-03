'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Activity, Bot } from 'lucide-react'

/* ── Types ────────────────────────────────────────────────────────────── */

interface ServiceCheck {
  name: string
  status: 'ok' | 'warn' | 'error'
  detail?: string
}

interface SystemStatusData {
  services: ServiceCheck[]
  activeAgents: number
  lastHeartbeat?: string
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const STATUS_COLOR: Record<ServiceCheck['status'], string> = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  error: 'bg-red-400',
}

/* ── Component ────────────────────────────────────────────────────────── */

export function SystemStatusPanel() {
  const [data, setData] = useState<SystemStatusData | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/system-status')
      if (!res.ok) throw new Error('fetch failed')
      const json: SystemStatusData = await res.json()
      setData(json)
      setFetchError(false)
    } catch {
      setFetchError(true)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30_000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // Overall status: worst of all services
  const overallStatus: ServiceCheck['status'] = data
    ? data.services.some((s) => s.status === 'error')
      ? 'error'
      : data.services.some((s) => s.status === 'warn')
        ? 'warn'
        : 'ok'
    : fetchError
      ? 'error'
      : 'ok'

  return (
    <div className="border-t border-zinc-800/60">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label="Toggle system status"
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-zinc-400 transition-colors hover:bg-zinc-800/40 hover:text-zinc-300"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
        )}
        <Activity className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="font-medium">System</span>
        <span
          className={`ml-auto h-2 w-2 shrink-0 rounded-full ${STATUS_COLOR[overallStatus]}`}
          aria-label={`Overall status: ${overallStatus}`}
        />
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="space-y-1.5 px-3 pb-2.5">
          {/* Service list */}
          {data ? (
            <ul className="space-y-0.5" aria-label="Service status">
              {data.services.map((svc) => (
                <li
                  key={svc.name}
                  className="flex items-center gap-2 rounded px-1.5 py-0.5 text-[11px]"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_COLOR[svc.status]}`}
                    aria-label={svc.status}
                  />
                  <span className="truncate text-zinc-400">{svc.name}</span>
                  {svc.detail && (
                    <span className="ml-auto shrink-0 text-zinc-600">
                      {svc.detail}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : fetchError ? (
            <p className="px-1.5 text-[11px] text-red-400/80">
              Failed to fetch status
            </p>
          ) : (
            <p className="px-1.5 text-[11px] text-zinc-600">Loading...</p>
          )}

          {/* Footer: agents + heartbeat */}
          {data && (
            <div className="flex items-center gap-3 border-t border-zinc-800/40 pt-1.5 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1">
                <Bot className="h-3 w-3" aria-hidden="true" />
                {data.activeAgents} agent{data.activeAgents !== 1 ? 's' : ''}
              </span>
              {data.lastHeartbeat && (
                <span className="ml-auto truncate" title={data.lastHeartbeat}>
                  heartbeat {relativeTime(data.lastHeartbeat)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
