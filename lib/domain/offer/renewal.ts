/**
 * MOD-OFFER — assertRenewalEligibility
 *
 * Implements FLOW-10: Renewal via New Offer
 * BR-RENEWAL: verifica que o contato possui entitlement ativo (ou dentro da
 * janela de graça de 30 dias) proveniente da oferta original antes de permitir
 * a venda de uma oferta de renovação.
 *
 * ADR-10: lança DomainError; nunca retorna Result<T,E>
 * ADR-11: tx como primeiro argumento (consome DB)
 * Zero I/O direto — só consome tx para queries.
 *
 * docs/60-flows/10-renewal-via-new-offer.md
 * docs/50-business-rules/BR-RENEWAL.md
 */

import { and, eq, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { offer } from '@/lib/db/schema/offer'
import { customerEntitlement } from '@/lib/db/schema/entitlement'
import { transaction } from '@/lib/db/schema/transaction'
import { OfferNotRenewal, RenewalWithoutActiveEntitlement } from './errors'

// ---------------------------------------------------------------------------
// Grace period constant
// BR-RENEWAL OQ-BR-RENEW-01: Fase 1 — constante global de 30 dias.
// ---------------------------------------------------------------------------

/** Grace period in days — BR-RENEWAL OQ-BR-RENEW-01: global constant for Phase 1 */
const RENEWAL_GRACE_PERIOD_DAYS = 30

// ---------------------------------------------------------------------------
// assertRenewalEligibility
// ---------------------------------------------------------------------------

/**
 * Verifica que o contato pode comprar a oferta de renovação `offerId`.
 *
 * Algoritmo (BR-RENEWAL §Algoritmo):
 * 1. Carrega a oferta; exige type='renewal' e renews_offer_id != null.
 * 2. Obtém originOfferId = offer.renews_offer_id.
 * 3. Busca customer_entitlement do contato com:
 *    - status='active'  OU
 *    - status='expired' AND ends_at > now() - 30 days (grace period)
 *    cujo origin_transaction_id aponta para transaction approved do contato com offer_id=originOfferId.
 * 4. Rejeita entitlements com status='revoked'.
 * 5. Se nenhum encontrado → throw RenewalWithoutActiveEntitlement.
 *
 * @param tx        Transação DB ativa (ADR-11)
 * @param contactId UUID do contato comprando a oferta de renovação
 * @param offerId   UUID da oferta de renovação (O2)
 *
 * @throws OfferNotRenewal                    se a oferta não é do tipo 'renewal'
 * @throws RenewalWithoutActiveEntitlement    se o contato não tem entitlement elegível
 */
export async function assertRenewalEligibility(
  tx: DbTx,
  contactId: string,
  offerId: string,
): Promise<void> {
  // ---------------------------------------------------------------------------
  // Passo 1: Carregar oferta e verificar que é do tipo renewal
  // BR-RENEWAL §Algoritmo passo 1
  // ---------------------------------------------------------------------------
  const offerRows = await tx
    .select({
      id: offer.id,
      type: offer.type,
      renewsOfferId: offer.renewsOfferId,
    })
    .from(offer)
    .where(eq(offer.id, offerId))
    .limit(1)

  const offerRow = offerRows[0]

  // BR-RENEWAL E-01: oferta deve existir, ter type='renewal' e renews_offer_id != null
  if (!offerRow || offerRow.type !== 'renewal' || offerRow.renewsOfferId == null) {
    throw new OfferNotRenewal(offerId)
  }

  // ---------------------------------------------------------------------------
  // Passo 2: Obter originOfferId
  // ---------------------------------------------------------------------------
  const originOfferId = offerRow.renewsOfferId

  // ---------------------------------------------------------------------------
  // Passo 3 + 4: Buscar entitlement elegível
  //
  // Elegível significa:
  //   (a) status='active'  — direito ainda vigente, OU
  //   (b) status='expired' AND ends_at > now() - INTERVAL '30 days'  — dentro da graça
  //
  // cujo origin_transaction_id aponta para uma transaction com:
  //   contact_id = contactId
  //   offer_id   = originOfferId
  //   status     = 'approved'
  //
  // Entitlements 'revoked' são explicitamente excluídos pelo filtro de status acima
  // (a cláusula WHERE só inclui 'active' e 'expired').
  // BR-RENEWAL tabela de decisão linha 5: revoked → rejeitar.
  // ---------------------------------------------------------------------------
  const graceCutoff = sql`now() - INTERVAL '${sql.raw(String(RENEWAL_GRACE_PERIOD_DAYS))} days'`

  const eligibleEntitlements = await tx
    .select({ id: customerEntitlement.id })
    .from(customerEntitlement)
    .innerJoin(
      transaction,
      eq(customerEntitlement.originTransactionId, transaction.id),
    )
    .where(
      and(
        eq(customerEntitlement.contactId, contactId),
        eq(transaction.contactId, contactId),
        eq(transaction.offerId, originOfferId),
        eq(transaction.status, 'approved'),
        sql`(
          ${customerEntitlement.status} = 'active'
          OR (
            ${customerEntitlement.status} = 'expired'
            AND ${customerEntitlement.endsAt} > ${graceCutoff}
          )
        )`,
      ),
    )
    .limit(1)

  // ---------------------------------------------------------------------------
  // Passo 5: Se nenhum encontrado, lançar erro
  // BR-RENEWAL E-02: sem direito ativo → rejeitar
  // BR-RENEWAL E-03: direito revogado → rejeitar (já excluído pelo filtro acima)
  // ---------------------------------------------------------------------------
  if (eligibleEntitlements.length === 0) {
    // BR-RENEWAL: contato sem entitlement ativo ou dentro da graça para a oferta original
    throw new RenewalWithoutActiveEntitlement(contactId, originOfferId)
  }
}
