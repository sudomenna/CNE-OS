/**
 * ActionError — erro estruturado para Server Actions.
 * Usado por requireSession, requirePermission e outras guards.
 */

export type ActionErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'INTERNAL'

export class ActionError extends Error {
  constructor(
    public readonly code: ActionErrorCode,
    message: string,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ActionError'
  }
}
