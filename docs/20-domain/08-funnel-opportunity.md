# Funnel & Opportunity (Módulo MOD-FUNNEL)

## 1. Finalidade

Modelar a jornada comercial de cada contato em cada funil: oportunidades, estágios, score, etiquetas macro, metas e origem de entrada/conversão. Cada funil vende **uma oferta principal com variações**. Oportunidade é a unidade operacional do comercial.

## 2. Ownership (paralelização)

- Arquivos que POSSUI:
  - `docs/20-domain/08-funnel-opportunity.md`
  - `lib/db/schema/funnel.ts`
  - `lib/domain/funnel/*` (score, transitions)
  - `app/(app)/funnels/**`
- Arquivos que LÊ (read-only):
  - `docs/30-contracts/01-enums.md` (`funnel_opportunity_label`)
  - `docs/30-contracts/03-timeline-event-catalog.md` (TE-FUNNEL-*, TE-OPPORTUNITY-*)
  - `docs/50-business-rules/BR-FUNNEL-OPPORTUNITY.md`
  - `lib/db/schema/contact.ts`, `lib/db/schema/campaign.ts`, `lib/db/schema/offer.ts`, `lib/db/schema/transaction.ts`
- Interfaces públicas expostas:
  - `enterFunnel(input): Promise<FunnelEntry>`
  - `moveStage(entryId, toStageId, reason?): Promise<void>`
  - `setOpportunityLabel(entryId, label): Promise<void>`
  - `markWon(entryId, transactionId): Promise<void>`
  - `markLost(entryId, reason): Promise<void>`
  - `recomputeScore(entryId): Promise<number>`

## 3. Entidades e campos

| Tabela | Finalidade |
|---|---|
| `funnel` | Funil pertencente a marca, aponta para oferta principal. |
| `funnel_stage` | Estágio ordenado dentro do funil. |
| `funnel_entry` | Oportunidade (entrada do contato no funil). |
| `funnel_entry_stage_history` | Histórico append-only de estágio. |
| `funnel_entry_score_history` | Histórico append-only de score. |
| `funnel_score_rule` | Regra de score configurável por funil. |
| `sales_target` | Meta comercial por funil e período. |
| `opportunity_tag` | Tag livre aplicada à oportunidade. |

### DDL sketch

```sql
CREATE TABLE funnel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brand(id),
  offer_id uuid NULL REFERENCES offer(id),        -- oferta principal vendida pelo funil
  name text NOT NULL,
  slug text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT uq_funnel_slug_brand UNIQUE (brand_id, slug)
);

CREATE TABLE funnel_stage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES funnel(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int NOT NULL,
  is_terminal boolean NOT NULL DEFAULT false,     -- "ganho/perdido" estrutural, se o funil quiser
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_funnel_stage_position UNIQUE (funnel_id, position)
);

CREATE TABLE funnel_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES funnel(id),
  contact_id uuid NOT NULL REFERENCES contact(id),
  current_stage_id uuid NOT NULL REFERENCES funnel_stage(id),
  owner_user_id uuid NULL REFERENCES user_account(id),
  label funnel_opportunity_label NOT NULL DEFAULT 'open',
  score numeric(10,2) NOT NULL DEFAULT 0,
  entry_date timestamptz NOT NULL DEFAULT now(),
  entry_origin text NULL,                         -- ex: 'campaign', 'manual', 'import'
  entry_campaign_id uuid NULL REFERENCES campaign(id),
  entry_creative_id uuid NULL REFERENCES creative(id),
  conversion_origin text NULL,
  conversion_campaign_id uuid NULL REFERENCES campaign(id),
  conversion_creative_id uuid NULL REFERENCES creative(id),
  transaction_id uuid NULL REFERENCES transaction(id),   -- preenchido quando won
  lost_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Invariante INV-FUNNEL-01: 1 oportunidade ATIVA por (contact_id, funnel_id)
CREATE UNIQUE INDEX uq_funnel_entry_active
  ON funnel_entry (contact_id, funnel_id)
  WHERE label NOT IN ('won','lost');

CREATE TABLE funnel_entry_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_entry_id uuid NOT NULL REFERENCES funnel_entry(id),
  from_stage_id uuid NULL REFERENCES funnel_stage(id),
  to_stage_id uuid NOT NULL REFERENCES funnel_stage(id),
  changed_by uuid NULL REFERENCES user_account(id),
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE funnel_entry_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_entry_id uuid NOT NULL REFERENCES funnel_entry(id),
  from_score numeric(10,2) NULL,
  to_score numeric(10,2) NOT NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE funnel_score_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES funnel(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_kind text NOT NULL,          -- ex: 'message_inbound', 'click', 'stage_entered:<stage_id>'
  delta numeric(10,2) NOT NULL,      -- +10, -5, etc.
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sales_target (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES funnel(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  target_count int NULL,
  target_revenue numeric(12,2) NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE opportunity_tag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_entry_id uuid NOT NULL REFERENCES funnel_entry(id) ON DELETE CASCADE,
  tag text NOT NULL,
  applied_by uuid NULL REFERENCES user_account(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_opportunity_tag UNIQUE (funnel_entry_id, tag)
);
```

Append-only triggers em `funnel_entry_stage_history` e `funnel_entry_score_history`.

## 4. Relações (ASCII)

```
brand ──< funnel ──< funnel_stage
           │
           ├──< funnel_entry >── contact
           │        │
           │        ├──? campaign (entry/conversion)
           │        ├──? creative (entry/conversion)
           │        ├──? transaction (won)
           │        ├──< funnel_entry_stage_history
           │        ├──< funnel_entry_score_history
           │        └──< opportunity_tag
           │
           ├──< funnel_score_rule
           └──< sales_target
```

## 5. Invariantes (INV-FUNNEL-NN)

- `INV-FUNNEL-01`: para cada par `(contact_id, funnel_id)` existe **no máximo uma** `funnel_entry` com `label NOT IN ('won','lost')`. Enforce por índice único parcial.
- `INV-FUNNEL-02`: `funnel.offer_id` é a oferta principal do funil; variações da oferta são modeladas via `offer_condition` (ver MOD-OFFER).
- `INV-FUNNEL-03`: toda mudança de `current_stage_id` gera linha em `funnel_entry_stage_history` e emite `TE-FUNNEL-STAGE-CHANGED`.
- `INV-FUNNEL-04`: toda mudança de `score` gera linha em `funnel_entry_score_history`.
- `INV-FUNNEL-05`: `label='won'` exige `transaction_id IS NOT NULL`; `label='lost'` exige `lost_reason IS NOT NULL`.
- `INV-FUNNEL-06`: `conversion_*` só é preenchido quando `label` transita para `won`.

## 6. Estados e transições

`funnel_opportunity_label` (macro):

```
open ──► negotiating ──► concluded
  │          │              │
  │          ▼              ▼
  └────────► won (via compra)  OR  lost
```

Estágio (`funnel_stage`) é dinâmico por funil; não há transição imposta pelo sistema — qualquer estágio pode ir para qualquer outro (registrado em histórico). A **ordem** (`position`) é só para UX de pipeline.

## 7. Regras de negócio referenciadas

- [BR-FUNNEL-OPPORTUNITY](../50-business-rules/BR-FUNNEL-OPPORTUNITY.md)
- [BR-OFFER-DECISION](../50-business-rules/BR-OFFER-DECISION.md) (usado quando oferta é aplicada na conversão)
- [BR-RBAC](../50-business-rules/BR-RBAC.md) (marketing/comercial criam funis; comercial movimenta oportunidades)
- [BR-TIMELINE](../50-business-rules/BR-TIMELINE.md)

## 8. Eventos de timeline emitidos

- `TE-FUNNEL-ENTERED`
- `TE-FUNNEL-STAGE-CHANGED`
- `TE-OPPORTUNITY-LABEL-CHANGED`
- `TE-OPPORTUNITY-WON`
- `TE-OPPORTUNITY-LOST`

## 9. Fluxos relacionados

- `FLOW-FUNNEL-ENTRY`: contato entra em funil via automação/campanha → cria `funnel_entry` → emite `TE-FUNNEL-ENTERED`.
- `FLOW-FUNNEL-STAGE-CHANGE`: usuário ou automação move estágio → persiste transição → pode disparar automação (gatilho `funnel_stage_change`).
- `FLOW-FUNNEL-WON`: compra aprovada da oferta do funil → `markWon(entry, transactionId)` → preenche `conversion_*` e `transaction_id` → `TE-OPPORTUNITY-WON`.
- `FLOW-FUNNEL-WON-OFFCHANNEL`: contato compra por outro caminho; operador marca manualmente won vinculando `transaction_id`.

## 10. Casos de teste obrigatórios

1. **Unicidade de oportunidade ativa**: `enterFunnel({contact:C, funnel:F})` 2x seguidas — segunda chamada retorna/atualiza a mesma `funnel_entry` (ou rejeita), não cria duplicata.
2. **Mudança de estágio emite evento**: `moveStage(entry, stage2)` persiste histórico e emite `TE-FUNNEL-STAGE-CHANGED`.
3. **markWon exige transação**: `markWon(entry, null)` rejeitado; com `transaction_id` válido preenche `conversion_*` e emite `TE-OPPORTUNITY-WON`.
4. **markLost exige motivo**: `markLost(entry, '')` rejeitado.
5. **Score recalculado**: regra ativa `event_kind='message_inbound'` com delta +5; mensagem inbound do contato em funil X aumenta score e registra em history.
6. **Múltiplos funis**: contato pode ter `funnel_entry` ativa em F1 e F2 simultaneamente (não viola INV-FUNNEL-01).
7. **Compra off-channel**: contato sem `funnel_entry` ativa; operador marca manualmente `won` em oportunidade fechada anterior com nova `transaction_id` — aceito (regra de `BR-FUNNEL-OPPORTUNITY`).

## 11. Open Questions

- `OQ-FUNNEL-01`: ao mover para estágio `is_terminal=true`, sistema deve auto-sugerir `label=concluded`?
- `OQ-FUNNEL-02`: score negativo é válido? Limite inferior?
- `OQ-FUNNEL-03`: regras de score cruzando eventos de outros módulos (ex.: `sale_pending`) — DSL interna ou expressão SQL?
