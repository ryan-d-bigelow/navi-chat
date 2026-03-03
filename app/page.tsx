import { HomeDashboard } from '@/components/home/home-dashboard'
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav'

export default function Home() {
  return (
    <main className="min-h-dvh bg-zinc-950 text-zinc-100 pb-20 md:pb-0">
      <HomeDashboard />
      <MobileBottomNav />
    </main>
  )
}
