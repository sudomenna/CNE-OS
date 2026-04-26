import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { listRoleMatrix } from '@/lib/domain/rbac'
import { requireSession } from '@/lib/auth/session'
import { RoleMatrix } from './_components/role-matrix'

export const metadata: Metadata = {
  title: 'Permissões — Configurações',
}

export default async function PermissionsPage() {
  // Validação de sessão: redireciona para login se não autenticado
  const session = await requireSession().catch(() => null)

  // Carrega a matriz de roles × permissions
  let matrix = await listRoleMatrix().catch(() => null)

  // Se não for admin, a matriz ainda é carregada (leitura pública do servidor)
  // — o guard de mutação está nas Server Actions.
  // Se o carregamento falhar, matrix é null e exibimos mensagem de erro.

  const isAdmin = session?.user.role === 'admin'

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Navegação estrutural" className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/settings" className="hover:text-foreground transition-colors">
          Configurações
        </Link>
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span className="text-foreground font-medium" aria-current="page">
          Permissões
        </span>
      </nav>

      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Permissões</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Matriz de papéis × permissões. Clique nos checkboxes para conceder ou revogar
          permissões por papel. O papel <strong>Admin</strong> tem todas as permissões
          implicitamente e não pode ser modificado.
        </p>
      </div>

      {/* Alerta para não-admins */}
      {!isAdmin && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Apenas administradores podem alterar a matriz de permissões. Você pode visualizar a
          configuração atual.
        </div>
      )}

      {/* Erro de carregamento */}
      {matrix === null ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Não foi possível carregar a matriz de permissões. Tente recarregar a página.
        </div>
      ) : (
        <section aria-labelledby="permissions-matrix-heading">
          <h2 id="permissions-matrix-heading" className="sr-only">
            Matriz de papéis e permissões
          </h2>
          <RoleMatrix data={matrix} />
        </section>
      )}
    </div>
  )
}
