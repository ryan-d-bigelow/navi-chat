# Navi Chat

A private web-based chat interface for talking to Navi, built as a replacement for Slack.

## Architecture

```
Browser → Next.js :3001 → POST /api/chat → OpenClaw (127.0.0.1:18789) → Navi
```

- **Next.js 15** (App Router) with Turbopack
- **Vercel AI SDK** (`useChat` hook) for streaming
- **shadcn/ui** components (Button, ScrollArea, Textarea, Sheet, Avatar, etc.)
- **Tailwind CSS** with dark-first design
- **react-markdown** + **react-syntax-highlighter** for rich message rendering
- **localStorage** for conversation history

## Getting Started

```bash
# Install dependencies
bun install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your OpenClaw URL and token

# Run development server
bun run dev
```

Opens at [http://localhost:3001](http://localhost:3001).

## Project Structure

```
app/
  page.tsx              → redirects to /chat
  chat/
    page.tsx            → main chat UI
    layout.tsx          → chat layout wrapper
  api/chat/route.ts     → streaming proxy to OpenClaw
components/
  chat/
    message-list.tsx    → renders message list
    message-item.tsx    → single message (extensible renderer)
    chat-input.tsx      → textarea + send button
    sidebar.tsx         → conversation list
    renderers/
      text-message.tsx  → markdown text renderer
      code-block.tsx    → syntax-highlighted code blocks
  ui/                   → shadcn components
lib/
  storage.ts            → localStorage helpers
  types.ts              → shared types
```

## Features

- Streaming chat with real-time token display
- Markdown rendering with GFM support
- Syntax-highlighted code blocks with copy button
- Conversation history (localStorage)
- Mobile-responsive with slide-out sidebar
- Dark mode (default, respects system preference)
- Extensible message renderer (type-based dispatch)
