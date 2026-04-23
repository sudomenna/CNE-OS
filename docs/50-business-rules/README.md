# 50 — Business Rules (BRs)

Regras de negócio como **contratos executáveis**. Cada BR tem: enunciado imperativo, motivação, camada de enforcement (DB/trigger/função pura/UI), contrato TS ou DDL SQL quando aplicável, tabela de decisão quando necessário, e **casos de teste concretos**.

## Convenções

- ID: `BR-<DOMAIN>-<NUM>` (`BR-IDENTITY-003`, `BR-OFFER-DECISION-001`).
- Um arquivo por domínio agrupa regras relacionadas (ex.: `BR-IDENTITY.md` contém `BR-IDENTITY-001..N`).
- Toda BR é referenciada por ao menos um módulo em `/20-domain/` e ao menos um teste em `/tests/`.
- Mudar BR = mudar testes + atualizar módulo + ADR se for decisão não-óbvia.

## Índice mestre

| Arquivo | Domínio | Regras principais |
|---|---|---|
| [`BR-IDENTITY.md`](./BR-IDENTITY.md) | Identidade de contato | CPF absoluto, telefone > e-mail, tabela de decisão |
| [`BR-MERGE.md`](./BR-MERGE.md) | Merge de contato | Não-destrutivo, principal, undo |
| [`BR-CONTACT-CLASSIFICATION.md`](./BR-CONTACT-CLASSIFICATION.md) | Classificação | Lead/cliente/aluno/lead pago |
| [`BR-OFFER-DECISION.md`](./BR-OFFER-DECISION.md) | Motor comercial | Prioridade → score → timestamp → conflito |
| [`BR-OFFER-ELIGIBILITY.md`](./BR-OFFER-ELIGIBILITY.md) | Motor comercial | E/OU, contador atômico, excesso permitido |
| [`BR-OFFER-UNIQUENESS.md`](./BR-OFFER-UNIQUENESS.md) | Motor comercial | Contato não compra mesma oferta 2x |
| [`BR-SNAPSHOT-IMMUTABILITY.md`](./BR-SNAPSHOT-IMMUTABILITY.md) | Transação | Append-only, jsonb congelado |
| [`BR-ENTITLEMENT-CONSOLIDATION.md`](./BR-ENTITLEMENT-CONSOLIDATION.md) | Direito adquirido | 12m + vitalício, estender expiração |
| [`BR-REFUND.md`](./BR-REFUND.md) | Reembolso | Revoga direitos, flag snapshot, reclassifica, libera recompra |
| [`BR-RENEWAL.md`](./BR-RENEWAL.md) | Renovação | Preserva compra única via oferta de renovação |
| [`BR-SUBSCRIPTION.md`](./BR-SUBSCRIPTION.md) | Assinatura | Ciclo, trial, dunning, cancelamento |
| [`BR-FUNNEL-OPPORTUNITY.md`](./BR-FUNNEL-OPPORTUNITY.md) | Funil | Oportunidade única ativa, ganho por compra |
| [`BR-TIMELINE.md`](./BR-TIMELINE.md) | Timeline | Contrato de emissão, append-only |
| [`BR-INBOX-CONVERSATION.md`](./BR-INBOX-CONVERSATION.md) | Inbox | Conversa ≠ ticket, responsável por conversa |
| [`BR-RBAC.md`](./BR-RBAC.md) | Autorização | Matriz por ação crítica |
| [`BR-AUDIT.md`](./BR-AUDIT.md) | Auditoria | Imutabilidade, escopo |
| [`BR-INTEGRATION-IDEMPOTENCY.md`](./BR-INTEGRATION-IDEMPOTENCY.md) | Integração | `event_id` UNIQUE, retry, DLQ, reprocess |

## Tabela mestre (populada automaticamente durante implementação)

| BR ID | Título | Arquivo | Módulo owner | Enforcement | Teste |
|---|---|---|---|---|---|
| *(populado no Pass 2)* | | | | | |

**Status:** stubs em Pass 1. Conteúdo completo no Pass 2.
