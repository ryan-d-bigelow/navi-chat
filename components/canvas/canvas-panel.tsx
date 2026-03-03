'use client'

import { ScrollArea } from '@/components/ui/scroll-area'
import type { CanvasState } from '@/lib/canvas'
import { PanelRightClose, ExternalLink } from 'lucide-react'
import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface CanvasPanelProps {
  canvas: CanvasState
  onClose: () => void
  isStreaming?: boolean
}

function IframeRenderer({ url }: { url: string }) {
  return (
    <iframe
      src={url}
      title="Canvas content"
      className="h-full w-full border-0"
      sandbox="allow-scripts allow-same-origin allow-popups"
      referrerPolicy="no-referrer"
    />
  )
}

function MarkdownRenderer({ content: markdownContent }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none px-4 py-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline hover:text-blue-300"
            >
              {children}
            </a>
          ),
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className ?? '')
            if (match) {
              return (
                <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-3">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              )
            }
            return (
              <code
                className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200"
                {...props}
              >
                {children}
              </code>
            )
          },
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-zinc-700 text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-left text-xs font-medium text-zinc-300">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-zinc-700 px-3 py-2 text-xs text-zinc-300">
              {children}
            </td>
          ),
        }}
      >
        {markdownContent}
      </ReactMarkdown>
    </div>
  )
}

function HtmlRenderer({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return
    doc.open()
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <style>
          *, *::before, *::after { box-sizing: border-box; }
          body { margin: 0; padding: 16px; font-family: system-ui, sans-serif;
                 background: #09090b; color: #e4e4e7; font-size: 14px; line-height: 1.6;
                 max-width: 100%; overflow-wrap: break-word; }
          a { color: #60a5fa; }
          img, video, canvas, svg, iframe { max-width: 100%; height: auto; }
          table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; }
          th, td { border: 1px solid #3f3f46; padding: 8px; text-align: left; }
          th { background: #18181b; }
          pre { background: #18181b; padding: 12px; border-radius: 8px; overflow-x: auto; }
          code { font-family: ui-monospace, monospace; font-size: 13px; }
          @media (max-width: 640px) { body { padding: 12px; } }
        </style>
      </head>
      <body>${html}</body>
      </html>
    `)
    doc.close()
  }, [html])

  return (
    <iframe
      ref={iframeRef}
      title="Canvas HTML content"
      className="h-full w-full border-0"
      sandbox="allow-scripts"
    />
  )
}

function isHtml(content: string): boolean {
  const trimmed = content.trimStart()
  return (
    trimmed.startsWith('<!') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<div') ||
    trimmed.startsWith('<table') ||
    trimmed.startsWith('<section') ||
    trimmed.startsWith('<body')
  )
}

export function CanvasPanel({ canvas, onClose, isStreaming }: CanvasPanelProps) {
  const hasContent = canvas.url !== null || canvas.content !== null

  return (
    <div className="flex h-full w-full min-w-0 flex-col border-l border-zinc-800 bg-zinc-950 md:w-[420px] md:shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-emerald-600">
            <span className="text-[8px] font-bold leading-none text-white">C</span>
          </div>
          <span className="text-sm font-semibold text-zinc-200">{canvas.title}</span>
          {isStreaming && (
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"
              aria-label="Updating"
            />
          )}
        </div>
        <div className="flex items-center gap-1">
          {canvas.url && (
            <a
              href={canvas.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            title="Close canvas"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      {!hasContent && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800/50">
            <span className="text-2xl">🎨</span>
          </div>
          <p className="text-sm text-zinc-500">Canvas is empty</p>
          <p className="mt-1 text-xs text-zinc-600">
            Navi will push content here during responses
          </p>
        </div>
      )}

      {canvas.url && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <IframeRenderer url={canvas.url} />
        </div>
      )}

      {!canvas.url && canvas.content && (
        isHtml(canvas.content) ? (
          <div className="flex-1 min-h-0 overflow-hidden">
            <HtmlRenderer html={canvas.content} />
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <MarkdownRenderer content={canvas.content} />
          </ScrollArea>
        )
      )}
    </div>
  )
}
