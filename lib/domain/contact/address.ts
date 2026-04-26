/**
 * MOD-CONTACT — Address management
 *
 * Funções de domínio para contact_address.
 * Validação BR: CEP 8 dígitos, UF 2 letras maiúsculas (constraint enforce no DB).
 *
 * BR-IDENTITY (estendida — endereço estruturado pós migração de custom_field).
 */

import { eq, and } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { db } from '@/lib/db/client'
import { contactAddress } from '@/lib/db/schema/contact'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AddressKind = 'home' | 'billing' | 'shipping'

export type AddressInput = {
  kind?: AddressKind | undefined
  isPrimary?: boolean | undefined
  street?: string | null | undefined
  number?: string | null | undefined
  complement?: string | null | undefined
  district?: string | null | undefined
  city?: string | null | undefined
  state?: string | null | undefined
  zip?: string | null | undefined
  country?: string | undefined
}

export type AddressRow = {
  id: string
  contactId: string
  kind: AddressKind
  isPrimary: boolean
  street: string | null
  number: string | null
  complement: string | null
  district: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvalidZipError extends Error {
  code = 'INVALID_ZIP' as const
  constructor(public zip: string) {
    super(`CEP inválido (esperado 8 dígitos para BR): "${zip}"`)
  }
}

export class InvalidStateError extends Error {
  code = 'INVALID_STATE' as const
  constructor(public state: string) {
    super(`UF inválida (esperado 2 letras maiúsculas para BR): "${state}"`)
  }
}

// ---------------------------------------------------------------------------
// Helpers de normalização
// ---------------------------------------------------------------------------

/** Normaliza CEP: remove tudo que não é dígito; retorna null se vazio. */
export function normalizeZip(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  return digits === '' ? null : digits
}

/** Normaliza UF: trim + uppercase; retorna null se vazio. */
export function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().toUpperCase()
  return trimmed === '' ? null : trimmed
}

/** Trim simples; retorna null se vazio. */
function trimOrNull(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const t = raw.trim()
  return t === '' ? null : t
}

// ---------------------------------------------------------------------------
// Validações (BR — refletem check constraints do DB)
// ---------------------------------------------------------------------------

export function validateBrAddress(input: AddressInput): void {
  if ((input.country ?? 'BR') !== 'BR') return // outros países: free-form
  if (input.zip && !/^[0-9]{8}$/.test(input.zip)) {
    throw new InvalidZipError(input.zip)
  }
  if (input.state && !/^[A-Z]{2}$/.test(input.state)) {
    throw new InvalidStateError(input.state)
  }
}

// ---------------------------------------------------------------------------
// upsertPrimaryAddress — cria ou atualiza o endereço primário (kind='home' por padrão)
// Operação típica do form de edição de contato.
// ---------------------------------------------------------------------------

export async function upsertPrimaryAddress(
  tx: DbTx,
  contactId: string,
  raw: AddressInput,
): Promise<{ id: string; created: boolean }> {
  const kind: AddressKind = raw.kind ?? 'home'
  const country = raw.country ?? 'BR'

  const normalized: AddressInput = {
    kind,
    isPrimary: true,
    street: trimOrNull(raw.street ?? null),
    number: trimOrNull(raw.number ?? null),
    complement: trimOrNull(raw.complement ?? null),
    district: trimOrNull(raw.district ?? null),
    city: trimOrNull(raw.city ?? null),
    state: normalizeState(raw.state ?? null),
    zip: normalizeZip(raw.zip ?? null),
    country,
  }

  validateBrAddress(normalized)

  // Se todos os campos estão vazios, deletar o endereço existente (cleanup)
  const allEmpty =
    !normalized.street &&
    !normalized.number &&
    !normalized.complement &&
    !normalized.district &&
    !normalized.city &&
    !normalized.state &&
    !normalized.zip

  // Existe?
  const [existing] = await tx
    .select({ id: contactAddress.id })
    .from(contactAddress)
    .where(
      and(
        eq(contactAddress.contactId, contactId),
        eq(contactAddress.kind, kind),
        eq(contactAddress.isPrimary, true),
      ),
    )
    .limit(1)

  if (existing && allEmpty) {
    await tx.delete(contactAddress).where(eq(contactAddress.id, existing.id))
    return { id: existing.id, created: false }
  }

  if (!existing && allEmpty) {
    // Nada para criar
    return { id: '', created: false }
  }

  if (existing) {
    await tx
      .update(contactAddress)
      .set({
        street: normalized.street ?? null,
        number: normalized.number ?? null,
        complement: normalized.complement ?? null,
        district: normalized.district ?? null,
        city: normalized.city ?? null,
        state: normalized.state ?? null,
        zip: normalized.zip ?? null,
        country,
        updatedAt: new Date(),
      })
      .where(eq(contactAddress.id, existing.id))
    return { id: existing.id, created: false }
  }

  const [inserted] = await tx
    .insert(contactAddress)
    .values({
      contactId,
      kind,
      isPrimary: true,
      street: normalized.street ?? null,
      number: normalized.number ?? null,
      complement: normalized.complement ?? null,
      district: normalized.district ?? null,
      city: normalized.city ?? null,
      state: normalized.state ?? null,
      zip: normalized.zip ?? null,
      country,
    })
    .returning({ id: contactAddress.id })

  return { id: inserted!.id, created: true }
}

// ---------------------------------------------------------------------------
// listAddresses — leitura pura (sem tx, conforme ADR-11)
// ---------------------------------------------------------------------------

export async function listAddresses(contactId: string): Promise<AddressRow[]> {
  const rows = await db
    .select()
    .from(contactAddress)
    .where(eq(contactAddress.contactId, contactId))

  return rows.map((r) => ({
    id: r.id,
    contactId: r.contactId,
    kind: r.kind as AddressKind,
    isPrimary: r.isPrimary,
    street: r.street,
    number: r.number,
    complement: r.complement,
    district: r.district,
    city: r.city,
    state: r.state,
    zip: r.zip,
    country: r.country,
  }))
}

/** Retorna o primary do kind solicitado (default 'home'). */
export async function getPrimaryAddress(
  contactId: string,
  kind: AddressKind = 'home',
): Promise<AddressRow | null> {
  const [row] = await db
    .select()
    .from(contactAddress)
    .where(
      and(
        eq(contactAddress.contactId, contactId),
        eq(contactAddress.kind, kind),
        eq(contactAddress.isPrimary, true),
      ),
    )
    .limit(1)

  if (!row) return null
  return {
    id: row.id,
    contactId: row.contactId,
    kind: row.kind as AddressKind,
    isPrimary: row.isPrimary,
    street: row.street,
    number: row.number,
    complement: row.complement,
    district: row.district,
    city: row.city,
    state: row.state,
    zip: row.zip,
    country: row.country,
  }
}
