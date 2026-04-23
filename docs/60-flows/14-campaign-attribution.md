# FLOW-14: Atribuição de campanha/criativo

## Gatilho / pré-condições

Contato clica em um `trackable_link` gerado pelo sistema. Mais tarde, esse contato entra em funil e eventualmente converte (compra). Este fluxo materializa a origem de **entrada** e de **conversão** da oportunidade, permitindo atribuir ROI por campanha/criativo.

Pré-condições:
- `trackable_link` existe com `slug` único, UTMs geradas por [`generateUtm`](../20-domain/07-campaign-creative.md#9-geração-de-utm--contrato);
- janela de atribuição configurada (Fase 1: 30 dias, last-click — `OQ-FLOW-14-01`).

## Atores

- humano: contato (clica link), operador (atribuição manual quando necessário).
- sistema: redirector (edge function `/l/:slug`), `MOD-CAMPAIGN`, `MOD-FUNNEL`, `MOD-TRANSACTION` (FLOW-05 passo 15).
- integração: Meta Ads / Google Ads / e-mail como origem do clique (não participam do processamento).

## Passos

### Clique

1. Contato clica URL encurtada `https://<domain>/l/<slug>?...`.
2. **Redirector** (edge function, baixa latência):
   - busca `trackable_link` por `slug`; 404 se não existir;
   - extrai identificador do contato quando disponível:
     - cookie `cne_cid` (contact_id assinado) — definido em clique anterior ou login;
     - parâmetro `?cid=<contactId>` para links enviados ativamente (campanhas de e-mail pós-identificação);
     - senão: `contact_id=NULL` (anônimo — emissão adiada).
   - monta payload `{ trackable_link_id, campaign_id, creative_id, funnel_id, utm, referrer, user_agent, ip }`;
   - se `contactId` conhecido: emite `TE-CAMPAIGN-CLICK` com `source='MOD-CAMPAIGN'`, `actor_system='redirector'`;
   - se anônimo: grava em `trackable_link_click_anonymous` (tabela leve) com `session_id` de cookie; resolve depois se contato for identificado na mesma sessão.
   - 302 para `destination_url` com UTMs preservadas.

### Entrada em funil (entry attribution)

3. Quando contato entra em funil ([`FLOW-03`](./03-funnel-opportunity-lifecycle.md)) com contexto de clique recente (dentro da janela):
   - buscar **último** `TE-CAMPAIGN-CLICK` do contato com `campaign_id` ligado ao funil OU `trackable_link.funnel_id = funnel.id`, em janela 30d;
   - preencher `funnel_entry.entry_origin = 'campaign'`, `entry_campaign_id`, `entry_creative_id` com os do clique;
   - se nenhum clique na janela ⇒ `entry_origin` conforme método de entrada (`manual`, `import`, `integration`).

### Conversão (conversion attribution)

4. Quando venda da oferta do funil é aprovada ([`FLOW-05`](./05-external-sale-ingest.md) passo 15) e `markWon` é chamado:
   - buscar **último** `TE-CAMPAIGN-CLICK` do contato na janela (30d últimos) **independente** do funil — last-click global;
   - se existe clique cujo `campaign_id` pertence à marca da oferta e dentro da janela ⇒ preencher `funnel_entry.conversion_origin='campaign'`, `conversion_campaign_id`, `conversion_creative_id`;
   - senão ⇒ `conversion_origin='direct'` (ou `'manual'` se operador marcou won via venda interna).
5. Persistir em `funnel_entry`; `entry_*` e `conversion_*` podem ser iguais (mesmo criativo atraiu e converteu) ou distintos (entrada por criativo X, conversão por criativo Y).

### Atribuição manual (override)

6. Operador pode editar `conversion_creative_id`/`conversion_campaign_id` de uma `funnel_entry won` via UI com papel `marketing` ou `admin`:
   - UPDATE direto;
   - INSERT em `audit_log`;
   - emitir `TE-INTEGRATION-EVENT` informativo (ou evento dedicado — `OQ-FLOW-14-02`).

### Dashboard / leitura

7. Dashboard de marketing cruza `funnel_entry` × `transaction` × `campaign`/`creative`:
   - conta `funnel_entry.label='won'` agrupado por `conversion_campaign_id`, `conversion_creative_id`;
   - soma `transaction.amount` correspondente;
   - calcula CPA, ROAS por criativo.

## Pós-condições

- Todo clique identificável gera 1 `TE-CAMPAIGN-CLICK`.
- `funnel_entry.entry_*` refletem last-click na janela ao entrar em funil.
- `funnel_entry.conversion_*` refletem last-click na janela ao converter.
- Mudanças manuais auditadas.

## Caminhos de erro

| Código | Condição | Ação | Recuperação |
|---|---|---|---|
| E-01 | `slug` inexistente | 404; log em `trackable_link_404_total` | verificar link |
| E-02 | clique anônimo nunca identificado (abandona sessão) | registro permanece em `trackable_link_click_anonymous`; purge em 90d | — |
| E-03 | clique anônimo + identificação posterior na mesma sessão | job resolve retroativamente: emite `TE-CAMPAIGN-CLICK` com `occurred_at` do clique original | — |
| E-04 | clique fora da janela de 30d | não participa de attribution | — |
| E-05 | campanha arquivada após clique mas antes de conversão | mantém referência (`INV-CAMPAIGN-05`); atribuição preservada | — |
| E-06 | volume alto de cliques infla timeline (`OQ-TE-02`) | Fase 1: emitir cada clique; Fase 2: agregar por sessão | — |

## Regras referenciadas

- [`BR-FUNNEL-OPPORTUNITY`](../50-business-rules/BR-FUNNEL-OPPORTUNITY.md) — campos `entry_*` e `conversion_*`.
- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md).
- [`BR-RBAC`](../50-business-rules/BR-RBAC.md) — `campaign.write`, override manual.
- [`BR-AUDIT`](../50-business-rules/BR-AUDIT.md) — override manual.

## Eventos emitidos

- `TE-CAMPAIGN-CLICK` — a cada clique identificado.
- `TE-FUNNEL-ENTERED` (emitido por FLOW-03; payload inclui `entry_creative_id`/`entry_campaign_id`).
- `TE-OPPORTUNITY-WON` (emitido por FLOW-03; payload inclui `transaction_id`; attribution completa lida em `funnel_entry`).

## Observabilidade

- Métricas:
  - `trackable_link_click_total{campaign_id, creative_id}`;
  - `trackable_link_click_anonymous_total`;
  - `funnel_attribution_entry_total{campaign_id, creative_id}`;
  - `funnel_attribution_conversion_total{campaign_id, creative_id}`;
  - `attribution_window_expired_total`;
  - `cac_by_creative` (deriva).
- Logs (`correlation_id`, `contact_id?`, `trackable_link_id`, `campaign_id`, `creative_id`, `flow='FLOW-14'`).
- Alertas:
  - Axiom: criativos com CTR anormalmente alto/baixo.
  - Sentry: 404 em `slug` de link ativo (possível erro humano na publicação).

## Casos de teste E2E obrigatórios

1. **clique-identificado-emite-evento**
   - Given: contato C autenticado; trackable link L ativo.
   - When: redirect em L com cookie `cne_cid=C.id`.
   - Then: 302 para `destination_url`; `TE-CAMPAIGN-CLICK` emitido com UTMs.

2. **clique-anonimo-resolve-apos-identificacao**
   - Given: sessão anônima clica L; depois contato C se identifica na mesma sessão (login ou form).
   - When: identificação ocorre.
   - Then: job retroativo emite `TE-CAMPAIGN-CLICK` com `occurred_at` do momento do clique original, `contact_id=C.id`.

3. **entry-attribution-last-click**
   - Given: C clicou em criativo A em D-10 e criativo B em D-2; ambos no funil F.
   - When: C entra em F via webhook.
   - Then: `funnel_entry.entry_creative_id=B.id` (last-click).

4. **conversion-attribution-last-click-janela**
   - Given: C clicou em criativo X em D-5 e comprou em D-0 via checkout.
   - When: FLOW-05 aprova e markWon.
   - Then: `conversion_creative_id=X.id`.

5. **fora-da-janela-nao-atribui**
   - Given: C clicou em Y em D-40; compra em D-0 sem cliques recentes.
   - When: markWon.
   - Then: `conversion_origin='direct'`; `conversion_creative_id=NULL`.

6. **override-manual-auditado**
   - Given: funnel_entry won com `conversion_creative_id=X`.
   - When: marketing edita para Y, com reason.
   - Then: UPDATE persiste; `audit_log` registra; evento informativo emitido.

7. **entry-e-conversion-podem-divergir**
   - Given: C entrou no funil por criativo A (D-20); comprou via clique em criativo B (D-1).
   - When: won.
   - Then: `entry_creative_id=A`, `conversion_creative_id=B`.

## Open Questions

- `OQ-FLOW-14-01` — janela de atribuição configurável por marca/funil? Fase 1 global 30d; Fase 2 override por funil.
- `OQ-FLOW-14-02` — evento dedicado `TE-ATTRIBUTION-OVERRIDE` para mudanças manuais ou usar `TE-INTEGRATION-EVENT` genérico? Catálogo hoje não tem o primeiro.
- `OQ-FLOW-14-03` — modelo de atribuição avançado (first-click, linear, time-decay) — Fase 2.
- `OQ-FLOW-14-04` — agregação de `TE-CAMPAIGN-CLICK` por sessão (`OQ-TE-02`) para não inundar timeline.
