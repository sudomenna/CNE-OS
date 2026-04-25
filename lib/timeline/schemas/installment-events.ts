/**
 * MOD-BILLING — Timeline payload schemas for installment events
 *
 * docs/30-contracts/03-timeline-event-catalog.md §Assinatura / Cobrança
 * docs/20-domain/13-subscription-billing.md §9
 * T-9-17
 *
 * Kinds (snake_case of TE-ID):
 *   installment_paid     ← TE-INSTALLMENT-PAID
 *   installment_overdue  ← TE-INSTALLMENT-OVERDUE
 */
import { z } from 'zod'

// ── TE-INSTALLMENT-PAID ──────────────────────────────────────────────────────
// Emitted when an installment is confirmed as paid.
// subscriptionId and transactionId are optional because an installment may
// belong to either a subscription or a one-time transaction.
export const TeInstallmentPaidSchema = z.object({
  installmentId: z.string().uuid(),
  subscriptionId: z.string().uuid().optional(),
  transactionId: z.string().uuid().optional(),
  amount: z.number().positive(),
  paidAt: z.string().datetime(),
})

export type TeInstallmentPaid = z.infer<typeof TeInstallmentPaidSchema>

// ── TE-INSTALLMENT-OVERDUE ───────────────────────────────────────────────────
// Emitted when an installment passes its due date without payment.
export const TeInstallmentOverdueSchema = z.object({
  installmentId: z.string().uuid(),
  subscriptionId: z.string().uuid().optional(),
  transactionId: z.string().uuid().optional(),
  amount: z.number().positive(),
  dueAt: z.string().datetime(),
})

export type TeInstallmentOverdue = z.infer<typeof TeInstallmentOverdueSchema>
