import type { SessionContext } from '@/lib/auth/session'

type TopbarProps = {
  user: SessionContext['user']
}

export function Topbar({ user }: TopbarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-3">
        <kbd
          className="hidden rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500 sm:inline-flex"
          aria-label="Atalho para abrir paleta de comandos: Command K"
        >
          ⌘K
        </kbd>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-700 uppercase"
          aria-label={`Usuário com role ${user.role}`}
          role="img"
        >
          {user.role.charAt(0)}
        </div>
      </div>
    </header>
  )
}
