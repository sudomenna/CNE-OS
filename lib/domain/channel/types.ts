/**
 * MOD-CHANNEL — tipos compartilhados
 *
 * T-15-03
 */
import type { CredentialEnvelope } from '@/lib/db/crypto'

/**
 * Função de encriptação injetável — permite mock em testes unitários
 * sem depender de conexão com DB real.
 *
 * Assinatura compatível com encryptCredentials de lib/db/crypto.ts.
 */
export type EncryptFn = (
  plain: Record<string, unknown>,
) => Promise<CredentialEnvelope>

/**
 * Função de decriptação injetável — permite mock em testes unitários.
 *
 * Assinatura compatível com decryptCredentials de lib/db/crypto.ts.
 */
export type DecryptFn = (
  envelope: CredentialEnvelope,
) => Promise<Record<string, unknown>>
