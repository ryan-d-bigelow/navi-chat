import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/components/theme-provider'
import { MobileNavProvider } from '@/app/context/mobile-nav-context'
import './globals.css'

export const metadata: Metadata = {
  title: 'Navi Chat',
  description: 'Private chat interface with Navi',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Navi',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#09090b',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <MobileNavProvider>
            <TooltipProvider>
              {children}
            </TooltipProvider>
            <Toaster />
          </MobileNavProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
