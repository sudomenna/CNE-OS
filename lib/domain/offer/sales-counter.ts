/**
 * MOD-OFFER — incrementSalesCounter
 *
 * docs/20-domain/10-offer-engine.md §3.7 (concurrency)
 * ADR-07: aceitar excesso (race condition → N+1 aprovações possíveis)
 * ADR-10: lança erros tipados, nunca retorna Result<T,E>
 * ADR-11: tx obrigatório como primeiro argumento (função muta estado)
 */
import { eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { offerSalesCounter } from '@/lib/db/schema/offer'
import { OfferCounterNotFoundError } from './errors'

// ---------------------------------------------------------------------------
// incrementSalesCounter
// ---------------------------------------------------------------------------

/**
 * Incrementa atomicamente o contador de vendas aprovadas para uma oferta.
 *
 * Executa UPDATE ... RETURNING — nunca SELECT + UPDATE separados.
 * Postgres serializa o UPDATE na mesma linha, garantindo atomicidade.
 *
 * ADR-07: não verifica limite — a responsabilidade de checar `sales_count_reached`
 * pertence a `evaluateEligibility`. Com race conditions, o contador pode ultrapassar
 * o limite configurado; comportamento documentado e aceito em ADR-07.
 *
 * @param tx  Transação DB ativa (ADR-11 — deve ser a mesma tx que aprova a venda)
 * @param offerId  UUID da oferta cujo counter deve ser incrementado
 * @returns   Novo valor de approved_count após o incremento
 * @throws    OfferCounterNotFoundError se a linha não existe (oferta sem seed)
 */
export async function incrementSalesCounter(
  tx: DbTx,
  offerId: string,
): Promise<number> {
  // ADR-07: UPDATE ... RETURNING — atômico, sem SELECT prévio, aceita excesso em race.
  // docs/20-domain/10-offer-engine.md §3.7:
  //   UPDATE offer_sales_counter
  //   SET approved_count = approved_count + 1, updated_at = now()
  //   WHERE offer_id = $1
  //   RETURNING approved_count;
  const rows = await tx
    .update(offerSalesCounter)
    .set({
      approvedCount: sql`${offerSalesCounter.approvedCount} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(offerSalesCounter.offerId, offerId))
    .returning({ approvedCount: offerSalesCounter.approvedCount })

  const row = rows[0]

  // Linha não encontrada = oferta criada sem o seed trigger ou offerId inválido.
  if (!row) {
    throw new OfferCounterNotFoundError(offerId)
  }

  return row.approvedCount
}
