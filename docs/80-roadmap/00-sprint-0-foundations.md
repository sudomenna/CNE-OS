# Sprint 0 — Foundations  (duração: 2 semanas)

## Objetivo

Preparar o repositório para que todos os demais sprints rodem em paralelo com segurança. Entrega o bootstrap do Next.js, a configuração do Supabase (Auth + Drizzle + RLS Fase 1), Inngest, observabilidade, CI e o núcleo organizacional (MOD-ORG): marcas, CNPJs, usuários, papéis. Também materializa as tabelas transversais append-only (`audit_log`, `timeline_event`, `webhook_log`) e os helpers `emitTimelineEvent`, `requireSession`, `requirePermission` que todos os módulos consumirão.

## Entregáveis (outcomes)

- Monorepo Next.js 15 + TS + Tailwind + shadcn rodando localmente e em Vercel preview.
- Supabase projeto provisionado com Auth (email+senha, magic link, TOTP) e Drizzle apontado para o Postgres.
- Schemas `brand`, `legal_entity`, `brand_legal_entity`, `user_account`, `role`, `user_role`, `permission`, `role_permission` aplicados e testados.
- Tabelas transversais `audit_log`, `timeline_event`, `webhook_log` com triggers append-only.
- Helpers `requireSession`, `requirePermission`, `emitTimelineEvent` disponíveis para os demais sprints.
- Shell do app (sidebar, topbar, command palette) renderizando e autenticando.
- CI (typecheck + lint + test) verde em todo push.
- Sentry + Axiom + Vercel Analytics instrumentados.
- Admin consegue criar marca, CNPJ, convidar usuário e atribuir papéis.

## Pré-requisitos (sprints anteriores concluídos)

- Nenhum. É o sprint inaugural.

## Tarefas

| ID | Título | Módulo | Tipo | Parallel-safe | Depends-on | Specs referenciadas | Arquivos editados (Ownership) | Critério de aceite |
|---|---|---|---|---|---|---|---|---|
| T-0-01 | Bootstrap Next.js 15 + TS + Tailwind + shadcn base | infra | config | yes | — | AGENTS.md §2, §3; CLAUDE.md §1 | `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/globals.css`, `components.json` | `pnpm dev` sobe em localhost:3000; typecheck limpo; shadcn CLI instala componente `button` sem erro |
| T-0-02 | Supabase projeto + Auth + Drizzle config | infra | config | yes | — | AGENTS.md §2; `10-architecture/02-stack.md` | `lib/db/client.ts`, `lib/auth/supabase.ts`, `drizzle.config.ts`, `.env.example` | Conecta no DB via Drizzle; `supabase.auth.signInWithPassword` funciona em teste manual; `.env.example` documenta todas variáveis |
| T-0-03 | Inngest setup + handler base | infra | config | yes | — | AGENTS.md §2; `20-domain/15-automation.md` §9 | `inngest/client.ts`, `inngest/functions/index.ts`, `app/api/inngest/route.ts` | Endpoint `/api/inngest` responde 200; função `hello-world` dispara e aparece no dashboard local |
| T-0-04 | Sentry + Axiom + Vercel Analytics | infra | config | yes | — | `10-architecture/*` (NFR observabilidade) | `sentry.client.config.ts`, `sentry.server.config.ts`, `instrumentation.ts`, `lib/logger.ts` | Erro lançado em Server Action aparece no Sentry; log estruturado chega ao Axiom |
| T-0-05 | Schema `brand`, `legal_entity`, `brand_legal_entity` | MOD-ORG | schema | no | T-0-02 | `20-domain/01-organization.md` §3.1-§3.3; `30-contracts/02-db-schema-conventions.md` | `lib/db/schema/organization.ts` (parcial — tabelas de marca/entidade), `lib/db/schema/index.ts` (export) | `pnpm drizzle-kit generate` produz migration aplicável; CHECK `ck_legal_entity_cnpj_length` barra CNPJ inválido; índice `uq_brand_legal_entity_default` bloqueia 2º default |
| T-0-06 | Schema `user_account`, `role`, `user_role` + seed `role_kind` | MOD-ORG | schema | no | T-0-02, T-0-05 | `20-domain/01-organization.md` §3.4-§3.6; `30-contracts/01-enums.md` (`role_kind`) | `lib/db/schema/organization.ts` (complemento), `lib/db/schema/index.ts`, `lib/db/seed/roles.ts` | Tabelas aplicadas; seed popula todas as `role_kind`; teste `user_role.assign.happy` passa |
| T-0-07 | Schema `permission` + `role_permission` + matriz Fase 1 | MOD-ORG | schema | yes | T-0-06 | `50-business-rules/BR-RBAC.md`; `00-product/03-personas-rbac-matrix.md` | `lib/db/schema/rbac.ts`, `lib/db/seed/permissions.ts` | Seed popula permissões por `role_kind`; teste `rbac.matrix.seed` valida ≥1 permissão por papel |
| T-0-08 | Supabase RLS policies Fase 1 (marca + papel) | infra | config | no | T-0-06, T-0-07 | `10-architecture/*` (RLS); `50-business-rules/BR-RBAC.md` | `supabase/migrations/0001_rls.sql`, `lib/db/rls-helpers.ts` | Policies barram usuário sem papel compatível em `SELECT contact`; teste integração com JWT mockado verde |
| T-0-09 | Helpers `requireSession`, `requirePermission`, `getCurrentUser` | infra | domain | yes | T-0-06, T-0-07 | AGENTS.md §3.3; `50-business-rules/BR-RBAC.md` | `lib/auth/session.ts`, `lib/auth/permissions.ts`, `tests/unit/auth/session.test.ts` | `requirePermission('contact.read')` lança 403 quando ausente; 3 testes Given/When/Then verdes |
| T-0-10 | Schema `audit_log` + trigger append-only | contratos | schema | yes | T-0-02 | `50-business-rules/BR-AUDIT.md`; `30-contracts/02-db-schema-conventions.md` §8 | `lib/db/schema/audit.ts`, `supabase/migrations/0002_audit_triggers.sql` | UPDATE/DELETE em `audit_log` é recusado pelo trigger; teste `audit.append-only` verde |
| T-0-11 | Schema `timeline_event` + trigger append-only | MOD-TIMELINE | schema | yes | T-0-02, T-0-05 | `20-domain/04-timeline.md` §3; `30-contracts/03-timeline-event-catalog.md` | `lib/db/schema/timeline.ts`, `supabase/migrations/0003_timeline_triggers.sql` | Trigger bloqueia UPDATE e DELETE; índices `idx_timeline_contact_time`, `idx_timeline_payload_gin` criados |
| T-0-12 | Schema `webhook_log` + UNIQUE idempotency | contratos | schema | yes | T-0-02 | `50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md` | `lib/db/schema/webhook-log.ts` | `uq_webhook_log_external_event_id` barra duplicado; teste `webhook_log.insert.idempotent` verde |
| T-0-13 | Helper `emitTimelineEvent` (com zod por kind) | MOD-TIMELINE | domain | no | T-0-11 | `20-domain/04-timeline.md` §3.3; `50-business-rules/BR-TIMELINE.md` | `lib/timeline/emit.ts`, `lib/timeline/schemas/index.ts`, `tests/unit/timeline/emit.test.ts` | `emitTimelineEvent` rejeita payload fora do schema zod; teste `timeline.insert.requires-actor` verde |
| T-0-14 | Shell do app: sidebar + topbar + command palette | infra | ui | yes | T-0-01, T-0-09 | `70-ux/*` (se existir); shadcn `sidebar`, `command` | `app/(app)/layout.tsx`, `components/layout/sidebar.tsx`, `components/layout/topbar.tsx`, `components/layout/command-palette.tsx` | Layout renderiza; command palette abre com `Cmd+K`; usuário anônimo é redirecionado para `/login` |
| T-0-15 | UI Auth: login, magic link, recuperação | infra | ui | yes | T-0-02, T-0-09 | `10-architecture` auth | `app/(auth)/login/page.tsx`, `app/(auth)/forgot/page.tsx`, `app/(auth)/callback/route.ts` | Login E2E autentica usuário admin seed; logout invalida sessão |
| T-0-16 | UI Settings: marcas, CNPJs, usuários | MOD-ORG | ui | yes | T-0-05, T-0-06, T-0-09 | `20-domain/01-organization.md` §2 Ownership | `app/(app)/settings/brands/**`, `app/(app)/settings/legal-entities/**`, `app/(app)/settings/users/**`, `app/(app)/settings/*/actions.ts` | Admin cria marca + CNPJ + convida usuário via UI; teste E2E Playwright `settings.admin.happy` verde |
| T-0-17 | CI GitHub Actions: typecheck + lint + test | infra | config | yes | T-0-01 | CLAUDE.md §4 | `.github/workflows/ci.yml`, `.github/workflows/preview.yml` | PR dispara 3 jobs; falhas bloqueiam merge |
| T-0-18 | Test fixtures + factories base | infra | test | yes | T-0-05, T-0-06 | `10-architecture/10-testing-strategy.md` | `tests/fixtures/factories.ts`, `tests/fixtures/db-clean.ts`, `vitest.config.ts`, `playwright.config.ts` | `makeBrand()`, `makeUser()`, `makeContact()` retornam entidades válidas; `resetDb()` limpa entre testes |

## Ondas de paralelização sugeridas

**Onda A (paralelo, 5 subagents):** T-0-01, T-0-02, T-0-03, T-0-04, T-0-17
→ Todos config puros com arquivos disjuntos.

**Onda B (serial, estabelece schema base):** T-0-05
→ Primeira implementação de módulo novo; estabelece forma do `schema/organization.ts`.

**Onda C (paralelo, 3 subagents, depende de B):** T-0-06, T-0-10, T-0-11
→ Schemas independentes em arquivos disjuntos.

**Onda D (paralelo, 2 subagents, depende de C):** T-0-07, T-0-12
→ RBAC e webhook_log em arquivos novos.

**Onda E (paralelo, 3 subagents, depende de C+D):** T-0-08, T-0-09, T-0-13
→ RLS policies, helpers de auth e emitTimelineEvent. Nenhum colide.

**Onda F (paralelo, 3 subagents, depende de E):** T-0-14, T-0-15, T-0-18
→ Shell, auth UI e fixtures.

**Onda G (serial, depende de F):** T-0-16
→ UI de settings consome toda a base anterior.

## Critério de aceite do sprint (DoD)

- [ ] Todos os T-IDs em `completed`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` verde.
- [ ] `pnpm test:e2e` verde para login + criar marca + convidar usuário.
- [ ] Preview Vercel disponível e autenticável.
- [ ] Nenhuma OQ nova bloqueante (OQ aceitável: `OQ-ORG-01`, `OQ-ORG-02`).
- [ ] Deploy em staging verde.
- [ ] Admin seed consegue logar e criar primeira marca.

## Riscos e mitigação

- **RLS configurado errado vaza dados entre marcas.** Mitigação: teste integração com 2 JWTs distintos em T-0-08; review obrigatório de segurança antes de fechar o sprint.
- **Drizzle + Supabase com FK circular (transaction ↔ snapshot) sofrem em migration.** Mitigação: evitar FK circular na Fase 1; adicionar só em Sprint 8 via `ALTER TABLE`.
- **Inngest local requer tunnel.** Mitigação: documentar `pnpm dev:inngest` com `inngest-cli dev` no README.
- **Seed de permissões divergir da matriz RBAC.** Mitigação: T-0-07 consome `00-product/03-personas-rbac-matrix.md` como fonte.

## Open Questions

- `OQ-SPRINT0-01` — versão exata do Node no Vercel (18/20/22) e local — padronizar via `.nvmrc`.
- `OQ-SPRINT0-02` — usar `pg-boss` como fallback de Inngest para jobs internos que não precisam de UI? Fase 1 usa só Inngest.
