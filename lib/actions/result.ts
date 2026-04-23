/**
 * ActionResult — tipo canônico de retorno para Server Actions.
 * Spec: docs/30-contracts/05-api-server-actions.md §3
 */
import type { ZodIssue } from 'zod'
import { ActionError } from '@/lib/actions/errors'

export type ActionErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE_VIOLATED'
  | 'INTEGRATION_FAILED'
  | 'INTERNAL'

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false
      error: {
        code: ActionErrorCode
        message: string
        issues?: ZodIssue[]
        rule?: string
        correlationId: string
      }
    }

// Re-exporta ActionError para uso em Server Actions
export { ActionError }

export async function toActionResult<T>(
  fn: () => Promise<T>,
  correlationId = crypto.randomUUID(),
): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (err) {
    if (err instanceof ActionError) {
      // Mapeia o código interno do ActionError para ActionErrorCode
      const codeMap: Record<string, ActionErrorCode> = {
        UNAUTHORIZED: 'UNAUTHORIZED',
        FORBIDDEN: 'UNAUTHORIZED',
        NOT_FOUND: 'NOT_FOUND',
        VALIDATION: 'VALIDATION_FAILED',
        INTERNAL: 'INTERNAL',
      }
      const code: ActionErrorCode = codeMap[err.code] ?? 'INTERNAL'
      const rule = err.meta?.['rule'] as string | undefined
      return {
        ok: false,
        error: {
          code,
          message: err.message,
          ...(rule !== undefined ? { rule } : {}),
          correlationId,
        },
      }
    }

    // Zod ZodError — possui campo .issues
    if (err !== null && typeof err === 'object' && 'issues' in err) {
      const zodErr = err as { message: string; issues: ZodIssue[] }
      return {
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: zodErr.message,
          issues: zodErr.issues,
          correlationId,
        },
      }
    }

    const message = err instanceof Error ? err.message : 'Erro inesperado'
    return {
      ok: false,
      error: { code: 'INTERNAL', message, correlationId },
    }
  }
}
