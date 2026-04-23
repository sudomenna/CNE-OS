# Registro de IDs

Registro vivo. Toda vez que um ID novo é criado, registrar aqui. Formato `<ID> — <título> — <arquivo>`.

## Módulos (`MOD-*`)

| ID | Arquivo |
|---|---|
| MOD-ORG | `20-domain/01-organization.md` |
| MOD-CONTACT | `20-domain/02-contact-identity.md` |
| MOD-MERGE | `20-domain/03-contact-merge-issues.md` |
| MOD-TIMELINE | `20-domain/04-timeline.md` |
| MOD-INBOX | `20-domain/05-conversation-inbox.md` |
| MOD-TICKET | `20-domain/06-ticket.md` |
| MOD-CAMPAIGN | `20-domain/07-campaign-creative.md` |
| MOD-FUNNEL | `20-domain/08-funnel-opportunity.md` |
| MOD-CATALOG | `20-domain/09-catalog.md` |
| MOD-OFFER | `20-domain/10-offer-engine.md` |
| MOD-TRANSACTION | `20-domain/11-transaction-snapshot.md` |
| MOD-ENTITLEMENT | `20-domain/12-entitlement.md` |
| MOD-BILLING | `20-domain/13-subscription-billing.md` |
| MOD-REFUND | `20-domain/14-refund.md` |
| MOD-AUTOMATION | `20-domain/15-automation.md` |

## Business Rules (`BR-*`)

Registro detalhado nos arquivos em `50-business-rules/`. Índice: `50-business-rules/README.md`.

## Timeline events (`TE-*`)

Catálogo completo em `30-contracts/03-timeline-event-catalog.md`.

## Fluxos (`FLOW-*`)

Índice em `60-flows/README.md` (14 fluxos definidos).

## Tarefas (`T-<S>-<N>`)

Populadas no Pass 3 por sprint em `80-roadmap/*`.

## ADRs (`ADR-*`)

Registro em `90-meta/04-decision-log.md`. ADRs já previstos:

| ID | Título | Status |
|---|---|---|
| ADR-01 | Inclusão de assinaturas/parcelamento/inadimplência na Fase 1 | proposto |
| ADR-02 | Formalização de reembolso na Fase 1 | proposto |
| ADR-03 | Migração por dual-run, módulo a módulo | proposto |
| ADR-04 | Supabase (Postgres) em vez de Convex | proposto |
| ADR-05 | Snapshot em jsonb + audit tables append-only | proposto |
| ADR-06 | Telefone > e-mail quando não há CPF | proposto |
| ADR-07 | Contador "30 primeiros" com excesso permitido | proposto |
| ADR-08 | Drizzle em vez de Prisma | proposto |
| ADR-09 | Inngest para webhooks e jobs | proposto |

## Open Questions (`OQ-*`)

Registro em `90-meta/03-open-questions-log.md`.

## Invariantes (`INV-MOD-*`)

Declaradas nos docs de módulo individualmente (seção 5).

## Enums

Catálogo completo em `30-contracts/01-enums.md`.
