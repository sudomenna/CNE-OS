# 20 — Domínio

Um arquivo por agregado (módulo). Cada um é um **pacote de trabalho paralelizável**: declara sua `Ownership` (arquivos que possui/lê) e suas interfaces públicas.

## Mapa de módulos

| ID do módulo | Arquivo | Finalidade |
|---|---|---|
| `MOD-ORG` | `01-organization.md` | Marca, entidade fiscal, relação marca×CNPJ |
| `MOD-CONTACT` | `02-contact-identity.md` | Contato + phones + emails + documents + identidade |
| `MOD-MERGE` | `03-contact-merge-issues.md` | Merge não-destrutivo + pendências |
| `MOD-TIMELINE` | `04-timeline.md` | Timeline unificada do contato |
| `MOD-INBOX` | `05-conversation-inbox.md` | Conversas, mensagens, canais |
| `MOD-TICKET` | `06-ticket.md` | Tickets de atendimento |
| `MOD-CAMPAIGN` | `07-campaign-creative.md` | Campanhas, criativos, links rastreáveis |
| `MOD-FUNNEL` | `08-funnel-opportunity.md` | Funis, estágios, oportunidades, metas |
| `MOD-CATALOG` | `09-catalog.md` | Produtos e benefícios comerciais |
| `MOD-OFFER` | `10-offer-engine.md` | Ofertas, condições, regras, opções de pagamento, decisão |
| `MOD-TRANSACTION` | `11-transaction-snapshot.md` | Transações + snapshots imutáveis |
| `MOD-ENTITLEMENT` | `12-entitlement.md` | Direitos adquiridos + consolidação |
| `MOD-BILLING` | `13-subscription-billing.md` | Assinaturas, parcelamento, inadimplência |
| `MOD-REFUND` | `14-refund.md` | Reembolso end-to-end |
| `MOD-AUTOMATION` | `15-automation.md` | Fluxos de automação |

## Grafo de dependências (resumido)

```
MOD-ORG ← todos
MOD-CONTACT ← MOD-MERGE, MOD-TIMELINE, MOD-INBOX, MOD-TICKET, MOD-FUNNEL, MOD-TRANSACTION
MOD-CATALOG ← MOD-OFFER
MOD-OFFER ← MOD-TRANSACTION, MOD-BILLING
MOD-TRANSACTION ← MOD-ENTITLEMENT, MOD-REFUND, MOD-BILLING
MOD-FUNNEL ← MOD-CAMPAIGN (via criativo de entrada/conversão)
MOD-TIMELINE ← emissor universal (recebe eventos de quase todos)
MOD-AUTOMATION ← ouve eventos de quase todos
```

## Regra de ouro

Um módulo edita **apenas** os arquivos listados em sua seção `Ownership`. Para consumir outro módulo, usa-se **interface pública** declarada em [`../30-contracts/07-module-interfaces.md`](../30-contracts/07-module-interfaces.md).

**Status:** arquivos ainda não preenchidos. Pass 2 completa todos.
