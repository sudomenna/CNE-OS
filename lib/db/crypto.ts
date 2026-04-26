/**
 * lib/db/crypto.ts — Credential encryption helper
 *
 * ADR-18: credenciais de integração são armazenadas encriptadas via pgcrypto
 * (pgp_sym_encrypt / pgp_sym_decrypt). A chave simétrica vem de
 * CREDENTIALS_ENCRYPTION_KEY (variável de ambiente).
 *
 * Formato persistido (CredentialEnvelope):
 *   { v: 1, encryptedAt: ISO string, ciphertext: base64 string }
 *
 * pgcrypto retorna bytea — convertemos para base64 para armazenar em jsonb.
 *
 * Zero I/O direto: encryptCredentials / decryptCredentials delegam ao DB
 * via sql`` da Drizzle, mas NÃO recebem tx (são utilitários de conversão de
 * formato, não mutações de estado no sentido ADR-11 — são chamadas no momento
 * de INSERT/UPDATE/SELECT pelo código de domínio que já tem a tx).
 */

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CredentialEnvelope = {
  v: 1
  encryptedAt: string
  ciphertext: string
}

// ---------------------------------------------------------------------------
// CryptoConfigError — lançado quando a env var está ausente
// ---------------------------------------------------------------------------

export class CryptoConfigError extends Error {
  constructor(message = 'CREDENTIALS_ENCRYPTION_KEY is not set') {
    super(message)
    this.name = 'CryptoConfigError'
  }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function getEncryptionKey(): string {
  const key = process.env['CREDENTIALS_ENCRYPTION_KEY']
  if (!key || key.trim() === '') {
    // ADR-18: chave obrigatória — sem ela não é possível encriptar/decriptar
    throw new CryptoConfigError()
  }
  return key
}

// ---------------------------------------------------------------------------
// encryptCredentials
// ---------------------------------------------------------------------------

/**
 * Encripta um objeto de credenciais via pgcrypto (pgp_sym_encrypt).
 *
 * O texto plano é serializado em JSON, encriptado pelo Postgres via
 * `pgp_sym_encrypt(plaintext, key)` que retorna bytea. O bytea é
 * convertido para base64 via `encode(..., 'base64')` antes de ser
 * retornado para armazenamento em jsonb.
 *
 * ADR-18: plaintext nunca sai desta função; o envelope retornado
 * contém apenas o ciphertext em base64.
 */
export async function encryptCredentials(
  plain: Record<string, unknown>,
): Promise<CredentialEnvelope> {
  const key = getEncryptionKey()
  const plaintext = JSON.stringify(plain)

  // pgp_sym_encrypt retorna bytea; encode(..., 'base64') converte para text
  const rows = await db.execute<{ ciphertext: string }>(
    sql`SELECT encode(pgp_sym_encrypt(${plaintext}::text, ${key}::text), 'base64') AS ciphertext`,
  )

  const row = rows[0]
  if (!row?.ciphertext) {
    throw new Error('encryptCredentials: pgp_sym_encrypt returned no result')
  }

  return {
    v: 1,
    encryptedAt: new Date().toISOString(),
    ciphertext: row.ciphertext,
  }
}

// ---------------------------------------------------------------------------
// decryptCredentials
// ---------------------------------------------------------------------------

/**
 * Decripta um CredentialEnvelope e retorna o objeto plain original.
 *
 * O ciphertext (base64) é decodificado para bytea via `decode(..., 'base64')`
 * antes de ser passado ao `pgp_sym_decrypt(ciphertext::bytea, key)`.
 *
 * ADR-18: função restrita — só deve ser chamada por adapters no momento
 * do dispatch para o provedor externo. Nunca expor o resultado em listagens.
 */
export async function decryptCredentials(
  envelope: CredentialEnvelope,
): Promise<Record<string, unknown>> {
  const key = getEncryptionKey()
  const { ciphertext } = envelope

  const rows = await db.execute<{ plaintext: string }>(
    sql`SELECT pgp_sym_decrypt(decode(${ciphertext}::text, 'base64')::bytea, ${key}::text) AS plaintext`,
  )

  const row = rows[0]
  if (!row?.plaintext) {
    throw new Error('decryptCredentials: pgp_sym_decrypt returned no result')
  }

  return JSON.parse(row.plaintext) as Record<string, unknown>
}
