# Interfaces públicas dos módulos

Contrato fixo de interoperação entre módulos. Cada módulo do CNE-OS expõe um conjunto pequeno e estável de funções públicas que outros módulos consomem. Toda interação cruza a interface; **nunca** via SELECT direto em tabela alheia.

> **Regra de ouro:** se sua tarefa precisa de dado de outro módulo, chame a interface pública. Se a interface não existe, abra [OQ](../90-meta/03-open-questions-log.md) e serialize a mudança no contrato — nunca faça query ad-hoc em tabela de outro módulo.

## Princípios

1. **Ownership rígido.** Cada tabela pertence a um módulo (ver `Ownership` no doc de cada agregado em `../20-domain/`). Escrita nesta tabela só via funções desse módulo.
2. **Leitura também cruza interface.** Listagens, joins cross-module e projeções só via função pública (ou view materializada explicitamente publicada).
3. **Interface = TypeScript assinado.** Toda função pública tem assinatura em arquivo `lib/domain/<mod>/index.ts` ou `actions.ts`.
4. **Transação compartilhada.** Funções que mutam aceitam `tx: DbTx` opcional ou obrigatório, para compor atomicidade com a Server Action chamadora.
5. **Sem I/O oculto.** Funções puras de domínio ficam em `lib/domain/<mod>/` e não têm efeito externo. Orquestração vai para `actions.ts` ou Inngest.

## Formato por função

| Campo | Uso |
|---|---|
| Assinatura | TypeScript completo, com tipos nomeados |
| Onde vive | caminho do arquivo |
| Contrato | pré e pós-condições |
| BRs | regras reforçadas |

---

## MOD-ORGANIZATION

Onde vive: `lib/domain/organization/index.ts`.

### `listBrandsForUser`

```ts
export async function listBrandsForUser(userId: string): Promise<Brand[]>;
```
- **Contrato:** retorna marcas visíveis ao usuário (Fase 1: todas).
- **BRs:** [BR-RBAC](../50-business-rules/BR-RBAC.md).

### `resolveLegalEntityForSale`

```ts
export async function resolveLegalEntityForSale(
  brandId: string,
  offerId: string,
): Promise<LegalEntity>;
```
- **Contrato:** usado por MOD-TRANSACTION para carimbar snapshot. Resolve CNPJ emissor da nota.
- **BRs:** [BR-SNAPSHOT-IMMUTABILITY](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md).

### `hasRole`

```ts
export function hasRole(userId: string, role: RoleKind): Promise<boolean>;
```

---

## MOD-CONTACT

Onde vive: `lib/domain/contact/index.ts` + `app/(app)/contacts/actions.ts`.

### `resolveContactIdentity`

```ts
export type IdentityInput = {
  brandId: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  cpf?: string | null;
};

export type IdentityResolution = {
  matchedContactId: string | null;
  confidence: 'exact' | 'strong' | 'weak' | 'none';
  conflict: boolean;            // true quando múltiplos matches fortes divergentes
  candidates: { contactId: string; reason: string }[];
};

export async function resolveContactIdentity(
  tx: DbTx,
  input: IdentityInput,
): Promise<IdentityResolution>;
```
- **Pré:** input já normalizado (e-mail lowercase, phone E.164, CPF 11 dígitos).
- **Pós:** não cria contato; apenas resolve.
- **BRs:** [BR-IDENTITY](../50-business-rules/BR-IDENTITY.md).

### `classifyContact`

```ts
export async function classifyContact(
  contactId: string,
): Promise<ContactClassification>;
```
- **Pós:** retorna classificação derivada (`lead`/`customer`/`student`/`paid_lead`) sem persistir.
- **BRs:** [BR-CONTACT-CLASSIFICATION](../50-business-rules/BR-CONTACT-CLASSIFICATION.md).

### `upsertContact`

```ts
export type UpsertContactInput = IdentityInput & {
  origin: 'checkout' | 'message' | 'import' | 'manual' | 'integration';
  sourceRef?: string | null;
};

export async function upsertContact(
  tx: DbTx,
  input: UpsertContactInput,
): Promise<Contact>;
```
- **Pós:** cria ou reaproveita contato; emite `TE-CONTACT-CREATED` (quando novo) ou nada.
- **BRs:** [BR-IDENTITY](../50-business-rules/BR-IDENTITY.md).

### `addTag`, `removeTag`

```ts
export async function addTag(
  tx: DbTx,
  contactId: string,
  tag: string,
  source: 'manual' | 'benefit' | 'automation',
): Promise<void>;

export async function removeTag(
  tx: DbTx,
  contactId: string,
  tag: string,
): Promise<void>;
```
- **Pós:** emite `TE-CONTACT-TAG-ADDED` / `TE-CONTACT-TAG-REMOVED`.

### `changeContactStatus`

```ts
export async function changeContactStatus(
  tx: DbTx,
  contactId: string,
  to: ContactStatus,
  reason: string,
  actorUserId: string,
): Promise<void>;
```
- **Pós:** insere em `contact_status_history`; emite `TE-CONTACT-UPDATED` ou `TE-CONTACT-BLACKLISTED`.

### `openIssue`, `resolveIssue`

```ts
export async function openIssue(
  tx: DbTx,
  input: {
    contactId: string;
    kind: ContactIssueKind;
    detail: string;
  },
): Promise<ContactIssue>;

export async function resolveIssue(
  tx: DbTx,
  issueId: string,
  resolution: string,
): Promise<void>;
```
- **Pós:** emite `TE-CONTACT-ISSUE-OPENED` / `TE-CONTACT-ISSUE-RESOLVED`.

---

## MOD-MERGE

Onde vive: `lib/domain/merge/index.ts`.

### `mergeContacts`

```ts
export type MergeResult = {
  mergeId: string;
  principalId: string;
  secondaryId: string;
};

export async function mergeContacts(
  tx: DbTx,
  input: {
    principalId: string;
    secondaryId: string;
    reason: string;
    actorUserId: string;
  },
): Promise<MergeResult>;
```
- **Pré:** `principalId !== secondaryId`; ambos existem e não estão blacklisted.
- **Pós:** secondary aponta para principal via `merged_into_id`; histórico preservado (não destrutivo); emite `TE-CONTACT-MERGED`.
- **BRs:** [BR-MERGE](../50-business-rules/BR-MERGE.md). **Proibido** destruir o contato secundário.

### `unmergeContacts`

```ts
export async function unmergeContacts(
  tx: DbTx,
  mergeId: string,
  actorUserId: string,
): Promise<void>;
```
- **Pós:** emite `TE-CONTACT-UNMERGED`; audita (`action_kind='unmerge'`).

---

## MOD-TIMELINE

Onde vive: `lib/timeline/emit.ts`.

### `emitTimelineEvent` (canônico — ÚNICO ponto de escrita)

```ts
export type TimelineEventInput = {
  contactId: string;
  brandId?: string | null;
  kind: string;                    // 'sale_approved', 'contact_merged', ...
  source: string;                  // MOD-* emissor
  actorUserId?: string | null;
  actorSystem?: string | null;
  subjectKind?: string | null;
  subjectId?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
};

export async function emitTimelineEvent(
  tx: DbTx,
  input: TimelineEventInput,
): Promise<TimelineEvent>;
```
- **Pré:** `actorUserId || actorSystem` truthy.
- **Pós:** linha em `timeline_event`; tabela append-only (trigger).
- **BRs:** ver [`03-timeline-event-catalog.md`](./03-timeline-event-catalog.md). **Proibido** escrever em `timeline_event` por qualquer outra função.

### `listTimelineEvents`

```ts
export async function listTimelineEvents(
  contactId: string,
  filters: {
    brandId?: string;
    kinds?: string[];
    channel?: ChannelKind;
    from?: Date;
    to?: Date;
    cursor?: string;
    limit?: number;
  },
): Promise<{ items: TimelineEvent[]; nextCursor: string | null }>;
```

---

## MOD-INBOX

Onde vive: `lib/domain/inbox/index.ts`.

### `openOrReopenConversation`

```ts
export type OpenConversationInput = {
  contactId: string;
  channelAccountId: string;
  externalThreadId?: string | null;
  actorSystem?: string;
  actorUserId?: string | null;
};

export async function openOrReopenConversation(
  tx: DbTx,
  input: OpenConversationInput,
): Promise<Conversation>;
```
- **Pós:** se conversa ativa (`status != 'closed'`) já existe para `(contactId, channelAccountId)` → retorna idempotentemente. Se fechada → reabre (`TE-CONVERSATION-REOPENED`). Se não existe → cria (`TE-CONVERSATION-OPENED`).
- `actorUserId` é nullable — operações de sistema (webhooks) passam apenas `actorSystem`.

### `appendMessage`

```ts
export type AppendMessageInput = {
  conversationId: string;
  direction: 'inbound' | 'outbound';
  body: string;
  externalMessageId?: string | null;
  actorUserId?: string | null;
  actorSystem?: string | null;
  sentAt?: Date | null;
};

export async function appendMessage(
  tx: DbTx,
  input: AppendMessageInput,
): Promise<Message>;
```
- **Pós:** emite `TE-MESSAGE-INBOUND` ou `TE-MESSAGE-OUTBOUND`.
- **BRs:** [BR-INTEGRATION-IDEMPOTENCY](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md) quando `externalMessageId` informado.
- **Proibido:** outbound em conversa `closed` lança `ConversationClosedError`.

### `setConversationStatus`

```ts
export async function setConversationStatus(
  tx: DbTx,
  conversationId: string,
  toStatus: 'open' | 'waiting_customer' | 'waiting_team' | 'closed',
  changedByUserId: string | null,
  reason?: string | null,
): Promise<Conversation>;
```
- **Transições válidas:** `open→waiting_*`, `open→closed`, `waiting_*→open`, `waiting_*→closed`, `closed→open`.
- Transição inválida lança `InvalidConversationTransitionError`.

---

## MOD-TICKET

Onde vive: `lib/domain/ticket/index.ts`.

### `openTicket`

```ts
export async function openTicket(
  tx: DbTx,
  input: {
    contactId: string;
    brandId: string;
    category: TicketCategory;
    priority: TicketPriority;
    title: string;
    description: string;
    openedByUserId: string;
  },
): Promise<Ticket>;
```
- **Pós:** emite `TE-TICKET-OPENED`.

### `changeTicketStatus`

```ts
export async function changeTicketStatus(
  tx: DbTx,
  ticketId: string,
  to: TicketStatus,
  reason?: string,
  actorUserId?: string,
): Promise<void>;
```
- **Pós:** insere `ticket_status_history`; emite `TE-TICKET-STATUS-CHANGED` / `TE-TICKET-RESOLVED` / `TE-TICKET-REOPENED`.

### `assignTicket`

```ts
export async function assignTicket(
  tx: DbTx,
  ticketId: string,
  userId: string,
): Promise<void>;
```

---

## MOD-CAMPAIGN

Onde vive: `lib/domain/campaign/index.ts` + `app/(app)/campaigns/actions.ts`.

### `generateUtm` (pura)

```ts
export type UtmContext = {
  brand: { slug: string };
  campaign: { slug: string };
  creative?: { slug: string; channel?: string };
  funnel?: { slug: string };
  mediumOverride?: string;
};

export type Utm = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content?: string;
  utm_term?: string;
};

export function generateUtm(ctx: UtmContext): Utm;
```
- **Determinismo:** INV-CAMPAIGN-04 — mesmos inputs sempre produzem o mesmo output.
- **Regras:** utm_source=brand.slug, utm_medium=mediumOverride || creative.channel || 'organic', utm_campaign=campaign.slug, utm_content=creative.slug (opcional), utm_term=funnel.slug (opcional).

### `createCampaign`

```ts
export async function createCampaign(
  input: {
    brandId: string;
    funnelId: string;
    name: string;
    slug: string;
    startsAt?: Date;
    endsAt?: Date;
  },
): Promise<Campaign>;
```
- **Pós:** persiste campanha; emite `TE-CAMPAIGN-CREATED` (quando implementado).
- **BRs:** INV-CAMPAIGN-01 (brand + funnel obrigatórios).

### `createCreative`

```ts
export async function createCreative(
  input: {
    campaignId: string;
    name: string;
    slug: string;
    channel?: string;
  },
): Promise<Creative>;
```
- **Pós:** persiste criativo; emite `TE-CREATIVE-CREATED` (quando implementado).
- **BRs:** INV-CAMPAIGN-02 (pertence a exatamente 1 campaign).

### `issueTrackableLink`

```ts
export async function issueTrackableLink(
  tx: DbTx,
  input: {
    brandId: string;
    funnelId?: string;
    campaignId?: string;
    creativeId?: string;
    destinationUrl: string;
    slug?: string;
  },
): Promise<TrackableLink>;
```
- **Pós:** gera slug curto (ou usa fornecido); calcula UTM via `generateUtm`; persiste snapshot em jsonb.
- **BRs:** INV-CAMPAIGN-03 (slug globalmente único).

### `recordClick`

```ts
export async function recordClick(
  tx: DbTx,
  input: {
    trackableLinkId: string;
    contactId?: string;
    utm: Utm;
    userAgent?: string;
    ip?: string;
  },
): Promise<void>;
```
- **Pós:** emite `TE-CAMPAIGN-CLICK` quando `contactId` resolvível (via webhook `/go/[slug]` assíncrono).

---

## MOD-FUNNEL

Onde vive: `lib/domain/funnel/index.ts` + `app/(app)/funnels/actions.ts`.

### `enterFunnel`

```ts
export async function enterFunnel(
  tx: DbTx,
  input: {
    contactId: string;
    funnelId: string;
    entryCampaignId?: string;
    entryCreativeId?: string;
  },
): Promise<FunnelEntry>;
```
- **Pós:** se oportunidade ativa já existe para (contact, funnel) → retorna a existente (idempotente). Senão cria nova.
- **Emite:** `TE-FUNNEL-ENTERED`.
- **BRs:** INV-FUNNEL-01 (máximo uma ativa por (contact, funnel)).

### `moveStage`

```ts
export async function moveStage(
  tx: DbTx,
  entryId: string,
  toStageId: string,
  reason?: string,
): Promise<void>;
```
- **Pós:** atualiza `current_stage_id`; insere linha em `funnel_entry_stage_history`.
- **Emite:** `TE-FUNNEL-STAGE-CHANGED`.
- **BRs:** INV-FUNNEL-03 (toda mudança registra em histórico e emite TE).

### `setOpportunityLabel`

```ts
export async function setOpportunityLabel(
  tx: DbTx,
  input: {
    entryId: string;
    label: FunnelOpportunityLabel;
    actorUserId?: string | null;
    actorSystem?: string | null;
  },
): Promise<void>;
```
- **Pós:** atualiza `label` (macro); emite `TE-OPPORTUNITY-LABEL-CHANGED`.
- **Nota:** labels `won` e `lost` têm restrições adicionais (INV-FUNNEL-05: `won` exige `transaction_id`, `lost` exige `lost_reason`); use `markWon` / `markLost` para fluxos controlados.

### `markWon`, `markLost`

```ts
export async function markWon(
  tx: DbTx,
  entryId: string,
  transactionId: string,
): Promise<void>;

export async function markLost(
  tx: DbTx,
  entryId: string,
  reason: string,
): Promise<void>;
```
- **Pós:** `markWon` preenche `transaction_id` e `conversion_*` (campaign/creative); `markLost` preenche `lost_reason`.
- **Emite:** `TE-OPPORTUNITY-WON` / `TE-OPPORTUNITY-LOST`.
- **BRs:** INV-FUNNEL-05, INV-FUNNEL-06 (transição para `won`/`lost`).

### `updateScore` (alias: `recomputeScore`)

```ts
export async function updateScore(
  tx: DbTx,
  entryId: string,
): Promise<number>;

export async function recomputeScore(
  tx: DbTx,
  entryId: string,
): Promise<number>;
```
- **Pós:** recalcula score a partir das regras ativas (`funnel_score_rule`); insere linha em `funnel_entry_score_history`.
- **Retorna:** novo score.
- **BRs:** INV-FUNNEL-04 (toda mudança de score registra em histórico).

---

## MOD-CATALOG

Onde vive: `lib/domain/catalog/index.ts`.

### `normalizeSlug` (pura)

```ts
export function normalizeSlug(input: string): string;
```
- **Contrato:** converte qualquer string para kebab-case (lowercase, hífens únicos, sem caracteres especiais).
- **Pós:** string pronta para validação; não lança erro.
- **BRs:** INV-CATALOG-03, INV-CATALOG-06.

### `validateSlug` (pura)

```ts
export function validateSlug(slug: string): boolean;
```
- **Contrato:** retorna `true` se o slug já normalizado bate com `^[a-z0-9][a-z0-9-]*$`.
- **Pura:** sem I/O.

### `ensureValidSlug` (pura)

```ts
export function ensureValidSlug(input: string): string;
```
- **Contrato:** normaliza o input e valida; retorna slug válido.
- **Pós:** lança `InvalidSlugError` se normalizado não passar em `validateSlug`.
- **BRs:** INV-CATALOG-03, INV-CATALOG-06.

### `resolveAutoTag` (pura)

```ts
export type AutoTagInput = {
  auto_tag: string | null | undefined;
};

export function resolveAutoTag(benefit: AutoTagInput): string | null;
```
- **Contrato:** extrai `auto_tag` de um benefício comercial; retorna `null` se vazio, undefined ou null.
- **Pura:** sem I/O.
- **Consumidor:** MOD-TRANSACTION ao aprovar venda com benefício.
- **BRs:** FLOW-BENEFIT-AUTO-TAG.

### Tipos de erro

```ts
export class CatalogDomainError extends Error;
export class InvalidSlugError extends CatalogDomainError;
```

### Leitura (Server Actions — T-6-04)

`upsertProduct`, `upsertBenefit`, `getProduct`, `getCommercialBenefit` serão expostas em T-6-04 quando Server Actions forem implementadas.

---

## MOD-OFFER

Onde vive: `lib/domain/offer/index.ts`. **Módulo crítico.**

### `evaluateEligibility` (pura)

```ts
export type EligibilityContext = {
  now: Date;
  contactId: string;
  campaignId?: string;
  creativeId?: string;
  channel?: 'whatsapp' | 'instagram' | 'email';
  salesCount?: number;              // valor atual de offer_sales_counter.approved_count
  isInternalUse?: boolean;
};

export type RuleGroup = {
  id: string;
  operator: 'and' | 'or';
  rules: Rule[];
  children: RuleGroup[];
};

export type Rule = {
  id: string;
  kind: 'date_range' | 'sales_count_reached' | 'campaign' | 'channel' | 'creative' | 'internal_use';
  params: unknown;
};

export function evaluateEligibility(group: RuleGroup, ctx: EligibilityContext): boolean;
export function evaluateRuleGroup(group: RuleGroup, ctx: EligibilityContext): boolean;
export function evaluateRule(rule: Rule, ctx: EligibilityContext): boolean;
```
- **Contrato:** avalia regra/grupo recursivamente contra contexto; retorna `true` se elegível.
- **Pura:** sem I/O, sem DB.
- **BRs:** [BR-OFFER-ELIGIBILITY](../50-business-rules/BR-OFFER-ELIGIBILITY.md).

### `selectCondition` (CRÍTICO)

```ts
export type EligibleCondition = {
  id: string;
  priority: number;
  advantageScore: number;
  createdAt: Date;
  isDefault: boolean;
};

export type SelectConditionResult =
  | { kind: 'selected'; conditionId: string }
  | { kind: 'default'; conditionId: string }
  | { kind: 'conflict'; conditionIds: string[] }
  | { kind: 'none' };

export function selectCondition(
  conditions: EligibleCondition[],
): SelectConditionResult;
```
- **Contrato:** dado lista de condições elegíveis, seleciona 1 via desempate (priority DESC → advantageScore DESC → createdAt DESC).
- **Pura:** sem I/O, sem DB.
- **Pós:** `kind='selected'` → vencedor único; `kind='default'` → nenhum candidato mas default existe; `kind='conflict'` → 2+ empatados em tudo; `kind='none'` → nenhum candidato e sem default.
- **BRs:** [BR-OFFER-DECISION](../50-business-rules/BR-OFFER-DECISION.md).

### `incrementSalesCounter`

```ts
export async function incrementSalesCounter(
  tx: DbTx,
  offerId: string,
): Promise<number>;
```
- **Contrato:** incrementa atomicamente `offer_sales_counter.approved_count` via `UPDATE ... RETURNING`.
- **Pré:** chamado **dentro** da transação da venda (atomicidade com `approveTransaction`).
- **Pós:** retorna novo valor de `approved_count`; lança `OfferCounterNotFoundError` se linha não existe (oferta sem seed).
- **BRs:** [BR-OFFER-DECISION](../50-business-rules/BR-OFFER-DECISION.md) contador; [ADR-07](../90-meta/04-decision-log.md) (aceita excesso em race).

### `recordPriorityChange`

```ts
export type RecordPriorityChangeInput = {
  conditionId: string;
  previousPriority: number;
  newPriority: number;
  previousAdvantageScore: number;
  newAdvantageScore: number;
  changedByUserId: string;
};

export async function recordPriorityChange(
  tx: DbTx,
  input: RecordPriorityChangeInput,
): Promise<void>;
```
- **Contrato:** insere linha em `offer_condition_priority_history` registrando mudança.
- **Pós:** lança `NoPriorityChangeError` se nenhum campo mudou de fato (sem-op).
- **BRs:** INV-OFFER-02 (histórico append-only).

### `guardLegalEntityImmutable`

```ts
export async function guardLegalEntityImmutable(
  tx: DbTx,
  offerId: string,
  newLegalEntityId: string,
): Promise<void>;
```
- **Contrato:** verifica que `issuing_legal_entity_id` pode ser alterado; lança se houver transação approved/pending.
- **Comportamento atual (pré-Sprint 8):** retorna imediatamente se tabela `transaction` não existe (stub).
- **Pós:** lança `OfferLegalEntityImmutableError` se há transação blocking.
- **BRs:** INV-OFFER-03.

### Tipos de erro

```ts
export class OfferDomainError extends Error;
export class OfferCounterNotFoundError extends OfferDomainError;
export class OfferLegalEntityImmutableError extends OfferDomainError;
export class NoPriorityChangeError extends OfferDomainError;
```

---

## MOD-TRANSACTION

Onde vive: `lib/domain/transaction/index.ts`.

### `createTransaction`

```ts
export type CreateTransactionInput = {
  contactId: string;
  brandId: string;
  offerId: string;
  conditionId: string;
  amount: string;                  // numeric(12,2) como string
  paymentMethod: OfferPaymentMethod;
  externalRef?: string;
};

export async function createTransaction(
  tx: DbTx,
  input: CreateTransactionInput,
): Promise<Transaction>;
```
- **Pós:** transação `pending`; emite `TE-SALE-PENDING`.

### `approveTransaction`

```ts
export async function approveTransaction(
  tx: DbTx,
  transactionId: string,
  externalRef?: string,
): Promise<Transaction>;
```
- **Pós atômico:** `status='approved'` + `createSnapshot` + `incrementSalesCounter` + `grantEntitlement` (via MOD-ENTITLEMENT) + `TE-SALE-APPROVED`.
- **BRs:** [BR-SNAPSHOT-IMMUTABILITY](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md).

### `refuseTransaction`

```ts
export async function refuseTransaction(
  tx: DbTx,
  transactionId: string,
  reason: string,
): Promise<Transaction>;
```
- **Pós:** emite `TE-SALE-REFUSED`.

### `createSnapshot` (internal)

```ts
// Apenas chamável de dentro de MOD-TRANSACTION. Não exportado.
async function createSnapshot(tx: DbTx, transactionId: string): Promise<TransactionSnapshot>;
```
- **Pós:** snapshot em `transaction_snapshot` imutável ([BR-SNAPSHOT-IMMUTABILITY](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md)).

---

## MOD-ENTITLEMENT

Onde vive: `lib/domain/entitlement/index.ts`.

### `grantEntitlement`

```ts
export async function grantEntitlement(
  tx: DbTx,
  input: {
    contactId: string;
    kind: EntitlementKind;
    refId: string;                 // ex.: product_id ou benefit_id
    sourceTransactionId: string;
    endsAt?: Date | null;
  },
): Promise<Entitlement>;
```
- **Pós:** emite `TE-ENTITLEMENT-GRANTED` ou `TE-ENTITLEMENT-EXTENDED`.

### `consolidateEntitlement` (pura)

```ts
export function consolidateEntitlement(
  existing: Entitlement | null,
  incoming: Omit<Entitlement, 'id' | 'createdAt'>,
): ConsolidationResult;
```
- Função pura, testável sem DB.

### `revokeEntitlement`

```ts
export async function revokeEntitlement(
  tx: DbTx,
  entitlementId: string,
  reason: string,
): Promise<void>;
```
- **Pós:** emite `TE-ENTITLEMENT-REVOKED`.

---

## MOD-BILLING

Onde vive: `lib/domain/billing/index.ts`.

### `startSubscription`

```ts
export async function startSubscription(
  tx: DbTx,
  input: { transactionId: string; plan: BillingPlan },
): Promise<Subscription>;
```
- **Pós:** emite `TE-SUBSCRIPTION-STARTED`.

### `advanceSubscription`

```ts
export async function advanceSubscription(
  tx: DbTx,
  subscriptionId: string,
): Promise<SubscriptionStatus>;
```
- Chamado por cron Inngest.

### `cancelSubscription`

```ts
export async function cancelSubscription(
  tx: DbTx,
  subscriptionId: string,
  reason: string,
): Promise<Subscription>;
```

### `recordInstallment`

```ts
export async function recordInstallment(
  tx: DbTx,
  input: {
    subscriptionId?: string;
    transactionId: string;
    externalInstallmentId: string;
    status: InstallmentStatus;
    amount: string;
    dueAt: Date;
  },
): Promise<Installment>;
```
- **BRs:** [BR-INTEGRATION-IDEMPOTENCY](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md) via `externalInstallmentId`.

---

## MOD-REFUND

Onde vive: `lib/domain/refund/index.ts`.

### `requestRefund`

```ts
export async function requestRefund(
  tx: DbTx,
  input: {
    transactionId: string;
    requesterUserId: string;
    amount: string;
    reason: string;
  },
): Promise<Refund>;
```

### `approveRefund`

```ts
export async function approveRefund(
  tx: DbTx,
  input: { refundId: string; approverUserId: string; note?: string },
): Promise<Refund>;
```
- **Pós atômico:** `revokeEntitlement` (via MOD-ENTITLEMENT) + `flagSnapshotRefunded` (via MOD-TRANSACTION) + `TE-SALE-REFUNDED`.
- **BRs:** [BR-REFUND](../50-business-rules/BR-REFUND.md), [BR-RBAC](../50-business-rules/BR-RBAC.md).

### `rejectRefund`

```ts
export async function rejectRefund(
  tx: DbTx,
  input: { refundId: string; approverUserId: string; reason: string },
): Promise<Refund>;
```

---

## MOD-AUTOMATION

Onde vive: `lib/domain/automation/index.ts` + `inngest/functions/automation.ts`.

### `triggerFlow`

```ts
export async function triggerFlow(
  kind: AutomationTriggerKind,
  subject: {
    contactId?: string;
    subjectKind?: string;
    subjectId?: string;
    context?: Record<string, unknown>;
  },
): Promise<void>;
```
- **Contrato:** chamado por qualquer módulo após emitir evento que é gatilho de automação. Enfileira execução; não executa síncrono.

### `executeFlow` (internal)

```ts
// Chamado pelo Inngest job. Não exportado para outros módulos.
async function executeFlow(
  flowId: string,
  context: Record<string, unknown>,
): Promise<AutomationExecution>;
```
- **Pós:** emite `TE-AUTOMATION-EXECUTED`.

---

## Regra final

> **Se sua tarefa precisa de dado ou efeito de outro módulo, chame a interface pública. Nunca faça SELECT na tabela alheia, nem UPDATE, nem INSERT.** A violação dessa regra é bug de arquitetura e bloqueia merge.

Se a interface que você precisa não existe:

1. Pare.
2. Registre em [`../90-meta/03-open-questions-log.md`](../90-meta/03-open-questions-log.md).
3. Proponha extensão **serial** deste contrato.
4. Só então implemente.

---

## Open Questions

- `OQ-IFACE-01`: interfaces que retornam `Promise<T>` vs `Promise<Result<T, E>>` — uniformizar retorno de erro na camada de domínio?
- `OQ-IFACE-02`: como expor queries de leitura cross-module otimizadas (ex.: "timeline + tickets + transações de um contato") sem violar boundary — views materializadas ou função de aggregator em MOD-CONTACT?
- `OQ-IFACE-03`: `tx: DbTx` opcional vs obrigatório — padrão atual mistura; definir convenção.
