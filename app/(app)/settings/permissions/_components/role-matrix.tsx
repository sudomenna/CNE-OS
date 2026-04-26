'use client'

import { useOptimistic, useTransition } from 'react'
import { Lock } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { grantPermissionAction, revokePermissionAction } from '../actions'
import type { RoleMatrix } from '@/lib/domain/rbac'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  data: RoleMatrix
}

// ---------------------------------------------------------------------------
// Types for optimistic state
// ---------------------------------------------------------------------------

type AssignmentKey = `${string}:${string}` // `${roleId}:${permissionId}`

type OptimisticAction =
  | { type: 'grant'; roleId: string; permissionId: string }
  | { type: 'revoke'; roleId: string; permissionId: string }

function buildAssignmentSet(assignments: RoleMatrix['assignments']): Set<AssignmentKey> {
  return new Set(assignments.map((a) => `${a.roleId}:${a.permissionId}` as AssignmentKey))
}

function applyOptimistic(
  current: Set<AssignmentKey>,
  action: OptimisticAction,
): Set<AssignmentKey> {
  const next = new Set(current)
  const key: AssignmentKey = `${action.roleId}:${action.permissionId}`
  if (action.type === 'grant') {
    next.add(key)
  } else {
    next.delete(key)
  }
  return next
}

// ---------------------------------------------------------------------------
// Role label map
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  financial: 'Financeiro',
  marketing: 'Marketing',
  support: 'Suporte',
  commercial: 'Comercial',
}

// ---------------------------------------------------------------------------
// RoleMatrix component
// ---------------------------------------------------------------------------

export function RoleMatrix({ data }: Props) {
  const [isPending, startTransition] = useTransition()

  const [optimisticAssignments, dispatchOptimistic] = useOptimistic(
    buildAssignmentSet(data.assignments),
    applyOptimistic,
  )

  function isAssigned(roleId: string, permissionId: string): boolean {
    return optimisticAssignments.has(`${roleId}:${permissionId}` as AssignmentKey)
  }

  function handleToggle(role: RoleMatrix['roles'][number], permId: string, currentlyAssigned: boolean) {
    // BR-RBAC: admin role checkboxes são desabilitados — nunca chegam aqui
    if (role.kind === 'admin') return

    const action: OptimisticAction = currentlyAssigned
      ? { type: 'revoke', roleId: role.id, permissionId: permId }
      : { type: 'grant', roleId: role.id, permissionId: permId }

    startTransition(async () => {
      // Optimistic update imediato
      dispatchOptimistic(action)

      const result = currentlyAssigned
        ? await revokePermissionAction({ roleId: role.id, permissionId: permId })
        : await grantPermissionAction({ roleId: role.id, permissionId: permId })

      if (!result.ok) {
        // A revalidação de path vai restaurar o estado correto do servidor.
        // Não há rollback manual — o optimistic state se reconcilia no próximo render.
        console.error('[role-matrix] toggle failed:', result.error)
      }
    })
  }

  // Sort roles: admin first, then alphabetically by kind
  const sortedRoles = [...data.roles].sort((a, b) => {
    if (a.kind === 'admin') return -1
    if (b.kind === 'admin') return 1
    return a.kind.localeCompare(b.kind)
  })

  // Sort permissions alphabetically by action
  const sortedPermissions = [...data.permissions].sort((a, b) =>
    a.action.localeCompare(b.action),
  )

  return (
    <TooltipProvider>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm" aria-label="Matriz de papéis e permissões">
          <caption className="sr-only">
            Cada célula indica se o papel (coluna) tem a permissão (linha) concedida. Clique no
            checkbox para alternar. O papel Admin tem todas as permissões implicitamente.
          </caption>
          <thead className="border-b border-border bg-muted/50">
            <tr>
              {/* Primeira coluna: nome da permissão */}
              <th
                scope="col"
                className="sticky left-0 z-10 bg-muted/50 px-4 py-3 text-left font-medium text-muted-foreground min-w-[200px]"
              >
                Permissão
              </th>
              {sortedRoles.map((role) => (
                <th
                  key={role.id}
                  scope="col"
                  className="px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap"
                >
                  {ROLE_LABELS[role.kind] ?? role.kind}
                  {role.kind === 'admin' && (
                    <span className="sr-only"> (somente leitura — tem todas as permissões)</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedPermissions.map((perm) => (
              <tr
                key={perm.id}
                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
              >
                {/* Linha header: nome da ação */}
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-mono text-xs font-normal text-foreground"
                >
                  <span className="flex items-center gap-1.5">
                    {perm.action}
                    {perm.requires2fa && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            aria-label="Requer 2FA ativo e recentemente verificado"
                            className="inline-flex"
                          >
                            <Lock
                              className="h-3 w-3 text-amber-500 flex-shrink-0"
                              aria-hidden="true"
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p className="text-xs">Requer 2FA ativo e recentemente verificado</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                </th>

                {/* Células de checkbox por role */}
                {sortedRoles.map((role) => {
                  const isAdmin = role.kind === 'admin'
                  const assigned = isAdmin ? true : isAssigned(role.id, perm.id)

                  return (
                    <td key={role.id} className="px-4 py-3 text-center">
                      {isAdmin ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {/* Wrapper span necessário para tooltip em elemento desabilitado */}
                            <span className="inline-flex items-center justify-center">
                              <Checkbox
                                checked={true}
                                disabled
                                aria-label={`Permissão ${perm.action} para o papel Admin (sempre concedida implicitamente)`}
                                className="cursor-not-allowed"
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Admin tem todas as permissões implicitamente</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Checkbox
                          checked={assigned}
                          disabled={isPending}
                          aria-label={`Permitir ${perm.action} para o papel ${ROLE_LABELS[role.kind] ?? role.kind}`}
                          onCheckedChange={() => handleToggle(role, perm.id, assigned)}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}

            {sortedPermissions.length === 0 && (
              <tr>
                <td
                  colSpan={sortedRoles.length + 1}
                  className="px-4 py-8 text-center text-muted-foreground/60"
                >
                  Nenhuma permissão cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  )
}
