# Integração Analytics (GA4)

## Papel

Rastreamento comportamental (aquisição, navegação, checkout) e leitura gerencial. Fase 1 é **envio apenas** — GA4 recebe eventos via Measurement Protocol (server-side) e via tag client-side (`next/script`). Fase 2 habilita leitura via export BigQuery para dashboards nativos.

Eventos de venda são enviados server-side após `approveTransaction` (FLOW-05) para garantir integridade. Eventos de navegação e intenção são enviados client-side. UTMs capturados por `trackable_link` (MOD-CAMPAIGN) alimentam automaticamente `campaign`/`source`/`medium`.

Adaptador: `/lib/integrations/analytics/`.

## Eventos consumidos

**Fase 1 não consome webhooks de GA4.** Sem endpoint público de recepção. Fase 2 pode puxar relatórios via Reporting API ou consumir BigQuery export.

| `external_event` | Ação interna | BRs | TEs | `idempotency_key` |
|---|---|---|---|---|
| (nenhum na Fase 1) | — | — | — | — |

## Eventos emitidos (outbound)

### Server-side (Measurement Protocol)

Endpoint: `POST https://www.google-analytics.com/mp/collect?measurement_id=<ID>&api_secret=<SECRET>`. Enviados por job Inngest após evento interno.

| Evento interno | GA4 event | Quando | Idempotency |
|---|---|---|---|
| `TE-SALE-APPROVED` | `purchase` | FLOW-05 passo 18 (pós-commit) | `transaction.id + ':purchase'` |
| `TE-SALE-REFUNDED` | `refund` | FLOW-07 commit | `refund.id + ':refund'` |
| `TE-FUNNEL-ENTERED` (opcional) | `generate_lead` | qualificação de lead configurável | `funnel_entry.id + ':lead'` |

### Client-side (`<Script>` no App Router)

| GA4 event | Quando (UI) | Parâmetros |
|---|---|---|
| `page_view` | navegação SPA (App Router route change) | `page_location`, `page_title`, `page_referrer` |
| `view_item` | abertura de `/offers/[id]` ou landing de checkout | `items[]`, `value`, `currency` |
| `add_to_cart` | clique em CTA de compra / adição de order bump | `items[]`, `value`, `currency` |
| `begin_checkout` | início de preenchimento do checkout | `items[]`, `value`, `currency`, `coupon?` |
| `search` | uso do command palette para conteúdo público (quando aplicável) | `search_term` |

Evento `purchase` **não é enviado client-side** para evitar duplicata e perda por ad-blocker — apenas server-side via Measurement Protocol, autoritativo.

## Mapeamento canônico

| `internal_field` | GA4 `parameter` | Transformação |
|---|---|---|
| `contact.id` | `client_id` | UUID do contato (quando resolvível); ou `_ga` cookie client-side |
| `contact.id` | `user_id` | cópia (login obrigatório em área autenticada) |
| `transaction.id` | `transaction_id` | cópia |
| `transaction.amount` | `value` | parse para number (GA4 não aceita string) |
| `transaction.currency` | `currency` | ISO-4217 uppercase |
| `snapshot.items[].product.name` | `items[].item_name` | cópia |
| `snapshot.items[].product.id` | `items[].item_id` | cópia |
| `snapshot.items[].unit_price` | `items[].price` | parse number |
| `snapshot.items[].quantity` | `items[].quantity` | cópia |
| `trackable_link.utm.source` | `source` | cópia |
| `trackable_link.utm.medium` | `medium` | cópia |
| `trackable_link.utm.campaign` | `campaign` | cópia |
| `trackable_link.utm.content` | `content` | cópia |
| `brand.id` | `custom_parameter.brand_id` | cópia (CD personalizada no GA4) |
| `offer.id` | `custom_parameter.offer_id` | cópia |
| `condition.id` | `custom_parameter.condition_id` | cópia |
| `refund.amount` | `value` (negativo) | parse; evento `refund` em GA4 |

## Idempotência / retry / DLQ

- Outbound gera `external_event_id = '{eventName}:{sourceId}'` em `webhook_log` com `provider='analytics'` antes do POST. Segunda chamada com mesma key resolve como duplicate sem reenvio (CT-IDEM-06).
- Retry 5× backoff padrão. DLQ → alerta Axiom (baixa severidade — dado analítico, não bloqueante).
- GA4 nunca retorna 4xx para validação de payload na rota `/collect` (retorna 204 mesmo quando evento é descartado). Para debug, usar endpoint `/debug/mp/collect` em staging.
- Falha de rede/timeout → retry normal.

## Credenciais e configuração (env vars)

```
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_API_SECRET=<secret gerado no painel GA4 Data Streams → Measurement Protocol API secrets>
GA4_DEBUG_ENDPOINT=false   # true só em staging
NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-XXXXXXXXXX   # exposto ao client via gtag
```

Tag client-side via `next/script` strategy `afterInteractive`, carregada em layout autenticado E público (consent banner — LGPD — controla ativação).

## Limitações conhecidas

1. **Sem consumo de webhook** — GA4 não envia webhooks em tempo real; Fase 1 é apenas outbound.
2. **Latência de relatório** — GA4 processa eventos em 24-48h para dashboards nativos; para números em tempo real, usar dashboards internos do CNE-OS (FLOW-analytics).
3. **Sampling** — relatórios GA4 podem amostrar em volumes altos; BigQuery export (Fase 2) resolve.
4. **Consent** — LGPD exige banner; sem consentimento, desabilitar gtag client-side. Server-side continua, mas com `user_id` anonimizado.
5. **Measurement Protocol silencioso** — GA4 não retorna erro de schema; validar payload local antes do envio.
6. **Limite de 25 parâmetros por evento** — respeitar; dimensões custom (brand_id, offer_id, condition_id) precisam cadastro prévio.
7. **Export BigQuery** — requer GA4 Properties (paga em Firebase GA4 free-tier tem export). Fase 1 não usa.

## Casos de teste

| ID | Cenário | Resultado |
|---|---|---|
| CT-AN-01 | `TE-SALE-APPROVED` dispara `purchase` server-side | `webhook_log` com `provider='analytics'`, `external_event_id='{trxId}:purchase'`, status `processed`, 204 do GA4 |
| CT-AN-02 | Retry de `purchase` com mesma transaction | segunda chamada duplicate; sem POST redundante |
| CT-AN-03 | `TE-SALE-REFUNDED` dispara `refund` negativo | evento `refund` enviado, valor conforme snapshot |
| CT-AN-04 | Client-side `page_view` sem consent | gtag não carrega; nenhum request GA4 |
| CT-AN-05 | Client-side `begin_checkout` com UTM | evento inclui `campaign/source/medium` do `trackable_link` |
| CT-AN-06 | GA4 timeout | retry backoff; sucesso eventual |
| CT-AN-07 | Dimensão custom faltando (`brand_id` não cadastrada) | evento aceito pelo GA4, mas CD não reporta; alerta de configuração |
| CT-AN-08 | Staging usa debug endpoint | `GA4_DEBUG_ENDPOINT=true` → `/debug/mp/collect`, response com validation messages |

## Open Questions

- `OQ-AN-01` — Client-side `purchase` como backup ou só server-side? Proposta: só server-side (evita duplicata).
- `OQ-AN-02` — `client_id` quando usuário não está autenticado e não tem cookie `_ga` — gerar UUID temporário no server? Fase 1: omitir evento para usuários anônimos.
- `OQ-AN-03` — Habilitar BigQuery export na Fase 2 — validar custo e precisar ADR.
- `OQ-AN-04` — Consent banner: biblioteca (CookieYes, OneTrust) ou custom? Fase 1: custom minimalista.
- `OQ-AN-05` — Evento `view_promotion` / `select_promotion` para experimentação de condições comerciais — Fase 2.
