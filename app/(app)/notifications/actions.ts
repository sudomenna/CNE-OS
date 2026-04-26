'use server'

/**
 * MOD-NOTIFICATIONS — Server Actions para o Centro de Notificações
 * T-12-04: Centro de Notificações
 *
 * TODO: substituir implementação fallback por tabela `user_notification` quando criada.
 * Atualmente usa `audit_log` filtrado por `actor_user_id = currentUserId` como fallback.
 *
 * Spec: docs/70-ux/09-interaction-patterns.md §3 (Realtime / Notificação desktop)
 *       docs/70-ux/02-information-architecture.md §3 (Topbar)
 * Contract: docs/30-contracts/05-api-server-actions.md
 */

import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { auditLog } from '@/lib/db/schema/audit'
import { requireSession } from '@/lib/auth/session'
import { toActionResult, type ActionResult } from '@/lib/actions/result'

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type NotificationItem = {
  id: string
  message: string
  resourceKind: string
  resourceId: string | null
  isRead: boolean
  createdAt: string // ISO string para serialização segura no Client Component
}

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

const markAsReadSchema = z.object({
  id: z.string().uuid(),
})

// ---------------------------------------------------------------------------
// listNotifications
//
// Retorna as últimas N notificações do usuário corrente.
// Fallback: lê audit_log filtrado por actor_user_id.
// TODO: substituir por tabela user_notification quando criada.
// ---------------------------------------------------------------------------

export async function listNotifications(
  limit = 20,
): Promise<ActionResult<NotificationItem[]>> {
  return toActionResult(async () => {
    const ctx = await requireSession()

    // TODO: substituir por tabela user_notification quando criada.
    const rows = await db
      .select({
        id: auditLog.id,
        actionKind: auditLog.actionKind,
        resourceKind: auditLog.resourceKind,
        resourceId: auditLog.resourceId,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(eq(auditLog.actorUserId, ctx.user.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)

    const notifications: NotificationItem[] = rows.map((row) => ({
      id: row.id,
      message: formatAuditMessage(row.actionKind, row.resourceKind),
      resourceKind: row.resourceKind,
      resourceId: row.resourceId ?? null,
      // TODO: quando tabela user_notification for criada, usar campo `read_at IS NOT NULL`.
      isRead: false,
      createdAt: row.createdAt.toISOString(),
    }))

    return notifications
  })
}

// ---------------------------------------------------------------------------
// markAllAsRead
//
// Marca todas as notificações como lidas.
// TODO: substituir por UPDATE em user_notification quando tabela for criada.
// ---------------------------------------------------------------------------

export async function markAllAsRead(): Promise<ActionResult<{ ok: true }>> {
  return toActionResult(async () => {
    // Guard de sessão obrigatório mesmo em no-op
    await requireSession()

    // TODO: substituir por UPDATE user_notification SET read_at = now()
    // WHERE user_id = ctx.user.id AND read_at IS NULL quando tabela for criada.
    return { ok: true } as const
  })
}

// ---------------------------------------------------------------------------
// markAsRead
//
// Marca uma notificação específica como lida.
// TODO: substituir por UPDATE em user_notification quando tabela for criada.
// ---------------------------------------------------------------------------

export async function markAsRead(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  return toActionResult(async () => {
    await requireSession()
    // Valida o input mesmo sendo no-op, para garantir contrato de fronteira.
    markAsReadSchema.parse(raw)

    // TODO: substituir por UPDATE user_notification SET read_at = now()
    // WHERE id = input.id AND user_id = ctx.user.id quando tabela for criada.
    return { ok: true } as const
  })
}

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

function formatAuditMessage(actionKind: string, resourceKind: string): string {
  const actionLabels: Record<string, string> = {
    create: 'criou',
    update: 'atualizou',
    delete: 'excluiu',
    merge: 'mesclou',
    unmerge: 'desfez a mescla de',
    refund: 'solicitou reembolso em',
    status_change: 'alterou o status de',
    impersonate: 'impersonou',
    other: 'executou ação em',
  }

  const resourceLabels: Record<string, string> = {
    contact: 'contato',
    offer: 'oferta',
    transaction: 'transação',
    campaign: 'campanha',
    funnel: 'funil',
    brand: 'marca',
    user_account: 'usuário',
    webhook_log: 'webhook',
    automation_flow: 'automação',
    subscription: 'assinatura',
    installment: 'parcela',
    product: 'produto',
    product_category: 'categoria',
    commercial_benefit: 'benefício',
    funnel_entry: 'oportunidade',
  }

  const action = actionLabels[actionKind] ?? actionKind
  const resource = resourceLabels[resourceKind] ?? resourceKind

  return `Você ${action} um(a) ${resource}`
}
