'use client'

import { useState } from 'react'
import { useGlobalHotkeys } from '@/hooks/use-global-hotkeys'
import { HotkeysHelpDialog } from '@/components/layout/hotkeys-help-dialog'

interface HotkeysProviderProps {
  children: React.ReactNode
}

export function HotkeysProvider({ children }: HotkeysProviderProps) {
  const [isHelpOpen, setIsHelpOpen] = useState(false)

  useGlobalHotkeys({
    onOpenHelp: () => setIsHelpOpen(true),
    // onOpenSearch not provided → hook falls back to synthetic cmd+k dispatch
  })

  return (
    <>
      {children}
      <HotkeysHelpDialog
        open={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </>
  )
}
