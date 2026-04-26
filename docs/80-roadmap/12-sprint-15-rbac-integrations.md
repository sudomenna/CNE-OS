# Sprint 15 — RBAC management + Integration config (iniciado 2026-04-26)

## Objetivo

Cobrir os dois gaps críticos de UI identificados pós-Sprint 14:

1. **Permission Management** — matriz `role × permission` editável via UI (hoje só via seed SQL).
2. **Integration / Channel config** — configurar credenciais de provedores (WhatsApp, Instagram, Digital Guru, Notazz, Brevo) via UI, com tokens encriptados no banco em vez de env vars.

## Entregáveis (outcomes)

- Card "Permissões" visível em `/settings` + página `/settings/permissions` com matriz editável.
- Página `/settings/integrations` refatorada de read-only para hub clicável; cada provider abre `/settings/integrations/[provider]` com form de config + lista de `channel_account` ativas.
- `channel_account.credentials` armazenado encriptado (Supabase Vault ou pgcrypto, definido em ADR-18).
- Operador pode trocar token WhatsApp em produção sem redeploy.

## Pré-requisitos

- Sprint 14 verde (1200 testes Vitest, typecheck limpo). ✅ concluído em 2026-04-26.
- ADR-18 aprovado e mergeado antes de iniciar Onda B.

## Status atual

> Última atualização: 2026-04-26 — Sprint 15 iniciado.

| T-ID | Título curto | Onda | Status |
|---|---|---|---|
| T-15-00 | ADR-18: estratégia de encriptação de credenciais | Pré-onda (serial) | ✅ completed |
| T-15-01 | Domínio `lib/domain/rbac/` + testes | A | ✅ completed |
| T-15-02 | UI `/settings/permissions` (matriz editável) | A | ✅ completed |
| T-15-03 | `lib/db/crypto.ts` + domínio `lib/domain/channel/` | B | ✅ completed |
| T-15-04 | Migration `channel_account.credentials` encriptado | B | ✅ completed |
| T-15-05 | UI `/settings/integrations` refator hub + páginas por provider | B | ✅ completed |
| T-15-06 | Doc-sync (contracts + MEMORY.md) | C | ✅ completed |
| T-15-07 | Testes E2E (permissions + integrations) | C | ✅ completed |

**Baseline ao iniciar Sprint 15:** 1200 testes Vitest ✅ | typecheck ✅
**Sprint 15 CONCLUÍDO (2026-04-26):** 1268 testes Vitest ✅ | typecheck ✅ | 7/7 T-IDs (+ ADR-18) | migration `20260427000001` aplicada

---

## Tarefas

| ID | Título | Módulo | Tipo | Subagent | Parallel-safe | Depends-on | Arquivos editados (Ownership) | Critério de aceite |
|---|---|---|---|---|---|---|---|---|
| T-15-00 | ADR-18: encriptação de credenciais | MOD-CHANNEL | adr | (humano + claude) | no | — | `docs/90-meta/04-decision-log.md` | ADR-18 mergeado definindo método (Supabase Vault ou pgcrypto), formato jsonb `{ encryptedAt, version, ciphertext }` e fluxo de rotação de chave |
| T-15-01 | Domínio RBAC: grant/revoke/list-role-matrix | MOD-RBAC | domain | cne-domain-author | yes | — | `lib/domain/rbac/grant-permission.ts`, `revoke-permission.ts`, `list-role-matrix.ts`, `index.ts`, `*.test.ts` | Cada grant/revoke gera `audit_log`; erros DomainError tipados (`PermissionNotFound`, `RoleNotFound`, `CannotModifyAdminRole`); coverage ≥ 85% |
| T-15-02 | UI /settings/permissions | MOD-RBAC | ui | cne-ui-author | yes | T-15-01 | `app/(app)/settings/permissions/page.tsx`, `actions.ts`, `_components/role-matrix.tsx`; `app/(app)/settings/page.tsx` (adicionar card) | Matriz com checkboxes funcional; toggle persiste via server action; admin role read-only; revalidação de path após mutação |
| T-15-03 | Crypto helper + domínio Channel | MOD-CHANNEL | domain | cne-domain-author | yes | T-15-00 | `lib/db/crypto.ts`, `lib/domain/channel/create-channel-account.ts`, `update-channel-account.ts`, `list-channels-by-brand.ts`, `index.ts`, `*.test.ts` | `credentials` sempre encriptado antes de persistir; queries de listagem retornam apenas metadados (sem plaintext); decrypt restrito a callers autorizados |
| T-15-04 | Migration channel_account encriptado | MOD-CHANNEL | schema | cne-schema-author | no | T-15-03 | `supabase/migrations/20260427000001_channel_account_encrypted_credentials.sql`, `lib/db/schema/conversation.ts` (campo `credentials`) | Migration aplicada em Supabase; backfill de registros existentes; Drizzle snapshot atualizado; typecheck verde |
| T-15-05 | UI /settings/integrations refator + páginas por provider | MOD-CHANNEL | ui | cne-ui-author | yes | T-15-03, T-15-04 | `app/(app)/settings/integrations/page.tsx` (refator), `app/(app)/settings/integrations/[provider]/page.tsx` (novo), `actions.ts`, `_components/*` | Cada card vira link clicável; página por provider com form write-only para credenciais (nunca exibe valor atual), lista de `channel_account` ativas, botão "Test connection" |
| T-15-06 | Doc-sync | DOCS | docs | cne-docs-sync | no | T-15-01..05 | `docs/30-contracts/05-api-server-actions.md`, `07-module-interfaces.md`, MEMORY.md | Novas actions documentadas; interfaces MOD-RBAC e MOD-CHANNEL adicionadas; entradas SYNC-PENDING resolvidas |
| T-15-07 | Testes E2E | DOCS | test | cne-test-author | yes | T-15-02, T-15-05 | `e2e/settings-permissions.spec.ts`, `e2e/settings-integrations.spec.ts` | E2E configura WhatsApp via UI sem env var e verifica que webhook entrante encontra `channel_account`; E2E altera matriz e verifica RLS efetiva |

---

## Ondas de paralelização

### Pré-onda — ADR (serial) ⬜ próxima
`T-15-00`
→ Bloqueia toda a Onda B. Onda A pode rodar em paralelo a esta pré-onda (não depende de encriptação).

### Onda A — RBAC (paralelo, 2 subagents) ⬜
`T-15-01`, `T-15-02`
→ T-15-02 depende de T-15-01 (interface pública do domínio); rodam serial entre si mas paralelo a Onda B.

> Observação: na prática, T-15-01 sai primeiro, T-15-02 logo depois usando a interface estável.

### Onda B — Channel/Integration config (paralelo, 3 subagents) ⬜
`T-15-03`, `T-15-04`, `T-15-05`
→ Depende de T-15-00 (ADR). T-15-04 depende de T-15-03 (formato do jsonb encriptado). T-15-05 depende de T-15-03 e T-15-04.

> Sequência efetiva: T-15-03 → T-15-04 → T-15-05.

### Onda C — Doc-sync + testes (paralelo, 2 subagents) ⬜
`T-15-06`, `T-15-07`
→ Serial após A+B verdes.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Encriptação quebra integrações em produção | Backfill obrigatório na migration + adapters lêem ambos formatos durante transição (feature flag temporário) |
| Mudança em `channel_account` afeta inbox em produção | Sprint 13 já ativou RLS — `cne-br-auditor` antes de merge |
| ADR demora a alinhar | T-15-00 é P0; resolver em < 1 dia |
| Brevo não tem adapter mas tem placeholder | Card mostra "em breve"; sem form ativo |
