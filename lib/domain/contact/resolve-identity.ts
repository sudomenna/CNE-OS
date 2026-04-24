/**
 * resolveContactIdentity — resolução de identidade de contato (BR-IDENTITY)
 *
 * Função pura de domínio: não persiste nada. Retorna IdentityResolution
 * descrevendo a ação a tomar (create | update | noop) e as pendências abertas.
 * A persistência é responsabilidade de quem chama (Server Action / Inngest).
 *
 * docs/50-business-rules/BR-IDENTITY.md
 * docs/20-domain/02-contact-identity.md
 */

import { db } from '@/lib/db/client'
import type { DbTx } from '@/lib/db/client'
import { contact, contactPhone, contactEmail } from '@/lib/db/schema/contact'
import type { Contact } from '@/lib/db/schema/contact'
import { eq, and, isNull, notInArray } from 'drizzle-orm'
import { normalizeCpf, normalizePhone, normalizeEmail } from './normalize'

// ---------------------------------------------------------------------------
// Tipos públicos (espelham BR-IDENTITY §Contrato TS)
// ---------------------------------------------------------------------------

export type IdentityInput = {
  fullName?: string
  cpf?: string | null
  phoneE164?: string | null
  email?: string | null
  origin: 'checkout' | 'message' | 'import' | 'manual' | 'integration'
  sourceRef?: string
}

export type IdentityResolution =
  | { action: 'create'; contactId: string; issues: ContactIssueDraft[] }
  | { action: 'update'; contactId: string; applied: AppliedChange[]; issues: ContactIssueDraft[] }
  | { action: 'noop'; contactId: string; issues: ContactIssueDraft[] }

export type ContactIssueDraft = {
  kind: 'email_duplicate' | 'phone_conflict' | 'document_mismatch' | 'source_divergence' | 'other'
  detail: string
  payload: Record<string, unknown>
  relatedContactId?: string
}

export type AppliedChange =
  | { field: 'add_alternative_email'; value: string }
  | { field: 'promote_new_primary_phone'; newPhoneId: string; archivedPhoneId: string }
  | { field: 'set_cpf'; value: string }
  | { field: 'update_full_name'; from: string; to: string }

// ---------------------------------------------------------------------------
// Tipo interno de resultado dos lookups
// ---------------------------------------------------------------------------

type LookupResult = Contact | null

// ---------------------------------------------------------------------------
// Helpers de lookup internos — cada um faz UMA query com join
// ---------------------------------------------------------------------------

type DbClient = typeof db | DbTx

function getClient(tx?: DbTx): DbClient {
  return tx ?? db
}

/**
 * Lookup por CPF — uma query direta em contact.
 */
async function findByCpf(cpf: string, tx?: DbTx): Promise<LookupResult> {
  const client = getClient(tx)
  const rows = await client
    .select()
    .from(contact)
    .where(
      and(
        eq(contact.cpf, cpf),
        isNull(contact.deletedAt),
        isNull(contact.mergedIntoId),
      ),
    )
    .limit(1)
  return (rows[0] as Contact | undefined) ?? null
}

/**
 * Lookup por phone — join contact_phone + contact em uma única query.
 * Retorna o contato dono do telefone válido, ou null.
 */
async function findByPhone(e164: string, tx?: DbTx): Promise<LookupResult> {
  const client = getClient(tx)
  const rows = await client
    .select({
      id: contact.id,
      fullName: contact.fullName,
      cpf: contact.cpf,
      status: contact.status,
      classification: contact.classification,
      birthDate: contact.birthDate,
      origin: contact.origin,
      mergedIntoId: contact.mergedIntoId,
      notesSummary: contact.notesSummary,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
      deletedAt: contact.deletedAt,
    })
    .from(contactPhone)
    .innerJoin(contact, eq(contactPhone.contactId, contact.id))
    .where(
      and(
        eq(contactPhone.e164, e164),
        notInArray(contactPhone.status, ['invalid']),
        isNull(contact.deletedAt),
        isNull(contact.mergedIntoId),
      ),
    )
    .limit(1)
  return (rows[0] as Contact | undefined) ?? null
}

/**
 * Lookup por email — join contact_email + contact em uma única query.
 * Retorna o contato dono do e-mail ativo, ou null.
 */
async function findByEmail(email: string, tx?: DbTx): Promise<LookupResult> {
  const client = getClient(tx)
  const rows = await client
    .select({
      id: contact.id,
      fullName: contact.fullName,
      cpf: contact.cpf,
      status: contact.status,
      classification: contact.classification,
      birthDate: contact.birthDate,
      origin: contact.origin,
      mergedIntoId: contact.mergedIntoId,
      notesSummary: contact.notesSummary,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
      deletedAt: contact.deletedAt,
    })
    .from(contactEmail)
    .innerJoin(contact, eq(contactEmail.contactId, contact.id))
    .where(
      and(
        eq(contactEmail.email, email),
        notInArray(contactEmail.status, ['invalid', 'unsubscribed']),
        isNull(contact.deletedAt),
        isNull(contact.mergedIntoId),
      ),
    )
    .limit(1)
  return (rows[0] as Contact | undefined) ?? null
}

// ---------------------------------------------------------------------------
// Constante sentinela para "contactId novo" (preenchido pelo chamador)
// ---------------------------------------------------------------------------

const NEW_CONTACT_ID = 'NEW'

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

/**
 * Resolve qual ação tomar para um input de identidade de contato.
 *
 * BR-IDENTITY: CPF é chave absoluta. Sem CPF, telefone prevalece sobre e-mail.
 * A função NÃO persiste nada — apenas retorna a resolução para o chamador executar.
 *
 * ADR-11: tx é opcional porque esta função faz apenas leitura. Quem persiste
 * recebe a resolução e executa os changes dentro de sua própria transação.
 */
export async function resolveContactIdentity(
  input: IdentityInput,
  tx?: DbTx,
): Promise<IdentityResolution> {
  // ── 1. Normalizar entradas ─────────────────────────────────────────────
  // Lança InvalidCpfError / InvalidPhoneError / InvalidEmailError se inválido
  const normalizedCpf = input.cpf ? normalizeCpf(input.cpf) : null
  const normalizedPhone = input.phoneE164 ? normalizePhone(input.phoneE164) : null
  const normalizedEmail = input.email ? normalizeEmail(input.email) : null

  // ── 2. Executa os lookups sequencialmente ─────────────────────────────
  // Sequencial garante ordem determinística para idempotência e auditabilidade.
  // A hierarquia BR-IDENTITY (CPF > phone > email) é reforçada na decisão abaixo.
  const byCpf = normalizedCpf ? await findByCpf(normalizedCpf, tx) : null
  const byPhone = normalizedPhone ? await findByPhone(normalizedPhone, tx) : null
  const byEmail = normalizedEmail ? await findByEmail(normalizedEmail, tx) : null

  // ── 3. Aplicar tabela de decisão (BR-IDENTITY) ─────────────────────────

  // ── Ramo com CPF ─────────────────────────────────────────────────────────

  if (normalizedCpf !== null) {
    if (byCpf === null) {
      // BR-IDENTITY caso #1: CPF novo (sem match) → create
      return {
        action: 'create',
        contactId: NEW_CONTACT_ID,
        issues: [],
      }
    }

    const c1 = byCpf
    const phoneMatchesC1 = byPhone !== null && byPhone.id === c1.id
    const emailMatchesC1 = byEmail !== null && byEmail.id === c1.id

    if (phoneMatchesC1 && emailMatchesC1) {
      // BR-IDENTITY caso #2: CPF + telefone + e-mail, todos em C1 → noop
      return {
        action: 'noop',
        contactId: c1.id,
        issues: [],
      }
    }

    if (phoneMatchesC1 && !emailMatchesC1) {
      // BR-IDENTITY caso #3: CPF + telefone em C1; e-mail diferente
      // → update: adiciona e-mail como 'alternative'
      const issues: ContactIssueDraft[] = []

      if (normalizedEmail !== null) {
        if (byEmail !== null && byEmail.id !== c1.id) {
          // E-mail pertence a outro contato C2 → email_duplicate
          issues.push({
            kind: 'email_duplicate',
            detail: `E-mail ${normalizedEmail} já cadastrado no contato ${byEmail.id}`,
            payload: { email: normalizedEmail, existingContactId: byEmail.id },
            relatedContactId: byEmail.id,
          })
        } else {
          // E-mail não existe em nenhum contato → source_divergence
          issues.push({
            kind: 'source_divergence',
            detail: `E-mail ${normalizedEmail} não consta no contato ${c1.id}; adicionado como alternativo`,
            payload: { email: normalizedEmail },
          })
        }
      }

      return {
        action: 'update',
        contactId: c1.id,
        applied: normalizedEmail
          ? [{ field: 'add_alternative_email', value: normalizedEmail }]
          : [],
        issues,
      }
    }

    if (!phoneMatchesC1 && emailMatchesC1) {
      // BR-IDENTITY caso #4: CPF + e-mail em C1; telefone diferente
      // → update: phone_conflict + promoção de telefone
      const applied: AppliedChange[] = []
      if (normalizedPhone !== null) {
        // BR-IDENTITY: origin='checkout' → promoção automática; outros → secondary
        // Os IDs reais (NEW_PHONE, OLD_PHONE) são sentinelas; o chamador completa.
        applied.push({
          field: 'promote_new_primary_phone',
          newPhoneId: 'NEW_PHONE',
          archivedPhoneId: 'OLD_PHONE',
        })
      }

      return {
        action: 'update',
        contactId: c1.id,
        applied,
        issues: [
          {
            kind: 'phone_conflict',
            detail: `Telefone ${normalizedPhone} diverge do cadastrado no contato ${c1.id}`,
            payload: {
              newPhone: normalizedPhone,
              contactId: c1.id,
              origin: input.origin,
            },
          },
        ],
      }
    }

    // !phoneMatchesC1 && !emailMatchesC1
    // BR-IDENTITY caso #5: CPF em C1 mas telefone e e-mail divergem → document_mismatch
    const applied: AppliedChange[] = []
    if (normalizedPhone !== null) {
      applied.push({
        field: 'promote_new_primary_phone',
        newPhoneId: 'NEW_PHONE',
        archivedPhoneId: 'OLD_PHONE',
      })
    }
    if (normalizedEmail !== null) {
      applied.push({ field: 'add_alternative_email', value: normalizedEmail })
    }

    return {
      action: 'update',
      contactId: c1.id,
      applied,
      issues: [
        {
          kind: 'document_mismatch',
          detail: `CPF ${normalizedCpf} pertence ao contato ${c1.id} mas telefone e e-mail divergem`,
          payload: {
            cpf: normalizedCpf,
            newPhone: normalizedPhone,
            newEmail: normalizedEmail,
            contactId: c1.id,
          },
        },
      ],
    }
  }

  // ── Ramo sem CPF ─────────────────────────────────────────────────────────

  if (byPhone !== null) {
    const c1 = byPhone
    const emailMatchesC1 = byEmail !== null && byEmail.id === c1.id

    if (emailMatchesC1) {
      // BR-IDENTITY caso #6: telefone + e-mail batem em C1 → noop
      return {
        action: 'noop',
        contactId: c1.id,
        issues: [],
      }
    }

    // BR-IDENTITY caso #7: telefone bate em C1; e-mail diferente ou ausente
    // → update: adiciona e-mail como 'alternative'
    const issues: ContactIssueDraft[] = []
    const applied: AppliedChange[] = []

    if (normalizedEmail !== null) {
      if (byEmail !== null && byEmail.id !== c1.id) {
        // E-mail pertence a outro contato → email_duplicate
        issues.push({
          kind: 'email_duplicate',
          detail: `E-mail ${normalizedEmail} já cadastrado no contato ${byEmail.id}`,
          payload: { email: normalizedEmail, existingContactId: byEmail.id },
          relatedContactId: byEmail.id,
        })
      }
      applied.push({ field: 'add_alternative_email', value: normalizedEmail })
    }

    return {
      action: 'update',
      contactId: c1.id,
      applied,
      issues,
    }
  }

  if (byEmail !== null) {
    // BR-IDENTITY caso #8: sem CPF, sem telefone match, e-mail bate em C1
    // → criar NOVO contato; email_duplicate apontando para C1
    const c1 = byEmail
    return {
      action: 'create',
      contactId: NEW_CONTACT_ID,
      issues: [
        {
          kind: 'email_duplicate',
          detail: `E-mail ${normalizedEmail} já pertence ao contato ${c1.id}; novo contato criado`,
          payload: { email: normalizedEmail, existingContactId: c1.id },
          relatedContactId: c1.id,
        },
      ],
    }
  }

  // BR-IDENTITY caso #9: nada bate → create
  return {
    action: 'create',
    contactId: NEW_CONTACT_ID,
    issues: [],
  }
}
