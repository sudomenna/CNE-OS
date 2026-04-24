// BR-CONTACT-CLASSIFICATION: classificação determinística baseada em transações aprovadas

export type ProductKind =
  | 'course'
  | 'ebook'
  | 'training_online'
  | 'training_in_person'
  | 'mentoring'
  | 'bonus'
  | 'other';

export type ContactClassification = 'lead' | 'customer' | 'student' | 'paid_lead';

export type TransactionForClassification = {
  transactionId: string;
  status: 'approved' | 'refused' | 'refunded' | 'chargeback' | 'cancelled' | 'pending';
  productKinds: ProductKind[];
};

// BR-CONTACT-CLASSIFICATION §3: kinds que promovem a student (hierarquia máxima)
const COURSE_KINDS: ProductKind[] = ['course', 'training_online', 'training_in_person'];

// BR-CONTACT-CLASSIFICATION §3: kinds que, se exclusivos, resultam em paid_lead
const PAID_LEAD_ONLY_KINDS: ProductKind[] = ['ebook', 'bonus', 'other'];

/**
 * Pura, determinística, sem I/O.
 * Recalcula a classificação a partir das transações vigentes.
 * A Server Action compara o resultado com o valor atual e,
 * se divergente, faz UPDATE + grava contact_status_history + emite TE.
 */
export function classifyContact(
  _current: ContactClassification,
  transactions: TransactionForClassification[],
): ContactClassification {
  // BR-CONTACT-CLASSIFICATION §1: apenas transações aprovadas contam
  const approved = transactions.filter((t) => t.status === 'approved');

  if (approved.length === 0) return 'lead';

  // BR-CONTACT-CLASSIFICATION §2: conjunto de kinds das transações aprovadas
  const kinds = new Set(approved.flatMap((t) => t.productKinds));

  // BR-CONTACT-CLASSIFICATION §3: hierarquia — student prevalece sobre todo o resto
  if (COURSE_KINDS.some((k) => kinds.has(k))) return 'student';

  // BR-CONTACT-CLASSIFICATION §3: paid_lead somente se EXCLUSIVAMENTE ebook/bonus/other
  const isExclusivelyPaidLead = [...kinds].every((k) =>
    (PAID_LEAD_ONLY_KINDS as string[]).includes(k),
  );
  if (isExclusivelyPaidLead) return 'paid_lead';

  return 'customer';
}
