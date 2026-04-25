/**
 * MOD-OFFER — Guard de imutabilidade de issuing_legal_entity_id
 *
 * docs/20-domain/10-offer-engine.md §5 (INV-OFFER-03)
 * Task: T-6-22
 *
 * A tabela `transaction` ainda não existe (Sprint 8).
 * Enquanto ela não existir, o guard permite a mudança (stub phase).
 * Quando existir, rejeita se houver transação approved/pending para a oferta.
 *
 * ADR-11: recebe `tx: DbTx` como primeiro argumento (função lê estado).
 */
import { eq, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { offer } from '@/lib/db/schema/offer'
import { OfferLegalEntityImmutableError } from './errors'

// ---------------------------------------------------------------------------
// guardLegalEntityImmutable
// ---------------------------------------------------------------------------

/**
 * Verifica que a mudança de `issuing_legal_entity_id` é permitida para a oferta.
 *
 * INV-OFFER-03: proibido alterar o campo após a primeira transação approved/pending.
 *
 * Comportamento atual (pré-Sprint 8):
 *   - Busca a oferta para confirmar que existe.
 *   - Quando `issuing_legal_entity_id` não mudou, retorna imediatamente.
 *   - Quando mudou, tenta verificar a tabela `transaction` via information_schema.
 *     Se a tabela não existir ainda → permite (stub até Sprint 8).
 *     Se existir e houver transação blocking → lança OfferLegalEntityImmutableError.
 *
 * @param tx              Transação (ou db) ativa — não faz escrita, só leitura.
 * @param offerId         UUID da oferta a ser verificada.
 * @param newLegalEntityId UUID da nova entidade legal pretendida.
 * @throws OfferLegalEntityImmutableError quando a mudança é bloqueada.
 */
export async function guardLegalEntityImmutable(
  tx: DbTx,
  offerId: string,
  newLegalEntityId: string,
): Promise<void> {
  // 1. Busca oferta atual para obter issuing_legal_entity_id vigente.
  const rows = await tx
    .select({ issuingLegalEntityId: offer.issuingLegalEntityId })
    .from(offer)
    .where(eq(offer.id, offerId))
    .limit(1)

  const current = rows[0]
  if (!current) {
    // Oferta não encontrada — deixa a camada de cima (Server Action) tratar como 404.
    return
  }

  // 2. Se o valor não está mudando, nada a verificar.
  if (current.issuingLegalEntityId === newLegalEntityId) {
    return
  }

  // 3. INV-OFFER-03: verifica se a tabela `transaction` já existe.
  //    Sprint 8 ainda não entregou a tabela; até lá, permitir a mudança.
  const tableCheckRows = await tx.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'transaction'
    ) AS "exists"
  `)

  const transactionTableExists =
    (tableCheckRows as unknown as Array<{ exists: boolean }>)[0]?.exists ?? false

  if (!transactionTableExists) {
    // Stub: tabela transaction ainda não existe (pré-Sprint 8) → permite.
    return
  }

  // 4. Tabela existe: verificar transações blocking.
  //    Usa sql`...` puro para evitar depender de schema Drizzle do MOD-TRANSACTION
  //    (que pertence a Sprint 8 e está fora do ownership deste arquivo).
  const txCheckRows = await tx.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM "transaction"
      WHERE offer_id = ${offerId}::uuid
        AND status IN ('approved', 'pending')
    ) AS "has_blocking"
  `)

  const hasBlocking =
    (txCheckRows as unknown as Array<{ has_blocking: boolean }>)[0]
      ?.has_blocking ?? false

  if (hasBlocking) {
    // INV-OFFER-03: mudança bloqueada por transação approved/pending.
    throw new OfferLegalEntityImmutableError(offerId)
  }
}
