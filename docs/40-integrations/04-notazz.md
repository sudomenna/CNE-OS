# Integração Notazz

## Papel

Emissão fiscal externa de NF-e (ou NFS-e, conforme produto e município). Após aprovação de transação (FLOW-05 passo 18), job Inngest dispara emissão via API Notazz usando dados congelados de `transaction_snapshot` (legal_entity emissora + itens). Falhas persistentes geram `contact_issue kind='other'` com detalhe `tax_emission_failed` e alerta para time financeiro.

Notazz também envia webhook inbound (opcional) com status da emissão (`issued`, `cancelled`, `rejected`), que atualiza `transaction.invoice_status`.

Adaptador: `/lib/integrations/notazz/`. Contrato de recepção em [`../30-contracts/04-webhook-contracts.md#54-notazz-emissão-fiscal`](../30-contracts/04-webhook-contracts.md#54-notazz-emissão-fiscal).

## Eventos consumidos

Rota: `POST /api/webhooks/notazz`. Autenticação: header `X-Notazz-Token` (token estático, `timingSafeEqual` com `NOTAZZ_WEBHOOK_TOKEN`). `external_event_id = payload.invoice_id + ':' + payload.status`. `event_kind = payload.status`.

| `external_event` | Ação interna | BRs | TEs | `idempotency_key` |
|---|---|---|---|---|
| `invoice.issued` | `UPDATE transaction SET invoice_status='issued', invoice_number=payload.number, invoice_url=payload.pdf_url, invoice_xml_url=payload.xml_url`; armazenar PDF/XML em Supabase Storage | BR-INTEGRATION-IDEMPOTENCY | `TE-INTEGRATION-EVENT` com `reason='invoice_issued'` | `invoice_id:issued` |
| `invoice.cancelled` | `UPDATE transaction SET invoice_status='cancelled'`; log em `audit_log` | BR-INTEGRATION-IDEMPOTENCY, BR-AUDIT | `TE-INTEGRATION-EVENT` com `reason='invoice_cancelled'` | `invoice_id:cancelled` |
| `invoice.rejected` | `UPDATE transaction SET invoice_status='rejected', invoice_error=payload.error`; abrir `contact_issue kind='other'` (detail `tax_emission_rejected`); alerta financeiro | BR-INTEGRATION-IDEMPOTENCY | `TE-INTEGRATION-EVENT` com `reason='invoice_rejected'`, `TE-CONTACT-ISSUE-OPENED` | `invoice_id:rejected` |

## Eventos emitidos (outbound)

| Ação interna | Endpoint Notazz | Idempotency |
|---|---|---|
| Emitir NF após `approveTransaction` | `POST /api/invoices` | `transaction.id` (garante 1 nota por transação) |
| Cancelar NF após `approveRefund` | `POST /api/invoices/{invoice_id}/cancel` | `refund.id + ':cancel_invoice'` |
| Reemitir NF (operador financeiro corrige dado) | `POST /api/invoices/{invoice_id}/reissue` | `transaction.id + ':reissue:{rev}'` |

Emissão outbound é **assíncrona**: `approveTransaction` commita e enfileira Inngest `notazz/invoice.issue`. Job:

1. Lê `transaction_snapshot.payload` — legal_entity, itens, valores.
2. Monta payload Notazz (serviço/produto, NCM, CFOP por município/produto — ver tabela de mapeamento por catálogo).
3. `POST /api/invoices` com `external_ref=transaction.id`.
4. Sucesso 2xx → `transaction.invoice_status='processing'`, aguarda webhook `invoice.issued`.
5. Falha → retry 5×; esgotado → `invoice_status='failed'`, `contact_issue kind='other'`.

## Mapeamento canônico

| `external_field` | `internal_field` | Transformação |
|---|---|---|
| `payload.invoice_id` | `transaction.invoice_external_id` | cópia |
| `payload.number` | `transaction.invoice_number` | cópia |
| `payload.status` | `transaction.invoice_status` | enum map: `issued→issued`, `cancelled→cancelled`, `rejected→rejected` |
| `payload.pdf_url` | `transaction.invoice_url` | cópia; opcionalmente rebaixa para Storage |
| `payload.xml_url` | `transaction.invoice_xml_url` | idem |
| `payload.error` | `transaction.invoice_error` | cópia quando `rejected` |
| Outbound ← `snapshot.legal_entity.cnpj` | `payload.issuer.cnpj` | strip não-dígitos |
| Outbound ← `snapshot.legal_entity.ie` | `payload.issuer.ie` | cópia |
| Outbound ← `snapshot.items[]` | `payload.items[]` | compor `{description, quantity, unit_price, ncm, cfop}` |
| Outbound ← `snapshot.customer` (nome, cpf, endereço) | `payload.customer` | — |

## Idempotência / retry / DLQ

- UNIQUE `(provider='notazz', external_event_id)` para inbound.
- Outbound: `external_event_id = 'transaction:{id}:issue'` persistido em `webhook_log` antes do POST; segunda tentativa com mesma key resolve como duplicate.
- Retry 5× backoff. DLQ → alerta Slack `#ops-financeiro` (impacto fiscal — prazo legal de emissão).
- Rejeição SEFAZ repetitiva: mais de 3 rejeições por causa idêntica em 1h → alerta PagerDuty (provável dado inválido no cadastro).

## Credenciais e configuração (env vars)

```
NOTAZZ_API_KEY=<api key da conta>
NOTAZZ_WEBHOOK_TOKEN=<token configurado no painel Notazz>
NOTAZZ_BASE_URL=https://app.notazz.com
NOTAZZ_DEFAULT_NCM=<NCM padrão para curso/serviço>
NOTAZZ_DEFAULT_CFOP=<CFOP padrão>
```

Mapeamento de CNPJ emissor por marca resolvido via `resolveLegalEntityForSale` ([`../30-contracts/07-module-interfaces.md#mod-organization`](../30-contracts/07-module-interfaces.md#mod-organization)); não vive em env.

## Limitações conhecidas

1. **Assincronia obrigatória** — SEFAZ pode demorar segundos a minutos; `invoice_status='processing'` é estado intermediário.
2. **Sem granularidade de item avançada** — snapshot é fonte canônica; se item tem NCM ausente, usa `NOTAZZ_DEFAULT_NCM`.
3. **Cancelamento com prazo** — SEFAZ aceita cancelamento em até 24h após emissão (NF-e); após isso, apenas carta de correção (Fase 2).
4. **Reemissão substitui** — gera nova NF com número sequencial novo; a original continua no histórico.
5. **Sem emissão para PJ Fase 1** — apenas PF (cliente final); produtos B2B usam fluxo manual.
6. **Sem integração com ISS municipal uniforme** — municípios variam; adaptação por cidade do emissor.

## Casos de teste

| ID | Cenário | Resultado |
|---|---|---|
| CT-NZ-01 | `approveTransaction` dispara emissão | job enfileirado; Notazz POST recebe snapshot; `invoice_status='processing'` |
| CT-NZ-02 | Webhook `invoice.issued` chega | `invoice_status='issued'`, URLs preenchidas, `TE-INTEGRATION-EVENT` |
| CT-NZ-03 | Webhook `invoice.rejected` | `invoice_status='rejected'`, `contact_issue` aberta, alerta |
| CT-NZ-04 | Cancelamento via `approveRefund` dentro de 24h | job `notazz/invoice.cancel`; webhook `invoice.cancelled` atualiza status |
| CT-NZ-05 | Reentrega do mesmo `invoice_id:issued` | duplicate detectado; sem atualização redundante |
| CT-NZ-06 | Falha de rede no outbound | retry 5×; sucesso na 2ª; única NF emitida (idempotency key) |
| CT-NZ-07 | Esgotamento de retries | `invoice_status='failed'`, `contact_issue` aberta |
| CT-NZ-08 | Token inválido no webhook inbound | 401; sem linha |
| CT-NZ-09 | Snapshot sem `legal_entity` resolvível | job falha com erro fatal; DLQ imediato |
| CT-NZ-10 | Refund após 24h da emissão | cancelamento rejeitado; operação trata via carta de correção manual |

## Open Questions

- `OQ-NZ-01` — NCM/CFOP por produto vs default único — Fase 1 usa default, Fase 2 por produto?
- `OQ-NZ-02` — NF-e de PJ (B2B) no escopo Fase 1? Proposta: não.
- `OQ-NZ-03` — Retry estendido (além de 5) para casos SEFAZ instável? Configurável por provider (OQ-BR-IDEM-03).
- `OQ-NZ-04` — Armazenar PDF/XML em Supabase Storage vs só link Notazz? Proposta: rebaixar para Storage (durabilidade legal).
