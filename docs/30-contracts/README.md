# 30 — Contratos

Fonte única da verdade de enums, convenções de schema, eventos de timeline, contratos de webhook, server actions, audit trail e interfaces públicas entre módulos.

**Regra de ouro:** mudanças aqui são **sempre seriais** — nunca em paralelo entre subagents. Mudar um contrato sem coordenação quebra múltiplos módulos silenciosamente.

| Arquivo | Conteúdo |
|---|---|
| [`01-enums.md`](./01-enums.md) | Todos os enums do sistema (status, tipos, papéis) |
| [`02-db-schema-conventions.md`](./02-db-schema-conventions.md) | Naming, timestamps, soft-delete, audit, jsonb |
| [`03-timeline-event-catalog.md`](./03-timeline-event-catalog.md) | `TE-*` por tipo, payload, emissor, visibilidade |
| `04-webhook-contracts.md` | Digital Guru, Brevo, WhatsApp — idempotência, retry, DLQ |
| `05-api-server-actions.md` | Convenções de Server Actions + zod + erros |
| `06-audit-trail-spec.md` | O que auditar, formato, retenção |
| `07-module-interfaces.md` | Assinaturas públicas entre módulos |

## Processo para mudar um contrato

1. Abrir tarefa **serial** no sprint (não `parallel-safe`).
2. Atualizar este diretório.
3. Atualizar os módulos consumidores (pode ser paralelo depois, consumindo o contrato já congelado).
4. Registrar em [`../90-meta/04-decision-log.md`](../90-meta/04-decision-log.md) se for mudança não-óbvia (ADR).
