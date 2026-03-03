'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'

type BackAction = (() => void) | null

interface MobileNavContextValue {
  chatBackAction: BackAction
  agentBackAction: BackAction
  registerChatBack: (fn: BackAction) => void
  registerAgentBack: (fn: BackAction) => void
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null)

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [chatBackAction, setChatBackAction] = useState<BackAction>(null)
  const [agentBackAction, setAgentBackAction] = useState<BackAction>(null)

  // Use refs to stabilise the callbacks stored in state (avoids stale closures)
  const chatRef = useRef<BackAction>(null)
  const agentRef = useRef<BackAction>(null)

  const registerChatBack = useCallback((fn: BackAction) => {
    chatRef.current = fn
    // Wrap in arrow so React doesn't call fn as an initialiser
    setChatBackAction(() => fn)
  }, [])

  const registerAgentBack = useCallback((fn: BackAction) => {
    agentRef.current = fn
    setAgentBackAction(() => fn)
  }, [])

  return (
    <MobileNavContext value={{
      chatBackAction,
      agentBackAction,
      registerChatBack,
      registerAgentBack,
    }}>
      {children}
    </MobileNavContext>
  )
}

export function useMobileNav() {
  const ctx = useContext(MobileNavContext)
  if (!ctx) throw new Error('useMobileNav must be used inside MobileNavProvider')
  return ctx
}
