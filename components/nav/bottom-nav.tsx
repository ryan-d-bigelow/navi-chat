'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavTab {
  href: string
  label: string
  emoji: string
}

const tabs: NavTab[] = [
  { href: '/chat', label: 'Chat', emoji: '\u{1F4AC}' },
  { href: '/agents', label: 'Agents', emoji: '\u{1F916}' },
  { href: '/linear', label: 'Linear', emoji: '\u{1F4CB}' },
  { href: '/memory', label: 'Memory', emoji: '\u{1F9E0}' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-800/60 bg-zinc-950/95 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around">
        {tabs.map(({ href, label, emoji }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                active
                  ? 'text-emerald-400'
                  : 'text-zinc-500 active:text-zinc-300'
              }`}
            >
              <span className="text-lg leading-none" aria-hidden="true">
                {emoji}
              </span>
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
