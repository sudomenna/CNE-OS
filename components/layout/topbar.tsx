import type { SessionContext } from '@/lib/auth/session'
import { ThemeToggle } from '@/components/layout/theme-toggle'

type TopbarProps = {
  user: SessionContext['user']
}

export function Topbar({ user }: TopbarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div />
      <div className="flex items-center gap-3">
        <kbd
          className="hidden rounded border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground sm:inline-flex"
          aria-label="Atalho para abrir paleta de comandos: Command K"
        >
          ⌘K
        </kbd>
        <ThemeToggle />
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground uppercase"
          aria-label={`Usuário com role ${user.role}`}
          role="img"
        >
          {user.role.charAt(0)}
        </div>
      </div>
    </header>
  )
}
