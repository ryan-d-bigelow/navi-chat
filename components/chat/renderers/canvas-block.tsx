'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const MAX_CANVAS_HEIGHT = 600
const DEFAULT_CANVAS_HEIGHT = 240

const BASE_STYLES = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: auto; }
body {
  background: #18181b;
  color: #f4f4f5;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.6;
}
#navi-canvas-root { padding: 16px; }
a { color: #60a5fa; }
img, video, canvas { max-width: 100%; height: auto; }
pre { background: #0f172a; padding: 12px; border-radius: 10px; overflow-x: auto; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 13px; }
hr { border: 0; border-top: 1px solid #3f3f46; margin: 12px 0; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #3f3f46; padding: 8px; text-align: left; }
th { background: #27272a; }
`

function buildSrcDoc(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div id="navi-canvas-root">${content}</div>
  <script>
    (function() {
      function postSize() {
        var height = Math.max(
          document.body ? document.body.scrollHeight : 0,
          document.documentElement ? document.documentElement.scrollHeight : 0
        );
        parent.postMessage({ type: 'navi-canvas-resize', height: height }, '*');
      }
      window.addEventListener('load', postSize);
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(postSize);
        if (document.body) ro.observe(document.body);
        if (document.documentElement) ro.observe(document.documentElement);
      }
      setTimeout(postSize, 50);
    })();
  </script>
</body>
</html>`
}

interface CanvasBlockProps {
  content: string
}

export function CanvasBlock({ content }: CanvasBlockProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  const [hasError, setHasError] = useState(false)

  const trimmedContent = content.trim()
  const srcDoc = useMemo(() => buildSrcDoc(content), [content])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow
      if (!iframeWindow || event.source !== iframeWindow) return
      const data = event.data as { type?: string; height?: number } | null
      if (!data || data.type !== 'navi-canvas-resize') return
      if (typeof data.height === 'number' && Number.isFinite(data.height)) {
        setHeight(data.height)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleLoad = () => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const measuredHeight = Math.max(
      doc.body?.scrollHeight ?? 0,
      doc.documentElement?.scrollHeight ?? 0,
    )
    if (measuredHeight > 0) {
      setHeight(measuredHeight)
    }
  }

  if (trimmedContent.length === 0 || hasError) {
    return (
      <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-xs text-zinc-500 last:mb-0">
        Canvas failed to render
      </div>
    )
  }

  const iframeHeight = height ?? DEFAULT_CANVAS_HEIGHT
  const needsScroll = height !== null && height > MAX_CANVAS_HEIGHT

  return (
    <div className="mb-3 last:mb-0">
      <div
        className={`relative rounded-xl border border-zinc-800 bg-zinc-900/60 ${
          needsScroll ? 'overflow-auto' : 'overflow-hidden'
        }`}
        style={{ maxHeight: `${MAX_CANVAS_HEIGHT}px` }}
      >
        <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-zinc-700 bg-zinc-900/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-300">
          canvas
        </span>
        <iframe
          ref={iframeRef}
          title="Canvas content"
          className="block w-full border-0"
          style={{ height: `${iframeHeight}px` }}
          srcDoc={srcDoc}
          onLoad={handleLoad}
          onError={() => setHasError(true)}
          sandbox="allow-scripts allow-same-origin"
          scrolling="no"
        />
      </div>
    </div>
  )
}
