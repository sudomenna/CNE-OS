#!/usr/bin/env bash
#
# verify-wave.sh
# Verificação integral após uma onda de subagents.
# Deve rodar VERDE antes de abrir a próxima onda.
#
# Uso:
#   bash scripts/verify-wave.sh         # completo
#   bash scripts/verify-wave.sh --fast  # pula build + e2e (dev loop)
#
# Convenção: qualquer falha aborta imediatamente (set -e).
# Exit code 0 = pode abrir próxima onda.

set -euo pipefail

FAST=0
if [[ "${1:-}" == "--fast" ]]; then
  FAST=1
fi

cd "$(dirname "$0")/.."

echo "==> [1/5] Typecheck (tsc --noEmit)"
pnpm typecheck

echo "==> [2/5] Lint (eslint)"
pnpm lint

echo "==> [3/5] Testes unit + integration (vitest)"
pnpm test

if [[ $FAST -eq 1 ]]; then
  echo ""
  echo "✅ Fast check verde. (build + e2e pulados — use sem --fast antes de merge)"
  exit 0
fi

echo "==> [4/5] Build Next.js (sanity)"
pnpm build

echo "==> [5/5] E2E Playwright"
pnpm test:e2e

echo ""
echo "✅ Onda verde. Seguro abrir próxima onda de subagents."
