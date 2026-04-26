'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun, LogOut, User } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { signOutAction, signOutAllAction } from '@/app/(app)/auth/actions'

export interface AvatarDropdownProps {
  userName: string
  userEmail: string
  avatarUrl?: string | null
}

type ThemeOption = 'light' | 'dark' | 'system'

const themeOptions: { value: ThemeOption; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Claro', icon: <Sun className="h-4 w-4" /> },
  { value: 'dark', label: 'Escuro', icon: <Moon className="h-4 w-4" /> },
  { value: 'system', label: 'Sistema', icon: <Monitor className="h-4 w-4" /> },
]

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0] ?? ''
  const last = parts[parts.length - 1] ?? ''
  if (parts.length === 1) return first.charAt(0).toUpperCase()
  return (first.charAt(0) + last.charAt(0)).toUpperCase()
}

export function AvatarDropdown({ userName, userEmail, avatarUrl }: AvatarDropdownProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isPendingOut, startSignOut] = useTransition()
  const [isPendingAll, startSignOutAll] = useTransition()

  // Avoid hydration mismatch — read theme only after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  const currentTheme: ThemeOption = mounted ? ((theme as ThemeOption) ?? 'system') : 'system'

  const initials = getInitials(userName)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`Menu do usuário ${userName}`}
        >
          <Avatar className="h-8 w-8">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={userName} />
            ) : null}
            <AvatarFallback className="bg-muted text-xs font-medium uppercase text-muted-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* Header: nome + email */}
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{userName}</p>
            <p className="text-xs leading-none text-muted-foreground">{userEmail}</p>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Meu perfil */}
        <DropdownMenuItem asChild>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Link href={'/settings/account' as any} className="flex cursor-pointer items-center gap-2">
            <User className="h-4 w-4" />
            Meu perfil
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Toggle de tema — 3 opções radio-like */}
        <div className="px-2 py-1.5">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Tema</p>
          <div className="flex gap-1" role="radiogroup" aria-label="Selecionar tema">
            {themeOptions.map(({ value, label, icon }) => (
              <button
                key={value}
                role="radio"
                aria-checked={currentTheme === value}
                onClick={() => setTheme(value)}
                className={[
                  'flex flex-1 flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-xs transition-colors',
                  currentTheme === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                ].join(' ')}
                aria-label={`Tema ${label}`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* Sair */}
        <DropdownMenuItem
          onSelect={() => {
            startSignOut(async () => {
              await signOutAction()
            })
          }}
          disabled={isPendingOut}
          className="cursor-pointer gap-2"
          aria-busy={isPendingOut}
        >
          <LogOut className="h-4 w-4" />
          {isPendingOut ? 'Saindo...' : 'Sair'}
        </DropdownMenuItem>

        {/* Sair de todas as sessões */}
        <DropdownMenuItem
          onSelect={() => {
            startSignOutAll(async () => {
              await signOutAllAction()
            })
          }}
          disabled={isPendingAll}
          className="cursor-pointer gap-2 text-destructive focus:text-destructive"
          aria-busy={isPendingAll}
        >
          <LogOut className="h-4 w-4" />
          {isPendingAll ? 'Encerrando...' : 'Sair de todas as sessões'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
