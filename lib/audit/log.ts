/**
 * logAudit — helper para inserir registro no audit_log dentro de uma transação.
 * Spec: docs/50-business-rules/BR-AUDIT.md §3 (mesma transação do efeito)
 * Spec: docs/30-contracts/05-api-server-actions.md §7
 */
import type { DbTx } from '@/lib/db/client'
import { auditLog } from '@/lib/db/schema/audit'
import type { AuditEntry } from '@/lib/db/schema/audit'

// BR-AUDIT §3: logAudit sempre recebe tx — nunca usa db diretamente (atomicidade)
export async function logAudit(tx: DbTx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    actorUserId: entry.actorUserId ?? null,
    actorSystem: entry.actorSystem ?? null,
    actionKind: entry.actionKind,
    resourceKind: entry.resourceKind,
    resourceId: entry.resourceId ?? null,
    before: (entry.before ?? {}) as Record<string, unknown>,
    after: (entry.after ?? {}) as Record<string, unknown>,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
    context: (entry.context ?? {}) as Record<string, unknown>,
  })
}
