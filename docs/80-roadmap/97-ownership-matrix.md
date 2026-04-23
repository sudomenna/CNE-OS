# 97 — Matriz de ownership de arquivos por módulo

Tabela consolidada de quem pode escrever o quê. Complementa a seção `Edita:` de cada T-ID individual e a tabela em `docs/10-architecture/09-module-boundaries.md`.

## Como usar antes de despachar uma onda de subagents

1. Liste os T-IDs candidatos da onda.
2. Para cada T-ID, leia a coluna **Paths owned** abaixo do módulo responsável.
3. Verifique se as listas de paths são **disjuntas** entre os T-IDs da onda.
4. Se duas tarefas da onda tocam o mesmo path → serializar.
5. Se uma tarefa quer tocar path de outro módulo → tarefa inválida, escale.

## Ownership por módulo

| Módulo | Tag | Paths owned (edita) | Pode ler cross-module |
|---|---|---|---|
| `MOD-ORG` | Organização, marcas, CNPJs | `lib/db/schema/brand.ts`, `lib/db/schema/user_internal.ts`, `lib/domain/org/*`, `app/(app)/settings/brands/*`, `app/(app)/settings/users/*`, `docs/20-domain/01-organization.md` | — |
| `MOD-CONTACT` | Contato e identidade | `lib/db/schema/contact.ts`, `lib/db/schema/contact_identity.ts`, `lib/db/schema/contact_merge.ts`, `lib/domain/contact/*`, `app/(app)/contacts/*`, `components/contact/*`, `docs/20-domain/02-contact-identity.md`, `docs/20-domain/03-contact-merge-issues.md` | `brand`, `timeline_event` |
| `MOD-TIMELINE` | Timeline unificada | `lib/db/schema/timeline_event.ts`, `lib/timeline/emit.ts`, `components/timeline/*`, `docs/20-domain/04-timeline.md`, `docs/30-contracts/03-timeline-event-catalog.md` | todos (leitura) |
| `MOD-INBOX` | Inbox omnichannel | `lib/db/schema/conversation.ts`, `lib/db/schema/inbox_message.ts`, `lib/domain/inbox/*`, `app/(app)/inbox/*`, `components/inbox/*`, `docs/20-domain/05-conversation-inbox.md` | `contact`, `ticket`, `brand` |
| `MOD-TICKET` | Tickets de atendimento | `lib/db/schema/ticket.ts`, `lib/db/schema/ticket_message.ts`, `lib/domain/ticket/*`, `app/(app)/tickets/*`, `components/ticket/*`, `docs/20-domain/06-ticket.md` | `contact`, `conversation`, `user_internal` |
| `MOD-CAMPAIGN` | Campanhas e criativos | `lib/db/schema/campaign.ts`, `lib/db/schema/creative.ts`, `lib/db/schema/tracked_link.ts`, `lib/domain/campaign/*`, `app/(app)/campaigns/*`, `docs/20-domain/07-campaign-creative.md` | `brand`, `contact` (first touch) |
| `MOD-FUNNEL` | Funis, estágios, oportunidades | `lib/db/schema/funnel.ts`, `lib/db/schema/funnel_stage.ts`, `lib/db/schema/opportunity.ts`, `lib/domain/funnel/*`, `app/(app)/funnels/*`, `docs/20-domain/08-funnel-opportunity.md` | `contact`, `brand` |
| `MOD-CATALOG` | Catálogo comercial | `lib/db/schema/product.ts`, `lib/db/schema/product_benefit.ts`, `lib/domain/catalog/*`, `app/(app)/catalog/*`, `docs/20-domain/09-catalog.md` | `brand` |
| `MOD-OFFER` | Motor de ofertas | `lib/db/schema/offer.ts`, `lib/db/schema/offer_condition.ts`, `lib/db/schema/offer_condition_item.ts`, `lib/db/schema/coupon.ts`, `lib/domain/offer/*`, `app/(app)/offers/*`, `docs/20-domain/10-offer-engine.md` | `catalog`, `contact`, `brand` |
| `MOD-TRANSACTION` | Snapshot imutável | `lib/db/schema/transaction.ts`, `lib/db/schema/transaction_snapshot.ts`, `lib/domain/transaction/*`, `docs/20-domain/11-transaction-snapshot.md` | `offer`, `catalog`, `contact` |
| `MOD-ENTITLEMENT` | Direitos adquiridos | `lib/db/schema/entitlement.ts`, `lib/domain/entitlement/*`, `docs/20-domain/12-entitlement.md` | `transaction_snapshot` |
| `MOD-SUBSCRIPTION` | Assinaturas, parcelamento | `lib/db/schema/subscription.ts`, `lib/db/schema/installment.ts`, `lib/db/schema/dunning.ts`, `lib/domain/subscription/*`, `app/(app)/subscriptions/*`, `docs/20-domain/13-subscription-billing.md` | `transaction`, `contact`, `offer` |
| `MOD-REFUND` | Reembolso formalizado | `lib/db/schema/refund.ts`, `lib/domain/refund/*`, `app/(app)/refunds/*`, `docs/20-domain/14-refund.md` | `transaction_snapshot`, `entitlement` |
| `MOD-AUTOMATION` | Automações visuais | `lib/db/schema/automation.ts`, `lib/db/schema/automation_run.ts`, `lib/domain/automation/*`, `app/(app)/automations/*`, `docs/20-domain/15-automation.md` | `timeline_event` (matching) |
| `MOD-AUTH` | Auth, RBAC, audit | `lib/auth/session.ts`, `lib/auth/rbac/*`, `lib/db/schema/audit_log.ts`, `lib/audit/log.ts` | — |
| `MOD-INTEGRATIONS` | Adapters externos | `lib/integrations/<provider>/*`, `app/api/webhooks/<provider>/route.ts`, `lib/db/schema/webhook_log.ts`, `docs/40-integrations/<provider>.md` | domínios que recebem eventos |

## Arquivos seriais (nunca edite em paralelo)

Esses arquivos são core compartilhados. Toda edição aqui é PR dedicado, serializado:

- `lib/db/schema/_helpers.ts` (triggers compartilhados: `set_updated_at`, `forbid_update_delete`)
- `lib/db/client.ts` (singleton Drizzle + tipo `DbTx`)
- `lib/timeline/emit.ts` (único ponto de escrita em `timeline_event`)
- `lib/audit/log.ts` (único ponto de escrita em `audit_log`)
- `lib/actions/result.ts` (`ActionResult`, `toActionResult`)
- `lib/auth/rbac/matrix.ts` (RBAC_MATRIX)
- `docs/30-contracts/*` (enums, schema conventions, interfaces, audit spec, webhook contracts, API)
- `docs/50-business-rules/*` (BRs — mudança exige ADR + humano)
- `docs/90-meta/04-decision-log.md` (ADRs — append-only por natureza)

## Detecção de colisão (heurística)

Antes de despachar onda com subagents A, B, C em paralelo:

```
collision = (paths_A ∩ paths_B) ∪ (paths_A ∩ paths_C) ∪ (paths_B ∩ paths_C)
if collision is non-empty:
  serialize
```

Prefira ordenar por dependência natural (schema antes de domínio antes de UI) quando os paths são compatíveis mas a lógica de uma precisa da outra.
