'use client'

import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav'
import { Brain, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface MemoryData {
  content: string
  updatedAt: number
}

function formatTimestamp(ts: number): string {
  if (ts === 0) return 'Never'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Lightweight markdown renderer — handles headers, bold, code blocks, inline code, lists
function MarkdownContent({ content }: { content: string }) {
  if (!content) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Brain className="h-10 w-10 text-zinc-700" aria-hidden="true" />
        <p className="text-sm text-zinc-500">No memory content found</p>
      </div>
    )
  }

  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let inCodeBlock = false
  let codeLines: string[] = []
  let codeLanguage = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Code block fences
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="my-3 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-300">
            {codeLanguage && (
              <span className="mb-2 block text-[10px] uppercase tracking-wider text-zinc-600">{codeLanguage}</span>
            )}
            <code>{codeLines.join('\n')}</code>
          </pre>
        )
        codeLines = []
        codeLanguage = ''
        inCodeBlock = false
      } else {
        inCodeBlock = true
        codeLanguage = line.slice(3).trim()
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={`empty-${i}`} className="h-3" />)
      continue
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="mb-1 mt-5 text-sm font-semibold text-emerald-300/80">{renderInline(line.slice(4))}</h3>
      )
      continue
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="mb-2 mt-6 text-base font-semibold text-zinc-100">{renderInline(line.slice(3))}</h2>
      )
      continue
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="mb-2 mt-6 text-lg font-bold text-zinc-50">{renderInline(line.slice(2))}</h1>
      )
      continue
    }

    // List items
    if (line.match(/^\s*[-*]\s/)) {
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0
      const text = line.replace(/^\s*[-*]\s/, '')
      elements.push(
        <div key={i} className="flex gap-2 text-sm text-zinc-400" style={{ paddingLeft: `${indent * 8}px` }}>
          <span className="shrink-0 text-emerald-500/60" aria-hidden="true">-</span>
          <span>{renderInline(text)}</span>
        </div>
      )
      continue
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      elements.push(<hr key={i} className="my-4 border-zinc-800/60" />)
      continue
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-sm leading-relaxed text-zinc-400">{renderInline(line)}</p>
    )
  }

  return <div className="flex flex-col gap-0.5">{elements}</div>
}

// Inline markdown: bold, inline code, links
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/)
    if (codeMatch) {
      parts.push(
        <code key={key++} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-emerald-300">
          {codeMatch[1]}
        </code>
      )
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/)
    if (boldMatch) {
      parts.push(<strong key={key++} className="font-semibold text-zinc-200">{boldMatch[1]}</strong>)
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    // Link
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      parts.push(
        <a key={key++} href={linkMatch[2]} target="_blank" rel="noreferrer" className="text-emerald-400 underline decoration-emerald-400/30 hover:decoration-emerald-400/60">
          {linkMatch[1]}
        </a>
      )
      remaining = remaining.slice(linkMatch[0].length)
      continue
    }

    // Plain text up to next special char
    const nextSpecial = remaining.search(/[`*\[]/)
    if (nextSpecial === -1) {
      parts.push(remaining)
      break
    }
    if (nextSpecial === 0) {
      // Not a recognized pattern, consume one character
      parts.push(remaining[0])
      remaining = remaining.slice(1)
    } else {
      parts.push(remaining.slice(0, nextSpecial))
      remaining = remaining.slice(nextSpecial)
    }
  }

  return parts.length === 1 ? parts[0] : parts
}

export default function MemoryPage() {
  const [data, setData] = useState<MemoryData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMemory = useCallback(async () => {
    try {
      const res = await fetch('/api/memory', { cache: 'no-store' })
      if (res.ok) {
        const json: MemoryData = await res.json()
        setData(json)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMemory()
  }, [fetchMemory])

  return (
    <main className="h-dvh overflow-y-auto bg-zinc-950 pb-20 text-zinc-100 md:pb-0">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6 sm:py-10">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
            <Brain className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300/70">
              Memory
            </p>
            <h1 className="text-lg font-semibold text-white sm:text-xl">
              Long-Term Context
            </h1>
          </div>
          <button
            onClick={() => {
              setLoading(true)
              fetchMemory()
            }}
            aria-label="Refresh memory"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-ring"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          </button>
        </div>

        {/* Last updated */}
        {data && data.updatedAt > 0 && (
          <p className="text-xs text-zinc-600">
            Last updated {formatTimestamp(data.updatedAt)}
          </p>
        )}

        {/* Content */}
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-4 sm:p-6">
          {loading && !data ? (
            <div className="flex items-center gap-2 py-8 text-sm text-zinc-600">
              <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Loading memory...
            </div>
          ) : (
            <MarkdownContent content={data?.content ?? ''} />
          )}
        </div>
      </div>
      <MobileBottomNav />
    </main>
  )
}
