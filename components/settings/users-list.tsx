'use client'

import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { USERS_COLUMNS, SETTINGS_USERS_TABLE_ID } from './users-columns'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  financial: 'Financeiro',
  marketing: 'Marketing',
  support: 'Suporte',
  commercial: 'Comercial',
}

export interface UserRow {
  id: string
  fullName: string
  email: string
  isActive: boolean
  createdAt: Date
  deletedAt: Date | null
  roleKind: string | null
}

interface UsersListProps {
  users: UserRow[]
  userId: string
}

export function UsersList({ users, userId }: UsersListProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: SETTINGS_USERS_TABLE_ID,
    userId,
    columns: USERS_COLUMNS,
  })

  return (
    <div className="space-y-2">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={SETTINGS_USERS_TABLE_ID}
          userId={userId}
          columns={USERS_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de usuários internos">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              {/* name — alwaysVisible */}
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Nome
              </th>
              {isVisible('email') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  E-mail
                </th>
              )}
              {isVisible('role') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Papel
                </th>
              )}
              {isVisible('status') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Status
                </th>
              )}
              {isVisible('createdAt') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Desde
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnIds.size}
                  className="px-4 py-8 text-center text-muted-foreground/60"
                >
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.id}
                  className="hover:bg-muted/50 transition-colors"
                >
                  {/* name — alwaysVisible */}
                  <td className="px-4 py-3 font-medium text-foreground">
                    {u.fullName}
                  </td>
                  {isVisible('email') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.email}
                    </td>
                  )}
                  {isVisible('role') && (
                    <td className="px-4 py-3">
                      {u.roleKind ? (
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {ROLE_LABELS[u.roleKind] ?? u.roleKind}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">Sem papel</span>
                      )}
                    </td>
                  )}
                  {isVisible('status') && (
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
                  )}
                  {isVisible('createdAt') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      <time dateTime={new Date(u.createdAt).toISOString()}>
                        {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                      </time>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
