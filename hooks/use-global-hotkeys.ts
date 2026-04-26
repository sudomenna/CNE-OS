'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export interface UseGlobalHotkeysOptions {
  onOpenHelp: () => void
  onOpenSearch?: () => void
}

/** Returns true when the active element should suppress global hotkeys */
function isEditableTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

export function useGlobalHotkeys({ onOpenHelp, onOpenSearch }: UseGlobalHotkeysOptions): void {
  const router = useRouter()
  // Stores the first key of a chord and the timestamp it was pressed
  const chordRef = useRef<{ key: string; ts: number } | null>(null)

  const onOpenHelpRef = useRef(onOpenHelp)
  const onOpenSearchRef = useRef(onOpenSearch)
  useEffect(() => { onOpenHelpRef.current = onOpenHelp }, [onOpenHelp])
  useEffect(() => { onOpenSearchRef.current = onOpenSearch }, [onOpenSearch])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Never fire when a modifier key (other than Shift for "?") is held,
    // so we don't conflict with cmd+K, etc.
    if (e.metaKey || e.ctrlKey || e.altKey) return

    // Suppress when focus is in an editable element
    if (isEditableTarget(document.activeElement)) return

    const key = e.key

    // --- "/" → open search / command palette ---
    if (key === '/') {
      e.preventDefault()
      if (onOpenSearchRef.current) {
        onOpenSearchRef.current()
      } else {
        // Fallback: dispatch synthetic cmd+k to trigger CommandPalette
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'k',
            metaKey: true,
            bubbles: true,
            cancelable: true,
          })
        )
      }
      chordRef.current = null
      return
    }

    // --- "?" → open help dialog ---
    if (key === '?') {
      e.preventDefault()
      onOpenHelpRef.current()
      chordRef.current = null
      return
    }

    // --- Escape → TODO: close any open modal/popover ---
    // Not implemented here — managed by individual dialog/sheet components via Radix.

    // --- "g" chord initiation ---
    if (key === 'g') {
      e.preventDefault()
      chordRef.current = { key: 'g', ts: Date.now() }
      return
    }

    // --- "g <x>" chord resolution ---
    if (chordRef.current?.key === 'g') {
      const elapsed = Date.now() - chordRef.current.ts
      if (elapsed <= 500) {
        e.preventDefault()
        chordRef.current = null
        switch (key) {
          case 'i':
            router.push('/inbox')
            break
          case 'c':
            router.push('/contacts')
            break
          case 'f':
            router.push('/funnels')
            break
          case 'o':
            router.push('/offers')
            break
          case 'a':
            router.push('/analytics')
            break
          case 't':
            router.push('/tickets')
            break
        }
        return
      }
      // Chord expired — discard and fall through
      chordRef.current = null
    }

    // Any other key cancels a pending chord
    chordRef.current = null
  }, [router])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
