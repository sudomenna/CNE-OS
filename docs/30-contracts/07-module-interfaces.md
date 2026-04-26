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
- **Pós:** retorna classificação derivada (`lead`/`customer`/`student`/`mentorado`) sem persistir. Hierarquia: `mentorado > student > customer > lead`.
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
export type TimelineFilters = {
  brandId?: string;
  kinds?: string[];
  since?: Date;      // occurred_at >= since
  until?: Date;      // occurred_at <= until
};

export type TimelineEventPage = {
  events: TimelineEvent[];
  nextCursor: string | null;  // keyset cursor: `${occurred_at.toISOString()}_${id}`
  hasMore: boolean;
};

export async function listTimelineEvents(
  contactId: string,
  filters?: TimelineFilters,
  cursor?: string | null,
  pageSize?: number,
): Promise<TimelineEventPage>;
```
- **Contrato:** retorna timeline paginada de um contato, consolidando eventos de todos os contatos que foram mesclados nele (transitividade de merges até profundidade 5, INV-TIMELINE-07).
- **Paginação:** keyset cursor baseado em `(occurred_at DESC, id DESC)`; `pageSize` default é 50.
- **Pré:** `contactId` deve existir; lança `ContactNotFoundError` se não encontrado.
- **Pós:** `hasMore` indica se há mais página(s) adiante.

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

### `updateTicket`

```ts
export type UpdateTicketInput = {
  title?: string;
  description?: string | null;
  category?: TicketCategory;
  priority?: TicketPriority;
  actorUserId: string;
};

export async function updateTicket(
  tx: DbTx,
  ticketId: string,
  input: UpdateTicketInput,
): Promise<Ticket>;
```
- **Pós:** emite `TE-TICKET-UPDATED` com `payload.fields` listando os campos alterados.
- **Lança:** `TicketNotFoundError` se `ticketId` não existir.

### `computeFirstResponseSla` (pura)

```ts
export type SlaStatus = 'met' | 'violated' | 'pending';

export type TicketSlaInput = {
  /** Timestamp de abertura do ticket (mapeado de `createdAt` no schema) */
  openedAt: Date;
  /**
   * Timestamp da primeira resposta ao contato.
   * null quando ainda não houve resposta (SLA ainda não computável).
   */
  firstRespondedAt: Date | null;
  /** Status atual do ticket — contexto do estado */
  status: string;
};

export const FIRST_RESPONSE_SLA_MS = 15 * 60 * 1000; // 15 minutos em ms

export function computeFirstResponseSla(ticket: TicketSlaInput): SlaStatus;
```
- **Contrato:** computa status do SLA de primeira resposta para um ticket (BR-TICKET-SLA).
- **Regras:**
  - Se `firstRespondedAt === null` → `'pending'` (aguardando primeira resposta).
  - Se `firstRespondedAt - openedAt ≤ 15min` → `'met'` (SLA cumprido; limite inclusivo).
  - Se `firstRespondedAt - openedAt > 15min` → `'violated'` (SLA violado).
- **Pura:** sem I/O, sem DB; testável isoladamente.
- **BRs:** [BR-TICKET-SLA](../50-business-rules/BR-TICKET-SLA.md), [FLOW-13](../60-flows/13-ticket-lifecycle.md).

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

### `assertRenewalEligibility`

```ts
export async function assertRenewalEligibility(
  tx: DbTx,
  contactId: string,
  offerId: string,
): Promise<void>;
```
- **Contrato:** verifica que o contato pode comprar uma oferta de renovação.
- **Algoritmo (BR-RENEWAL):**
  1. Carrega oferta; exige `type='renewal'` e `renews_offer_id != null`.
  2. Obtém `originOfferId = offer.renews_offer_id`.
  3. Busca `customer_entitlement` do contato com:
     - `status='active'` OU
     - `status='expired'` E `ends_at > now() - 30 days` (janela de graça)
     - cujo `origin_transaction_id` aponta para transação aprovada do contato com `offer_id=originOfferId`.
  4. Rejeita entitlements com `status='revoked'`.
  5. Lança `RenewalWithoutActiveEntitlement` se nenhum encontrado.
- **Pré:** transação `tx` ativa (ADR-11).
- **Pós:** lança `OfferNotRenewal` se oferta não é renewal; `RenewalWithoutActiveEntitlement` se contato sem direito elegível.
- **BRs:** [BR-RENEWAL](../50-business-rules/BR-RENEWAL.md), [FLOW-10](../60-flows/10-renewal-via-new-offer.md).

### Tipos de erro

```ts
export class OfferDomainError extends Error;
export class OfferCounterNotFoundError extends OfferDomainError;
export class OfferLegalEntityImmutableError extends OfferDomainError;
export class OfferNotRenewal extends OfferDomainError;
export class RenewalWithoutActiveEntitlement extends OfferDomainError;
export class NoPriorityChangeError extends OfferDomainError;
```

---

## MOD-TRANSACTION

Onde vive: `lib/domain/transaction/index.ts`. **Módulo crítico — gerencia transações com snapshot imutável e atomicidade.**

### `createPendingTransaction`

```ts
export type CreateTransactionInput = {
  contactId: string;
  brandId: string;
  offerId: string;
  offerConditionId: string;
  offerPaymentOptionId: string;
  amount: string;                  // numeric(12,2) como string
  currency?: string;               // default 'BRL'
  externalProvider?: string | null;
  externalId?: string | null;
  externalFee?: string | null;
};

export async function createPendingTransaction(
  tx: DbTx,
  input: CreateTransactionInput,
): Promise<Transaction>;
```
- **Pós:** cria transação com status `pending`; **não emite evento** (emissão é responsabilidade da Server Action).
- **Pré:** valida BR-OFFER-UNIQUENESS — lança `DuplicateOfferPurchaseError` se contato já possui transação `approved` para a mesma oferta.
- **BRs:** [BR-OFFER-UNIQUENESS](../50-business-rules/BR-OFFER-UNIQUENESS.md).

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

### `flagSnapshotRefunded`

```ts
export async function flagSnapshotRefunded(
  tx: DbTx,
  snapshotId: string,
  refundId: string,
): Promise<void>;
```
- **Pós:** insere linha em `transaction_snapshot_flag_history` com `to_flag='refunded'`; **nunca** atualiza `transaction_snapshot.payload` (BR-SNAPSHOT-IMMUTABILITY).
- **Contexto:** chamado por MOD-REFUND ao aprovar reembolso (T-8-19).
- **BRs:** [BR-SNAPSHOT-IMMUTABILITY](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md).

### `composeSnapshot` (pura)

```ts
export function composeSnapshot(
  offer: Offer,
  condition: OfferCondition,
  items: OfferConditionItem[],
  paymentOption: OfferPaymentOption,
  context?: { campaignId?: string; creativeId?: string; channel?: string; isInternal?: boolean },
): TransactionSnapshotPayload;
```
- **Contrato:** compõe payload v1 do snapshot a partir de dados de oferta, condição, itens e contexto.
- **Pura:** sem I/O, sem DB.
- **Retorna:** `TransactionSnapshotPayload` tipado.

### `createSnapshot` (internal)

```ts
// Apenas chamável de dentro de MOD-TRANSACTION. Não exportado.
async function createSnapshot(tx: DbTx, transactionId: string): Promise<TransactionSnapshot>;
```
- **Pós:** snapshot em `transaction_snapshot` imutável ([BR-SNAPSHOT-IMMUTABILITY](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md)).

---

## MOD-ENTITLEMENT

Onde vive: `lib/domain/entitlement/index.ts` (re-exports de `consolidate.ts`, `grant.ts`) + `lib/domain/entitlement/revoke.ts` (import direto). **Módulo crítico — gerencia direitos com consolidação automática e revogação em lote.**

### `grantFromTransaction`

```ts
export async function grantFromTransaction(
  tx: DbTx,
  input: {
    contactId: string;
    transactionSnapshotId: string;
    sourceTransactionId: string;
    emitFn?: EmitFn;
  },
): Promise<CustomerEntitlement[]>;
```
- **Pós:** para cada item no snapshot, consolida entitlement ativo ou cria novo com status `active`; emite `TE-ENTITLEMENT-GRANTED` ou `TE-ENTITLEMENT-EXTENDED`.
- **Contexto:** chamado por MOD-TRANSACTION ao aprovar venda (T-8-11).
- **BRs:** [BR-ENTITLEMENT-CONSOLIDATION](../50-business-rules/BR-ENTITLEMENT-CONSOLIDATION.md).

### `consolidate` (pura)

```ts
export function consolidate(
  existing: CustomerEntitlement | null,
  incoming: Omit<CustomerEntitlement, 'id' | 'createdAt'>,
): ConsolidationResult;
```
- **Contrato:** dado direito existente (ou null) e novo, retorna resultado consolidado.
- **Pura:** sem I/O, sem DB; testável isoladamente.
- **Retorna:** `{ action: 'create'|'extend'|'noop', result?: Entitlement }`
- **BRs:** [BR-ENTITLEMENT-CONSOLIDATION](../50-business-rules/BR-ENTITLEMENT-CONSOLIDATION.md).

### `revokeByTransaction`

```ts
export async function revokeByTransaction(
  tx: DbTx,
  transactionId: string,
  reason: string,
): Promise<CustomerEntitlement[]>;
```
- **Contrato:** revoga **todos os direitos ativos** originados de uma transação específica.
- **Pós:** atualiza `status='revoked'` para cada; grava `entitlement_status_history`; emite `TE-ENTITLEMENT-REVOKED` por direito.
- **Retorna:** lista de entitlements revogados.
- **Contexto:** chamado por MOD-REFUND ao aprovar reembolso (T-8-19); reclassifica contato após revogação.
- **BRs:** [BR-REFUND](../50-business-rules/BR-REFUND.md) §7 passo 3.

### Tipos de erro

```ts
export class EntitlementDomainError extends Error;
export class TransactionSnapshotNotFoundError extends EntitlementDomainError;
export class TransactionNotFoundError extends EntitlementDomainError;
export class EntitlementNotFoundError extends EntitlementDomainError;
```

---

## MOD-BILLING

Onde vive: `lib/domain/billing/index.ts`. **Módulo crítico — gerencia subscriptions recorrentes, parcelas, e estados de assinatura com transições controladas.**

### `createSubscriptionFromTransaction`

```ts
export async function createSubscriptionFromTransaction(
  tx: DbTx,
  transactionId: string,
  emit?: EmitFn,
): Promise<Subscription>;
```
- **Pré:** transação deve existir e estar aprovada.
- **Pós:** cria subscription com origin_transaction_id = transactionId; é idempotente (reutiliza se já existe).
- **Emite:** `TE-SUBSCRIPTION-STARTED`.
- **BRs:** [BR-SUBSCRIPTION](../50-business-rules/BR-SUBSCRIPTION.md) §2, §5, §6.1, §9.

### `handleInstallmentPaid`

```ts
export async function handleInstallmentPaid(
  tx: DbTx,
  installmentId: string,
  paidAt?: Date,
  emit?: EmitFn,
): Promise<Installment>;
```
- **Pré:** installment deve existir; transição válida (scheduled → paid ou overdue → paid).
- **Pós:** atualiza status='paid', paid_at=paidAt || now(); idempotente se já paga.
- **Emite:** `TE-INSTALLMENT-PAID`.
- **BRs:** [BR-SUBSCRIPTION](../50-business-rules/BR-SUBSCRIPTION.md) §6.2.

### `handleInstallmentOverdue`

```ts
export async function handleInstallmentOverdue(
  tx: DbTx,
  installmentId: string,
  emit?: EmitFn,
): Promise<Installment>;
```
- **Pré:** installment deve existir; transição válida (scheduled → overdue).
- **Pós:** atualiza status='overdue', updated_at=now(); idempotente se já overdue.
- **Emite:** `TE-INSTALLMENT-OVERDUE`; pode gatilhar `TE-SUBSCRIPTION-PAST-DUE` se subscription transicionar.
- **BRs:** [BR-SUBSCRIPTION](../50-business-rules/BR-SUBSCRIPTION.md) §6.2, dunning matrix.

### `advanceSubscription`

```ts
export async function advanceSubscription(
  tx: DbTx,
  subscriptionId: string,
  now?: Date,
): Promise<SubscriptionStatus>;
```
- **Contrato:** avança estado da subscription baseado em ciclo de período e pagamentos.
- **Lógica:** verifica se nova parcela deve ser gerada, se há atrasos vencidos, se trial expirou; aplica matriz de transições BR-SUBSCRIPTION §6.1.
- **Pós:** atualiza status e emite `TE-SUBSCRIPTION-RENEWED` (se pagamento processado) ou `TE-SUBSCRIPTION-PAST-DUE` (se vencido).
- **Chamador:** cron Inngest (T-9-07).
- **BRs:** [BR-SUBSCRIPTION](../50-business-rules/BR-SUBSCRIPTION.md) §6.1 (matriz de transições).

### `cancelSubscription`

```ts
export async function cancelSubscription(
  tx: DbTx,
  subscriptionId: string,
  reason: string,
  emit?: EmitFn,
): Promise<Subscription>;
```
- **Pré:** subscription deve existir; transição válida (não é noop se já cancelled/expired).
- **Pós:** atualiza status='cancelled', cancelled_at=now(), cancel_reason=reason; emite `TE-SUBSCRIPTION-CANCELLED`.
- **Nota:** **não revoga entitlements** — eles permanecem até current_period_end (revogação via refund apenas). INV-BILL-07.
- **BRs:** [BR-SUBSCRIPTION](../50-business-rules/BR-SUBSCRIPTION.md) §Preservação de direitos ao cancelar.

### Tipos de erro

```ts
export class BillingDomainError extends Error;
export class TransactionNotFoundError extends BillingDomainError;
export class InstallmentDomainError extends Error;
export class InstallmentNotFoundError extends InstallmentDomainError;
export class InvalidStatusTransitionError extends InstallmentDomainError;
export class SubscriptionNotFoundError extends Error;
export class SubscriptionCancelError extends Error;
export class SubscriptionNotFoundForCancelError extends SubscriptionCancelError;
```

---

## MOD-REFUND

Onde vive: `lib/domain/refund/index.ts`. **Módulo crítico — implementa fluxo end-to-end de reembolso com 8 efeitos colaterais atômicos (T-8-18, T-8-19, T-8-20).**

### `openRefund`

```ts
export async function openRefund(
  tx: DbTx,
  input: {
    transactionId: string;
    requesterUserId: string;
    amount: string;
    reason: string;
  },
): Promise<Refund>;
```
- **Pós:** cria linha em `refund` com status `requested`; emite `TE-REFUND-OPENED`.
- **Pré:** transação deve estar `approved` (guard em domain).
- **BRs:** [BR-REFUND](../50-business-rules/BR-REFUND.md), INV-REFUND-01 (máx 1 ativo por transaction).

### `approveRefund`

```ts
export async function approveRefund(
  tx: DbTx,
  input: { refundId: string; approverUserId: string; note?: string },
): Promise<Refund>;
```
- **Pós atômico (8 efeitos em ordem canônica):**
  1. Update `refund.status='approved'`, grava `refund_status_history`
  2. Flag snapshot: INSERT em `transaction_snapshot_flag_history` com `to_flag='refunded'`
  3. Revoga entitlements: chamar `revokeByTransaction` (via MOD-ENTITLEMENT)
  4. Reclassifica contato (se aplicável): chamar `reclassifyContact` (via MOD-CONTACT)
  5. Reverte oportunidade no funil (se aplicável): chamar `moveStage` (via MOD-FUNNEL)
  6. Cancela assinatura (se houver): chamar `cancelSubscription` (via MOD-BILLING)
  7. Grava `refund_effect_log` para cada efeito
  8. Emite timeline: `TE-SALE-REFUNDED`, `TE-ENTITLEMENT-REVOKED` (delegado), `TE-CONTACT-CLASSIFICATION-CHANGED` (delegado), `TE-OPPORTUNITY-LABEL-CHANGED` (delegado), `TE-SUBSCRIPTION-CANCELLED` (delegado)
- **Atomicidade:** falha em qualquer passo → ROLLBACK total.
- **BRs:** [BR-REFUND](../50-business-rules/BR-REFUND.md) §7, [BR-SNAPSHOT-IMMUTABILITY](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md), [BR-RBAC](../50-business-rules/BR-RBAC.md) (só admin/financial).

### `rejectRefund`

```ts
export async function rejectRefund(
  tx: DbTx,
  input: { refundId: string; approverUserId: string; reason: string },
): Promise<Refund>;
```
- **Pós:** update `refund.status='rejected'`; grava `refund_status_history`; emite `TE-REFUND-REJECTED`.
- **BRs:** [BR-RBAC](../50-business-rules/BR-RBAC.md) (só admin/financial).

### `markProcessed`

```ts
export async function markProcessed(
  tx: DbTx,
  input: { refundId: string; externalRefundId: string; externalProvider: IntegrationProvider },
): Promise<Refund>;
```
- **Pós:** update `refund.status='processed'`, preenche `external_refund_id` e `external_provider`; grava `refund_status_history`; emite `TE-REFUND-PROCESSED`.
- **Contexto:** chamado por webhook do provedor após confirmar estorno. Idempotente via `externalRefundId` (BR-INTEGRATION-IDEMPOTENCY).

### Tipos de erro

```ts
export class RefundDomainError extends Error;
export class RefundNotFoundError extends RefundDomainError;
export class RefundTransactionNotFoundError extends RefundDomainError;
export class TransactionNotApprovedError extends RefundDomainError;
export class ActiveRefundExistsError extends RefundDomainError;           // INV-REFUND-01: 2ª solicitação ativa bloqueada
export class InvalidRefundStatusError extends RefundDomainError;
```

---

## MOD-AUTOMATION

Onde vive: `lib/domain/automation/dispatch.ts`, `lib/domain/automation/run-flow.ts` + `app/(app)/automations/actions.ts` (Server Actions).

### `dispatchTrigger`

```ts
export async function dispatchTrigger(
  tx: DbTx,
  kind: AutomationTriggerKind,
  subject: TriggerSubject,
  triggeredAt?: Date,
): Promise<string[]>;
```
- **Contrato:** dispara todos os fluxos ativos com trigger do kind compatível e filter casado. Cria `automation_execution` via inserts (com constraint de idempotência).
- **Pré:** chamado dentro de transação SQL (pós-emissão em `emitTimelineEvent`, T-11-09).
- **Pós:** retorna array de `executionIds` criados. Conflitos na constraint `uq_automation_execution_idem` são silenciosos (idempotência).
- **BRs:** [BR-AUTOMATION-LOOP](../50-business-rules/BR-AUTOMATION-LOOP.md) — kinds `automation_executed` e `user_notification` nunca redisparam.
- **Tipos:**
  ```ts
  export type TriggerSubject = {
    subjectKind: string;    // ex: 'contact', 'transaction'
    subjectId: string;
    data: Record<string, unknown>;  // para filter matching
  };
  
  type AutomationTriggerKind = 'funnel_enter' | 'funnel_stage_change' | 'new_message' | 'checkout_abandoned' | 'sale_approved' | 'ticket_opened' | 'brevo_event' | 'integration_event';
  ```

### `runFlow`

```ts
export async function runFlow(
  executionId: string,
  ctx: RunFlowContext,
  options: RunFlowOptions,
  tx: DbTx,
): Promise<void>;
```
- **Contrato:** executa uma `automation_execution` já criada (status=pending) nó a nó, registrando logs e atualizando status final.
- **Chamador:** Inngest job `automation/run`.
- **Pós:** emite `TE-AUTOMATION-EXECUTED` via `emitTimelineEvent` (dentro da tx).
- **Erros:** lança `AutomationDomainError` (subtipo: `AutomationNotFoundError`, `AutomationFlowNotFoundError`, `AutomationLoopDetectedError`).
- **Tipos:**
  ```ts
  export type RunFlowContext = {
    subject: Record<string, unknown>;
    subjectKind: string;
    subjectId: string;
  };
  
  export type ActionHandler = (
    kind: string,
    params: unknown,
    ctx: RunFlowContext,
    tx: DbTx,
  ) => Promise<unknown>;
  
  export type RunFlowOptions = {
    actionHandler: ActionHandler;
  };
  ```

### `evalCondition` (pura)

```ts
export function evalCondition(
  expr: ConditionExpr,
  ctx: Record<string, unknown>,
): boolean;
```
- **Contrato:** avalia expressão DSL JSON recursivamente contra contexto. Retorna `true` se condição atende.
- **Pura:** sem I/O, sem DB.
- **Operadores suportados:** `and`, `or`, `not`, `eq`, `neq`, `gte`, `lte`, `gt`, `lt`, `in`, `contains`, `has_tag`.
- **BRs:** docs/20-domain/15-automation.md §8.

---

## MOD-ANALYTICS

Onde vive: `lib/analytics/index.ts`, `lib/analytics/queries/sales.ts`, `lib/analytics/queries/ops.ts`.

**Nota:** Módulo **puro de leitura** — zero escrita. Consulta materialized views refrescadas via Inngest cron. Sem Server Actions — interface via RSC + Route Handler de export.

### `querySalesByDay`

```ts
export async function querySalesByDay(
  filters: AnalyticsFilters,
  db?: Db,
): Promise<SalesByDayRow[]>;
```
- **Contrato:** agregação diária de receita bruta, ticket médio e contagem de transações aprovadas por marca/período/oferta.
- **Fonte:** materialized view `mv_sales_by_brand_day` refrescada a cada hora.
- **Filtros:** `brandId`, `from`, `to` (obrigatórios); `offerId` (opcional).
- **RLS:** filtra por `brand_id` — usuário só vê dados da própria marca.

### `queryRefundsByDay`

```ts
export async function queryRefundsByDay(
  filters: AnalyticsFilters,
  db?: Db,
): Promise<RefundByDayRow[]>;
```
- **Contrato:** agregação diária de reembolsos por marca/período/oferta.
- **Fonte:** materialized view `mv_refund_by_brand_day`.
- **Retorna:** dia, ofertaId, contagem de reembolsos, valor total reembolsado.
- **RLS:** idem acima.

### `queryDelinquency`

```ts
export async function queryDelinquency(
  filters: AnalyticsFilters,
  db?: Db,
): Promise<DelinquencyRow[]>;
```
- **Contrato:** lista inadimplência ativa — parcelas vencidas por mais de N dias, com aging (dias em atraso).
- **Fonte:** view `v_delinquency_aging` (não materializada, calculada sob demanda).
- **Retorna:** subscriptionId, contactId, offerId, dueAt, amount, daysOverdue.
- **Contexto:** usado pelo dashboard `/analytics/sales` (box de inadimplência).

### `queryOverviewKpis`

```ts
export type OverviewKpis = {
  grossRevenue: number;
  transactionsCount: number;
  refundRate: number;
  avgResponseTimeMinutes: number | null;
  openConversations: number;
};

export async function queryOverviewKpis(
  filters: AnalyticsFilters,
  db?: Db,
): Promise<OverviewKpis>;
```
- **Contrato:** calcula KPIs top-level por marca/período: receita bruta (últimas transações aprovadas), contagem, taxa de refund (refunds/transactions), SLA (tempo médio de resposta inbox), conversas abertas.
- **Fonte:** múltiplas MVs + views agregadas.

### `queryFunnelConversion`

```ts
export async function queryFunnelConversion(
  filters: AnalyticsFilters,
  db?: Db,
): Promise<FunnelConversionRow[]>;
```
- **Contrato:** agregação diária de entrada/conversão/ciclo por funil e estágio (labels: `active`, `won`, `lost`).
- **Fonte:** materialized view `mv_funnel_stage_conversion`.
- **Retorna:** funnelId, funnelName, label, dia, entriesCount, avgCycleTimeDays, avgScore.
- **Filtros:** `brandId`, `from`, `to` (obrigatórios); `funnelId` (opcional).

### `queryInboxDaily`

```ts
export async function queryInboxDaily(
  filters: AnalyticsFilters,
  db?: Db,
): Promise<InboxDailyRow[]>;
```
- **Contrato:** agregação diária de inbox: conversas abertas/fechadas, tempo médio de resposta (SLA), contagem de conversas vencidas.
- **Fonte:** materialized view `mv_inbox_daily`.
- **Retorna:** dia, conversationsCount, openCount, closedCount, avgResponseTimeMinutes, overdueCount.

### `queryCampaignAttribution`

```ts
export async function queryCampaignAttribution(
  filters: AnalyticsFilters,
  db?: Db,
): Promise<CampaignAttributionRow[]>;
```
- **Contrato:** atribuição de conversões a campanhas (UTM → entrada no funil → conversão).
- **Fonte:** materialized view `mv_campaign_attribution`.
- **Retorna:** campaignId, campaignName, funnelId, entriesCount, conversionsCount, conversionRate (%).
- **Filtros:** `brandId`, `from`, `to` (obrigatórios); `campaignId` (opcional).

### Tipos

```ts
export type AnalyticsFilters = {
  brandId: string;
  from: Date;
  to: Date;
  offerId?: string;
  funnelId?: string;
  campaignId?: string;
};

export type SalesByDayRow = {
  day: string;           // ISO "YYYY-MM-DD"
  offerId: string;
  offerName: string;
  transactionsCount: number;
  grossRevenue: number;
  avgTicket: number;
};

export type RefundByDayRow = {
  day: string;
  offerId: string;
  refundsCount: number;
  refundedAmount: number;
};

export type DelinquencyRow = {
  id: string;
  subscriptionId: string;
  contactId: string;
  offerId: string;
  dueAt: string;
  amount: number;
  daysOverdue: number;
};

export type FunnelConversionRow = {
  funnelId: string;
  funnelName: string;
  label: string;
  day: string;
  entriesCount: number;
  avgCycleTimeDays: number | null;
  avgScore: number | null;
};

export type InboxDailyRow = {
  day: string;
  conversationsCount: number;
  openCount: number;
  closedCount: number;
  avgResponseTimeMinutes: number | null;
  overdueCount: number;
};

export type CampaignAttributionRow = {
  campaignId: string;
  campaignName: string;
  funnelId: string;
  entriesCount: number;
  conversionsCount: number;
  conversionRate: number | null;
};

export type OverviewKpis = {
  grossRevenue: number;
  transactionsCount: number;
  refundRate: number;
  avgResponseTimeMinutes: number | null;
  openConversations: number;
};
```

---

## MOD-RBAC

Onde vive: `lib/domain/rbac/index.ts`.

**Funções de gerenciamento de permissões e matriz role × permission. Implementado em T-15-01.**

### `grantPermission`

```ts
export type GrantPermissionParams = {
  actorUserId: string;
  roleId: string;
  permissionId: string;
};

export async function grantPermission(
  tx: DbTx,
  params: GrantPermissionParams,
): Promise<void>;
```
- **Contrato:** concede uma permissão a um role. Se `role.kind === 'admin'`, operação é no-op silencioso (admin tem todas as permissões implicitamente).
- **Pós:** INSERT em `role_permission` (idempotente via `ON CONFLICT DO NOTHING`); append em `audit_log` com `action='rbac.grant'`.
- **Lança:** `RoleNotFound` (role não existe), `PermissionNotFound` (permission não existe).
- **BRs:** [BR-RBAC](../50-business-rules/BR-RBAC.md).

### `revokePermission`

```ts
export type RevokePermissionParams = {
  actorUserId: string;
  roleId: string;
  permissionId: string;
};

export async function revokePermission(
  tx: DbTx,
  params: RevokePermissionParams,
): Promise<void>;
```
- **Contrato:** revoga uma permissão de um role. Lança erro se tentar revogar do role `admin`.
- **Pós:** DELETE em `role_permission`; append em `audit_log` com `action='rbac.revoke'`.
- **Lança:** `RoleNotFound`, `PermissionNotFound`, `CannotModifyAdminRole` (tentativa de revogar permissão do admin).
- **BRs:** [BR-RBAC](../50-business-rules/BR-RBAC.md).

### `listRoleMatrix`

```ts
export type RoleMatrixRole = {
  id: string;
  kind: string;
  name: string | null;
};

export type RoleMatrixPermission = {
  id: string;
  action: string;
  requires2fa: boolean;
};

export type RoleMatrixAssignment = {
  roleId: string;
  permissionId: string;
};

export type RoleMatrix = {
  roles: RoleMatrixRole[];
  permissions: RoleMatrixPermission[];
  assignments: RoleMatrixAssignment[];
};

export async function listRoleMatrix(): Promise<RoleMatrix>;
```
- **Contrato:** retorna matriz completa de roles, permissions e assignments (sem filtro — leitura bruta).
- **Pós:** sem side-effects (leitura pura).
- **BRs:** [BR-RBAC](../50-business-rules/BR-RBAC.md).

### Tipos de erro

```ts
export class RbacDomainError extends Error;
export class RoleNotFound extends RbacDomainError;
export class PermissionNotFound extends RbacDomainError;
export class CannotModifyAdminRole extends RbacDomainError;
```

---

## MOD-CHANNEL

Onde vive: `lib/domain/channel/index.ts` + `lib/db/crypto.ts`.

**Funções de gerenciamento de contas de integração (channel_accounts) com credenciais encriptadas. Implementado em T-15-03.**

### `createChannelAccount`

```ts
export type ChannelKind = 'whatsapp' | 'instagram' | 'email';

export type CreateChannelAccountInput = {
  brandId: string;
  channelKind: string;
  externalId: string;
  credentials: Record<string, unknown>;
  actorUserId: string;
};

export type CreateChannelAccountResult = {
  id: string;
};

export async function createChannelAccount(
  tx: DbTx,
  input: CreateChannelAccountInput,
  encryptFn: EncryptFn,
): Promise<CreateChannelAccountResult>;
```
- **Contrato:** cria novo `channel_account` com credenciais encriptadas (ADR-18). Valida que `channelKind` é um enum válido.
- **Pré:** `brandId` deve existir; par (brandId, channelKind, externalId) deve ser único.
- **Pós:** INSERT em `channel_account` com `credentials` encriptado via `encryptFn`; append em `audit_log`.
- **Lança:** `BrandNotFoundError`, `InvalidChannelKindError`, `DuplicateChannelAccountError`.
- **BRs:** [ADR-18](../90-meta/04-decision-log.md), [INV-INBOX](../50-business-rules/BR-INBOX.md).

### `updateChannelAccount`

```ts
export type UpdateChannelAccountInput = {
  id: string;
  actorUserId: string;
  credentials?: Record<string, unknown>;
  isActive?: boolean;
};

export async function updateChannelAccount(
  tx: DbTx,
  input: UpdateChannelAccountInput,
  encryptFn: EncryptFn,
): Promise<void>;
```
- **Contrato:** atualiza credenciais e/ou status de um `channel_account`. Se `credentials` fornecidas, re-encripta antes de persistir.
- **Pós:** UPDATE em `channel_account`; append em `audit_log` com deltas (before/after cifradas em resumo).
- **Lança:** `ChannelAccountNotFoundError`.
- **BRs:** [ADR-18](../90-meta/04-decision-log.md).

### `listChannelsByBrand`

```ts
export type ChannelAccountListItem = {
  id: string;
  brandId: string;
  channelKind: string;
  externalId: string;
  displayName: string | null;
  isActive: boolean;
  encryptedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listChannelsByBrand(
  brandId: string,
): Promise<ChannelAccountListItem[]>;
```
- **Contrato:** lista `channel_accounts` de uma marca. **Nunca** retorna ciphertext nem plaintext das credentials (ADR-18) — apenas metadados + `encryptedAt` do envelope.
- **Pós:** sem side-effects (leitura pura).
- **BRs:** [ADR-18](../90-meta/04-decision-log.md).

### `getChannelCredentials`

```ts
export type DecryptFn = (envelope: CredentialEnvelope) => Promise<Record<string, unknown>>;

export async function getChannelCredentials(
  id: string,
  decryptFn: DecryptFn,
): Promise<Record<string, unknown>>;
```
- **Contrato:** carrega `channel_account` e decripta as credentials via `decryptFn` (pgcrypto). **Restrito a adapters de integração** — nunca expor em Server Actions de listagem.
- **Pós:** retorna plaintext (use imediatamente antes de enviar ao provedor externo).
- **Lança:** `ChannelAccountNotFoundError`, `Error` se envelope malformado.
- **BRs:** [ADR-18](../90-meta/04-decision-log.md) §security.

### `encryptCredentials` (MOD-CRYPTO helper)

```ts
export type CredentialEnvelope = {
  v: 1;
  encryptedAt: string;
  ciphertext: string;
};

export class CryptoConfigError extends Error;

export async function encryptCredentials(
  plain: Record<string, unknown>,
): Promise<CredentialEnvelope>;
```
- **Contrato:** encripta credenciais em plaintext via `pgp_sym_encrypt` (pgcrypto no Supabase). Retorna envelope com formato versionado.
- **Pré:** `CREDENTIALS_ENCRYPTION_KEY` must be set em environment.
- **Lança:** `CryptoConfigError` se env var ausente.
- **BRs:** [ADR-18](../90-meta/04-decision-log.md).

### `decryptCredentials` (MOD-CRYPTO helper)

```ts
export async function decryptCredentials(
  envelope: CredentialEnvelope,
): Promise<Record<string, unknown>>;
```
- **Contrato:** decripta envelope via `pgp_sym_decrypt` (pgcrypto).
- **Pré:** envelope válido com `v=1, ciphertext` base64.
- **Lança:** `Error` se decrypt falha.
- **BRs:** [ADR-18](../90-meta/04-decision-log.md) §security.

### Tipos de erro

```ts
export class ChannelDomainError extends Error;
export class ChannelAccountNotFoundError extends ChannelDomainError;
export class BrandNotFoundError extends ChannelDomainError;
export class DuplicateChannelAccountError extends ChannelDomainError;
export class InvalidChannelKindError extends ChannelDomainError;
```

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
