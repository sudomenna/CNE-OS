'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/auth/supabase'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
    } else {
      router.push('/contacts')
    }
    setLoading(false)
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
    } else {
      setMagicSent(true)
    }
    setLoading(false)
  }

  if (magicSent) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Verifique seu e-mail</CardTitle>
          <CardDescription>
            Enviamos um link de acesso para <strong>{email}</strong>. Clique no link para entrar.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>CNE-OS</CardTitle>
        <CardDescription>Acesse sua conta para continuar.</CardDescription>
      </CardHeader>
      <CardContent>
        {mode === 'password' ? (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-foreground underline"
              onClick={() => setMode('magic')}
            >
              Entrar com link magico
            </button>
            <a
              href="/forgot"
              className="block text-center text-sm text-muted-foreground hover:text-foreground underline"
            >
              Esqueci minha senha
            </a>
          </form>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="magic-email">E-mail</Label>
              <Input
                id="magic-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar link magico'}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-foreground underline"
              onClick={() => setMode('password')}
            >
              Usar senha
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
