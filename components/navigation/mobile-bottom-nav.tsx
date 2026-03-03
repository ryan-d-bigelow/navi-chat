'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Brain,
  HeartPulse,
  Home,
  MessageSquare,
  Terminal,
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/agents', label: 'Agents', icon: Terminal },
  { href: '/memory', label: 'Memory', icon: Brain },
  { href: '/heartbeat', label: 'Heartbeat', icon: HeartPulse },
  { href: '/', label: 'Home', icon: Home },
] as const

export function MobileBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800/60 bg-zinc-950/90 backdrop-blur md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`group flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium transition-all duration-200 focus-ring ${
                active
                  ? 'bg-zinc-800/80 text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.15)]'
                  : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <Icon
                className={`h-5 w-5 transition-transform duration-200 ${
                  active ? 'scale-110' : 'scale-100'
                }`}
                aria-hidden="true"
              />
              <span className="leading-none">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
