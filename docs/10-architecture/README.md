# 10 — Arquitetura

Decisões técnicas, stack, data layer, realtime, auth, observabilidade, NFR, boundaries de módulo e estratégia de testes.

| Arquivo | Conteúdo |
|---|---|
| `01-overview.md` | Diagrama de blocos + fluxo de requisição |
| `02-stack.md` | Next.js, Supabase, Drizzle, Inngest, shadcn — versões pinadas |
| `03-data-layer.md` | Drizzle, migrations, RLS, audit tables, soft-delete, jsonb snapshots |
| `04-integrations-canonical.md` | Modelo canônico + padrão de adaptador |
| `05-realtime-jobs.md` | Supabase Realtime, Inngest, jobs idempotentes |
| `06-auth-rbac-audit.md` | Autenticação, 2FA, RBAC, auditoria |
| `07-observability.md` | Sentry, Axiom, logs estruturados, correlation IDs |
| `08-nfr.md` | SLA, RPO/RTO, storage, limites, performance |
| `09-module-boundaries.md` | Ownership, interfaces públicas, regra de ouro da paralelização |
| `10-testing-strategy.md` | Vitest + Playwright + fixtures |

**Status:** stub em Pass 1. Conteúdo completo no Pass 3.
