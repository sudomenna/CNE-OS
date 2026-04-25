/**
 * MOD-CATALOG — Normalização e validação de slug
 *
 * docs/20-domain/09-catalog.md §3.1 (INV-CATALOG-03), §3.3 (INV-CATALOG-06)
 * Funções puras — sem I/O, sem DB.
 */

import { InvalidSlugError } from './errors'

/**
 * Converte qualquer string para slug kebab-case:
 * 1. Converte para lowercase.
 * 2. Substitui espaços e underscores por hífens.
 * 3. Remove caracteres não-alfanuméricos (exceto hífens).
 * 4. Colapsa hífens consecutivos em único hífen.
 * 5. Remove hífens no início e no fim.
 */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    // Substitui espaços e underscores por hífen
    .replace(/[\s_]+/g, '-')
    // Remove qualquer char não-alfanumérico que não seja hífen
    .replace(/[^a-z0-9-]/g, '')
    // Colapsa múltiplos hífens consecutivos
    .replace(/-{2,}/g, '-')
    // Remove hífens de borda
    .replace(/^-+|-+$/g, '')
}

/**
 * Valida se um slug já normalizado bate com o padrão aceito pelo CHECK do banco:
 * `^[a-z0-9][a-z0-9-]*$`
 * (mínimo 1 caractere, começa com letra ou dígito, sem hífen no início)
 */
export function validateSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug)
}

/**
 * Normaliza e valida o slug. Lança InvalidSlugError se o resultado não for válido.
 * INV-CATALOG-03: product.slug kebab-case enforçado em domínio (além do CHECK no DB).
 * INV-CATALOG-06: auto_tag usa a mesma convenção de kebab-case.
 */
export function ensureValidSlug(input: string): string {
  const normalized = normalizeSlug(input)
  if (!validateSlug(normalized)) {
    throw new InvalidSlugError(input)
  }
  return normalized
}
