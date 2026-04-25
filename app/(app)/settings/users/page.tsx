import { listUsers } from './actions'
import { InviteUserForm } from './invite-user-form'

export const metadata = {
  title: 'Usuários — Configurações',
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  financial: 'Financeiro',
  marketing: 'Marketing',
  support: 'Suporte',
  commercial: 'Comercial',
}

export default async function UsersPage() {
  const result = await listUsers()
  const users = result.ok ? result.data : []

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

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de usuários internos">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Nome
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                E-mail
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Papel
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Status
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Desde
              </th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground/60">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {u.fullName}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.email}
                  </td>
                  <td className="px-4 py-3">
                    {u.roleKind ? (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {ROLE_LABELS[u.roleKind] ?? u.roleKind}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">Sem papel</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.isActive ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-slate-600/20">
                        Inativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
