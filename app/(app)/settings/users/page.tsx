import { listUsers } from './actions'
import { InviteUserForm } from './invite-user-form'
import { UsersList } from '@/components/settings/users-list'
import { requireSession } from '@/lib/auth/session'

export const metadata = {
  title: 'Usuários — Configurações',
}

export default async function UsersPage() {
  const [result, session] = await Promise.all([
    listUsers(),
    requireSession().catch(() => null),
  ])

  const users = result.ok ? result.data : []
  const userId = session?.user.id ?? 'anonymous'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuários</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Convide e gerencie usuários internos da CNE Educação.
          </p>
        </div>
        <InviteUserForm />
      </div>

      {!result.ok && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Não foi possível carregar os usuários. Tente recarregar a página.
        </div>
      )}

      <UsersList users={users} userId={userId} />
    </div>
  )
}
