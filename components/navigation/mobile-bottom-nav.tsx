'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMobileNav } from '@/app/context/mobile-nav-context'
import {
  Brain,
  HeartPulse,
  Home,
  MessageSquare,
  Terminal,
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/chat', label: 'Chat', icon: MessageSquare, backKey: 'chat' },
  { href: '/agents', label: 'Agents', icon: Terminal, backKey: 'agent' },
  { href: '/memory', label: 'Memory', icon: Brain, backKey: null },
  { href: '/heartbeat', label: 'Heartbeat', icon: HeartPulse, backKey: null },
  { href: '/', label: 'Home', icon: Home, backKey: null },
] as const

type BackKey = 'chat' | 'agent'

export function MobileBottomNav() {
  const pathname = usePathname()
  const { chatBackAction, agentBackAction } = useMobileNav()

  const backActions: Record<BackKey, (() => void) | null> = {
    chat: chatBackAction,
    agent: agentBackAction,
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800/60 bg-zinc-950/90 backdrop-blur md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon, backKey }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          const backAction = backKey ? backActions[backKey] : null
          const shouldIntercept = active && backAction !== null

          const className = `group flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium transition-all duration-200 focus-ring ${
            active
              ? 'bg-zinc-800/80 text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.15)]'
              : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200'
          }`

          const content = (
            <>
              <Icon
                className={`h-5 w-5 transition-transform duration-200 ${
                  active ? 'scale-110' : 'scale-100'
                }`}
                aria-hidden="true"
              />
              <span className="leading-none">{label}</span>
            </>
          )

          if (shouldIntercept) {
            return (
              <button
                key={href}
                type="button"
                onClick={backAction}
                aria-current="page"
                className={className}
              >
                {content}
              </button>
            )
          }

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={className}
            >
              {content}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
