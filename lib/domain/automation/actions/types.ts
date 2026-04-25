/**
 * MOD-AUTOMATION — Tipos compartilhados de actions (T-11-08)
 *
 * docs/20-domain/15-automation.md §7 Actions
 *
 * ActionEffect: resultado padrão retornado por todas as action functions.
 * Permite que o runner registre output e error no log por nó.
 * docs/20-domain/15-automation.md §3 DDL: automation_execution_log.output / .error
 */

export type ActionEffect =
  | { ok: true; output?: unknown }
  | { ok: false; error: string }
