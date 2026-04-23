# 60 — Fluxos end-to-end

Fluxos (`FLOW-NN`) que atravessam mais de um módulo. Cada um documenta gatilho, atores, passos determinísticos, pós-condições, erros, BRs referenciadas, eventos de timeline e casos de teste E2E.

| Flow | Arquivo | Descrição |
|---|---|---|
| `FLOW-01` | `01-contact-ingestion.md` | Entrada de contato por landing/mensagem/integração |
| `FLOW-02` | `02-omnichannel-message.md` | Mensagem inbound → identifica contato → conversa |
| `FLOW-03` | `03-funnel-opportunity-lifecycle.md` | Vida de uma oportunidade no funil |
| `FLOW-04` | `04-offer-condition-decision.md` | Decisão de condição aplicada a uma venda |
| `FLOW-05` | `05-external-sale-ingest.md` | Digital Guru webhook → transação → snapshot → entitlement |
| `FLOW-06` | `06-entitlement-update.md` | Consolidação de direito em nova compra |
| `FLOW-07` | `07-refund-end-to-end.md` | Reembolso completo com revogação e reclassificação |
| `FLOW-08` | `08-manual-merge.md` | Merge manual de contatos |
| `FLOW-09` | `09-identity-pending-resolution.md` | Resolução de pendência de identidade |
| `FLOW-10` | `10-renewal-via-new-offer.md` | Renovação respeitando "compra única" |
| `FLOW-11` | `11-subscription-cycle.md` | Ciclo de assinatura (trial, ativa, dunning, cancel) |
| `FLOW-12` | `12-webhook-reprocess.md` | Reprocessamento manual de evento em DLQ |
| `FLOW-13` | `13-ticket-lifecycle.md` | Abertura, atribuição, resolução de ticket |
| `FLOW-14` | `14-campaign-attribution.md` | Atribuição de origem de entrada/conversão |

**Status:** stubs em Pass 1. Conteúdo completo no Pass 2.
