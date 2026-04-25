// BR-ENTITLEMENT-CONSOLIDATION: consolidação de direitos adquiridos — nunca criar duplicata ativa

export type EntitlementStatus = 'active' | 'suspended' | 'expired' | 'revoked';
export type EntitlementKind = 'product_access' | 'benefit' | 'other';
export type RefKind = 'product' | 'benefit';

export type CustomerEntitlement = {
  id: string;
  contactId: string;
  brandId: string;
  kind: EntitlementKind;
  refKind: RefKind;
  refId: string;
  quantity: number;
  startedAt: Date;
  endsAt: Date | null; // null = perpetuous (vitalício)
  status: EntitlementStatus;
  accessRule: Record<string, unknown>;
};

export type IncomingEntitlement = {
  contactId: string;
  brandId: string;
  kind: EntitlementKind;
  refKind: RefKind;
  refId: string;
  quantity: number;
  startedAt: Date;
  endsAt: Date | null; // null = perpetuous
  accessRule: Record<string, unknown>;
};

export type ConsolidationResult =
  | { action: 'create'; next: IncomingEntitlement; reason: string }
  | { action: 'noop'; reason: string }
  | { action: 'extend_expiration'; next: CustomerEntitlement; reason: string }
  | { action: 'promote_perpetuous'; next: CustomerEntitlement; reason: string }
  | { action: 'merge_quantity'; next: CustomerEntitlement; reason: string }
  | { action: 'reactivate'; next: CustomerEntitlement; reason: string };

/**
 * Função pura — sem I/O, sem DB, determinística.
 *
 * Decide como consolidar um direito existente com um incoming.
 * A Server Action `grantFromTransaction` aplica o resultado.
 *
 * BR-ENTITLEMENT-CONSOLIDATION §tabela de decisão
 */
export function consolidate(
  existing: CustomerEntitlement | null,
  incoming: IncomingEntitlement,
): ConsolidationResult {
  // BR-ENTITLEMENT-CONSOLIDATION: sem existing → INSERT nova linha
  if (existing === null) {
    return { action: 'create', next: incoming, reason: 'initial_grant' };
  }

  // BR-ENTITLEMENT-CONSOLIDATION: revogado ou expirado → reativar com parâmetros do incoming
  if (existing.status === 'revoked' || existing.status === 'expired') {
    const next: CustomerEntitlement = {
      ...existing,
      quantity: incoming.quantity,
      startedAt: incoming.startedAt,
      endsAt: incoming.endsAt,
      status: 'active',
      accessRule: incoming.accessRule,
    };
    const reason =
      existing.status === 'revoked' ? 'reactivate_after_revoke' : 'reactivate_after_expiry';
    return { action: 'reactivate', next, reason };
  }

  // BR-ENTITLEMENT-CONSOLIDATION: suspended → trata como active para merge, mantém status='suspended'
  // (o operador que suspendeu decide reativação — OQ-BR-ENT-CON-02)
  const effectiveStatus: 'active' | 'suspended' =
    existing.status === 'suspended' ? 'suspended' : 'active';

  // Caso: existing perpetuous (ends_at=null), incoming perpetuous
  // CT-ENT-CON-02: ambos perpetuous — apenas quantity pode diferir
  if (existing.endsAt === null && incoming.endsAt === null) {
    // CT-ENT-CON-08: apenas quantidade muda — merge_quantity
    if (incoming.quantity > 0) {
      const additionalQuantity = incoming.quantity;
      const next: CustomerEntitlement = {
        ...existing,
        quantity: existing.quantity + additionalQuantity,
        status: effectiveStatus,
        accessRule: incoming.accessRule,
      };
      // BR-ENTITLEMENT-CONSOLIDATION: quantity sempre soma; quando é o único aspecto → merge_quantity
      return { action: 'merge_quantity', next, reason: 'both_perpetuous_quantity_merged' };
    }
    return { action: 'noop', reason: 'both_perpetuous' };
  }

  // Caso: existing perpetuous, incoming finito → perpetuous é mais forte
  // CT-ENT-CON-07
  if (existing.endsAt === null && incoming.endsAt !== null) {
    return { action: 'noop', reason: 'existing_already_perpetuous_stronger' };
  }

  // Caso: existing finito, incoming perpetuous → promover a perpetuous
  // CT-ENT-CON-03
  if (existing.endsAt !== null && incoming.endsAt === null) {
    const next: CustomerEntitlement = {
      ...existing,
      quantity: existing.quantity + incoming.quantity,
      endsAt: null,
      status: effectiveStatus,
      accessRule: incoming.accessRule,
    };
    // BR-ENTITLEMENT-CONSOLIDATION: promote_perpetuous incorpora merge de quantidade
    return { action: 'promote_perpetuous', next, reason: 'promote_perpetuous' };
  }

  // Caso: ambos finitos → extend_expiration
  // CT-ENT-CON-04, CT-ENT-CON-05
  // existing.endsAt !== null && incoming.endsAt !== null garantido aqui
  const existingEndsAt = existing.endsAt as Date;
  const incomingEndsAt = incoming.endsAt as Date;

  const newEndsAt = computeNewEndsAt(existingEndsAt, incoming.startedAt, incomingEndsAt);
  const next: CustomerEntitlement = {
    ...existing,
    quantity: existing.quantity + incoming.quantity,
    endsAt: newEndsAt,
    status: effectiveStatus,
    accessRule: incoming.accessRule,
  };
  // BR-ENTITLEMENT-CONSOLIDATION: extend_expiration incorpora merge de quantidade
  return { action: 'extend_expiration', next, reason: 'extend_expiration' };
}

/**
 * Política de extensão de `ends_at` (ambos finitos).
 *
 * Se há sobreposição (incoming.startedAt <= existing.endsAt):
 *   new_ends_at = max(existing.endsAt, incoming.endsAt)
 *
 * Se NÃO há sobreposição (gap):
 *   new_ends_at = existing.endsAt + duração_do_incoming
 *
 * BR-ENTITLEMENT-CONSOLIDATION §política de extensão
 */
function computeNewEndsAt(
  existingEndsAt: Date,
  incomingStartedAt: Date,
  incomingEndsAt: Date,
): Date {
  const hasOverlap = incomingStartedAt.getTime() <= existingEndsAt.getTime();

  if (hasOverlap) {
    // max(existing.endsAt, incoming.endsAt)
    return existingEndsAt.getTime() >= incomingEndsAt.getTime() ? existingEndsAt : incomingEndsAt;
  }

  // gap: estende somando o período do incoming a partir do fim do existing
  const incomingDurationMs = incomingEndsAt.getTime() - incomingStartedAt.getTime();
  return new Date(existingEndsAt.getTime() + incomingDurationMs);
}
