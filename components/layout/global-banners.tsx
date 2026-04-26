'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WifiOff } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/auth/supabase'
import { stopImpersonationAction } from '@/app/(app)/auth/actions'

export function GlobalBanners() {
  const router = useRouter()

  // Banner 1 — Impersonação
  const [impersonating, setImpersonating] = useState<string | null>(null)

  // Banner 2 — Offline
  const [isOffline, setIsOffline] = useState(false)

  // Banner 3 — Sessão expirada
  const [sessionExpired, setSessionExpired] = useState(false)
  const hadSession = useRef(false)

  useEffect(() => {
    // --- Banner 1: cookie de impersonação ---
    function readImpersonationCookie(): string | null {
      const match = document.cookie
        .split('; ')
        .find((row) => row.startsWith('cne_impersonating='))
      if (!match) return null
      const raw = match.split('=')[1] ?? ''
      try {
        return decodeURIComponent(raw) || null
      } catch {
        return raw || null
      }
    }

    setImpersonating(readImpersonationCookie())
  }, [])

  useEffect(() => {
    // --- Banner 2: online / offline ---
    setIsOffline(!navigator.onLine)

    function handleOffline() {
      setIsOffline(true)
    }
    function handleOnline() {
      setIsOffline(false)
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  useEffect(() => {
    // --- Banner 3: sessão expirada via Supabase Auth ---
    const supabase = createSupabaseBrowserClient()

    // Verificar se já há sessão ativa
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        hadSession.current = true
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        hadSession.current = true
        setSessionExpired(false)
      } else if (event === 'SIGNED_OUT' && hadSession.current) {
        setSessionExpired(true)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function handleStopImpersonation() {
    await stopImpersonationAction()
    setImpersonating(null)
    router.refresh()
  }

  const hasAnyBanner = impersonating !== null || isOffline || sessionExpired

  if (!hasAnyBanner) return null

  return (
    <div className="flex flex-col">
      {/* Banner 1 — Impersonação */}
      {impersonating !== null && (
        <div className="flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground">
          <span>
            Voce esta impersonando <strong>{impersonating}</strong>
          </span>
          <button
            type="button"
            onClick={handleStopImpersonation}
            className="underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive-foreground"
          >
            Sair da impersonacao
          </button>
        </div>
      )}

      {/* Banner 2 — Offline */}
      {isOffline && (
        <div className="flex items-center justify-center gap-2 bg-yellow-500 px-4 py-2 text-sm font-medium text-white">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Sem conexao com a internet</span>
        </div>
      )}

      {/* Banner 3 — Sessão expirada */}
      {sessionExpired && (
        <div className="flex items-center justify-center gap-2 border-b bg-muted px-4 py-2 text-sm font-medium text-muted-foreground">
          <span>Sua sessao expirou.</span>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Fazer login
          </button>
        </div>
      )}
    </div>
  )
}
