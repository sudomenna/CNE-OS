// BR-CONTACT-CLASSIFICATION: classificação determinística baseada em transações aprovadas
// Hierarquia (alta → baixa): mentorado > student > customer > lead

export type ProductKind =
  | 'course'
  | 'ebook'
  | 'training_online'
  | 'training_in_person'
  | 'mentoring'
  | 'bonus'
  | 'other';

export type ContactClassification = 'lead' | 'customer' | 'student' | 'mentorado';

export type TransactionForClassification = {
  transactionId: string;
  status: 'approved' | 'refused' | 'refunded' | 'chargeback' | 'cancelled' | 'pending';
  productKinds: ProductKind[];
};

// BR-CONTACT-CLASSIFICATION §3: kinds que promovem a student
const COURSE_KINDS: ProductKind[] = ['course', 'training_online', 'training_in_person'];

// BR-CONTACT-CLASSIFICATION §3: kind exclusivo de mentorado (topo da hierarquia)
const MENTORED_KIND: ProductKind = 'mentoring';

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

  // BR-CONTACT-CLASSIFICATION §3: hierarquia — mentorado prevalece sobre tudo
  if (kinds.has(MENTORED_KIND)) return 'mentorado';

  // BR-CONTACT-CLASSIFICATION §3: student vence customer
  if (COURSE_KINDS.some((k) => kinds.has(k))) return 'student';

  // BR-CONTACT-CLASSIFICATION §3: qualquer outra venda aprovada → customer
  return 'customer';
}
