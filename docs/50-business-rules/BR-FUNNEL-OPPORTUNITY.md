# BR-FUNNEL-OPPORTUNITY: oportunidade em funil

## Enunciado

1. **Uma oportunidade ativa por par contato × funil.** Para `(contact_id, funnel_id)` existe no máximo 1 `funnel_entry` com `label NOT IN ('won','lost')`.
2. **Compra aprovada conclui a oportunidade.** Quando uma `transaction` da oferta principal do funil é aprovada para o contato, o sistema marca a oportunidade ativa como `won` e preenche:
   - `transaction_id` com a transação aprovada;
   - `conversion_origin`, `conversion_campaign_id`, `conversion_creative_id` a partir do contexto da compra (clique de entrada mais recente, checkout, ou atribuição manual).
3. **Compra off-channel permite marcação manual.** Se o contato comprar a oferta do funil por outro caminho (sem funil_entry ativa, ou via funil diferente), um operador pode marcar manualmente uma oportunidade existente ou criar/reativar uma como `won` referenciando a `transaction_id` da compra.
4. **Score é configurável por funil.** Regras em `funnel_score_rule` disparam deltas de score quando eventos específicos ocorrem. Toda mudança de score gera linha em `funnel_entry_score_history`.
5. **Mudança de estágio é observável.** Cada transição de `current_stage_id` persiste em `funnel_entry_stage_history`, emite `TE-FUNNEL-STAGE-CHANGED` e é elegível como gatilho de automação (`automation_trigger_kind = 'funnel_stage_change'`).
6. **Etiqueta macro é independente do estágio.** `funnel_opportunity_label` (open, negotiating, concluded, won, lost) descreve a fase macro e é definida manualmente ou por automação; o estágio dinâmico do funil não impõe a etiqueta.

## Motivação

Evitar duplicação de trabalho comercial no mesmo par contato×funil. Garantir que toda venda aprovada feche ciclo comercial e alimente aferição de origem de conversão. Permitir marcação manual para casos off-channel. Score configurável reflete o modelo de cada funil sem hardcoded.

## Escopo

- Módulos: [MOD-FUNNEL](../20-domain/08-funnel-opportunity.md), [MOD-TRANSACTION](../20-domain/11-transaction-snapshot.md).
- Entidades: `funnel`, `funnel_entry`, `funnel_entry_stage_history`, `funnel_entry_score_history`, `funnel_score_rule`, `transaction`.

## Enforcement

- [x] DB constraint (SQL) — índice único parcial em `funnel_entry(contact_id, funnel_id) WHERE label NOT IN ('won','lost')`.
- [x] DB trigger — append-only em histórico de estágio e score.
- [x] Função de domínio pura — `enterFunnel`, `moveStage`, `markWon`, `markLost`, `recomputeScore`.
- [x] Guard em Server Action — `markWon` exige `transaction_id`; `markLost` exige `lost_reason`.
- [ ] Guard em UI — bloqueia duplo-clique de criação.

## Contrato TS

```ts
export async function enterFunnel(input: {
  contactId: string;
  funnelId: string;
  entryOrigin?: string;
  entryCampaignId?: string;
  entryCreativeId?: string;
  initialStageId?: string;
  ownerUserId?: string;
}): Promise<{ entry: FunnelEntry; created: boolean }>;

export async function moveStage(
  entryId: string,
  toStageId: string,
  ctx: { userId?: string; reason?: string }
): Promise<void>;

export async function markWon(
  entryId: string,
  transactionId: string,
  conversion?: Partial<ConversionContext>
): Promise<void>;

export async function markLost(
  entryId: string,
  reason: string
): Promise<void>;

export async function recomputeScore(entryId: string): Promise<number>;
```

`markWon` é idempotente: chamar 2x com mesmo `transactionId` em oportunidade já `won` é no-op.

## DDL / constraint SQL

```sql
CREATE UNIQUE INDEX uq_funnel_entry_active
  ON funnel_entry (contact_id, funnel_id)
  WHERE label NOT IN ('won','lost');

ALTER TABLE funnel_entry
  ADD CONSTRAINT ck_won_requires_tx
  CHECK (label <> 'won' OR transaction_id IS NOT NULL);

ALTER TABLE funnel_entry
  ADD CONSTRAINT ck_lost_requires_reason
  CHECK (label <> 'lost' OR lost_reason IS NOT NULL);
```

## Casos de teste

1. **CT-FUNNEL-01 — Unicidade ativa**
   - Dado: oportunidade ativa `E1` em `(C, F)`.
   - Quando: `enterFunnel({contactId:C, funnelId:F})` novamente.
   - Então: retorna `{created:false, entry:E1}`; nenhuma nova linha criada.

2. **CT-FUNNEL-02 — Compra fecha oportunidade**
   - Dado: `E1` ativa em funil F cuja `offer_id=O`.
   - Quando: `MOD-TRANSACTION` aprova transação T para contato C sobre oferta O e chama `markWon(E1, T.id)`.
   - Então: `E1.label='won'`, `transaction_id=T.id`, `conversion_*` preenchido, emitido `TE-OPPORTUNITY-WON`.

3. **CT-FUNNEL-03 — Compra off-channel manual**
   - Dado: contato C com `E1` fechada como `lost` em F; compra aprovada via outro caminho.
   - Quando: operador cria nova `funnel_entry` em F e chama `markWon` com a `transaction_id` da compra off-channel.
   - Então: nova oportunidade registrada como `won`; histórico preservado.

4. **CT-FUNNEL-04 — markWon exige transação**
   - Dado: `E1` ativa.
   - Quando: `markWon(E1, null)`.
   - Então: erro `WonRequiresTransactionError`.

5. **CT-FUNNEL-05 — Mudança de estágio dispara automação**
   - Dado: fluxo de automação ativo com trigger `funnel_stage_change` filtrando `funnel_id=F`.
   - Quando: `moveStage(E1, stage2)` executa.
   - Então: linha em histórico, `TE-FUNNEL-STAGE-CHANGED` emitido, `automation_execution` criada.

6. **CT-FUNNEL-06 — Score atualizado por regra**
   - Dado: `funnel_score_rule(event_kind='message_inbound', delta=+5)` ativa em F.
   - Quando: mensagem inbound do contato C (com `funnel_entry` ativa em F) é registrada.
   - Então: `E1.score` aumenta em 5; linha em `funnel_entry_score_history`.

## Rastreabilidade

- Teste esperado: `tests/unit/funnel/*`, `tests/integration/funnel/won-on-approved-sale.test.ts`.
- Referenciada em: [MOD-FUNNEL](../20-domain/08-funnel-opportunity.md), [MOD-TRANSACTION](../20-domain/11-transaction-snapshot.md), [MOD-AUTOMATION](../20-domain/15-automation.md).

## Open Questions

- `OQ-BR-FUNNEL-01`: quando 2 funis vendem a mesma oferta, qual oportunidade fecha ao aprovar a venda? (Prioridade por `entry_date` mais recente? Por origem da transação?)
- `OQ-BR-FUNNEL-02`: reabertura de oportunidade `lost` em caso de retomada comercial — permitida ou exige nova entrada?
