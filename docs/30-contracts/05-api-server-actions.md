# Contrato de Server Actions

Padrão único para **toda** mutação de estado no CNE-OS. Server Actions do Next.js são o único ponto de entrada autorizado para UI consumir o domínio. UI **nunca** fala com Drizzle/Supabase direto.

> Leia antes: [AGENTS.md §3.3](../../AGENTS.md), [BR-RBAC](../50-business-rules/BR-RBAC.md), [BR-AUDIT](../50-business-rules/BR-AUDIT.md), [BR-INTEGRATION-IDEMPOTENCY](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md), [`07-module-interfaces.md`](./07-module-interfaces.md).

---

## 1. Forma canônica de uma Server Action

Toda Server Action segue este esqueleto, sem exceção:

```ts
'use server';

import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/auth/rbac';
import { db } from '@/lib/db/client';
import { logAudit } from '@/lib/audit/log';
import { emitTimelineEvent } from '@/lib/timeline/emit';
import { toActionResult, ActionError } from '@/lib/actions/result';
import { revalidatePath } from 'next/cache';

const inputSchema = z.object({
  /* campos tipados */
});

export async function <verb><Resource>(
  rawInput: unknown,
): Promise<ActionResult<OutputShape>> {
  return toActionResult(async () => {
    // 1. Sessão + correlation id
    const ctx = await requireSession();

    // 2. Validar input externo
    const input = inputSchema.parse(rawInput);

    // 3. Guard RBAC declarativo
    await requirePermission(ctx, '<action>', { kind: '<resource>', id: input.id });

    // 4. Transação única: efeito + timeline + audit
    const output = await db.transaction(async (tx) => {
      const result = await /* chamada à interface pública do módulo */;
      await emitTimelineEvent(tx, { /* TE-ID */ });
      await logAudit(tx, { /* entrada canônica */ });
      return result;
    });

    // 5. Revalidar caches relevantes
    revalidatePath(`/<resource>/${input.id}`);

    return output;
  });
}
```

Regras invioláveis:

1. **Primeira linha:** `'use server';`.
2. **Validação com Zod** em todo input externo. Nada de `any`, nada de confiar em tipos de formulário.
3. **Guard RBAC sempre antes da transação.** Falhar cedo economiza locks.
4. **Uma transação SQL** por Server Action. Efeito de domínio + timeline + audit convivem nela (atomicidade, [BR-AUDIT §3](../50-business-rules/BR-AUDIT.md)).
5. **Nunca SELECT direto em tabela de outro módulo** dentro da Action. Chamar interface pública (ver [`07-module-interfaces.md`](./07-module-interfaces.md)).
6. **Retorno padronizado** `ActionResult<T>` (§3). Nunca lance exceção para a UI.
7. **Revalidar** caminhos afetados com `revalidatePath` antes de retornar.

---

## 2. Nomenclatura

Verbo + recurso. CamelCase. Verbos permitidos:

| Verbo | Uso |
|---|---|
| `create<X>` | Cria recurso novo |
| `update<X>` | Altera campos de recurso existente |
| `archive<X>` | Soft-archive (não confundir com delete) |
| `delete<X>` | Remoção lógica com `deleted_at` |
| `merge<X>` | Merge (ex.: `mergeContacts`) |
| `unmerge<X>` | Reverte merge |
| `approve<X>` | Aprovação em fluxo de workflow (refund, transaction) |
| `reject<X>` | Rejeição |
| `assign<X>` | Atribuir responsável |
| `move<X>` | Mover entre estágios/estados |

**Proibido:** `doSomething`, `handleX`, `processX`, `saveX`, `submitX`. Verbo de negócio, sempre.

Um arquivo `actions.ts` por rota ou módulo de UI em `app/(app)/<resource>/actions.ts`.

---

## 3. Error model

Tipo único para retorno:

```ts
// lib/actions/result.ts
import type { ZodIssue } from 'zod';

export type ActionErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE_VIOLATED'
  | 'INTEGRATION_FAILED'
  | 'INTERNAL';

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ActionErrorCode;
        message: string;
        issues?: ZodIssue[];        // preenchido em VALIDATION_FAILED
        rule?: string;              // ex.: 'BR-OFFER-DECISION'
        correlationId: string;
      };
    };

export class ActionError extends Error {
  constructor(
    public code: ActionErrorCode,
    message: string,
    public meta?: { issues?: ZodIssue[]; rule?: string },
  ) {
    super(message);
  }
}

export async function toActionResult<T>(
  fn: () => Promise<T>,
): Promise<ActionResult<T>>;
```

Tabela de códigos:

| Código | Quando emitir | HTTP equivalente |
|---|---|---|
| `VALIDATION_FAILED` | Zod parse falha | 400 |
| `UNAUTHORIZED` | Sessão ausente OU `can()` retorna false OU 2FA expirado | 401/403 |
| `NOT_FOUND` | Recurso não existe ou `deleted_at IS NOT NULL` | 404 |
| `CONFLICT` | Versão/estado inválido (ex.: approve em transação já aprovada) | 409 |
| `BUSINESS_RULE_VIOLATED` | Invariante de domínio violada — `rule` preenchido com `BR-ID` | 422 |
| `INTEGRATION_FAILED` | Efeito externo falhou após retries | 502 |
| `INTERNAL` | Bug / erro não mapeado | 500 |

UI consome `result.ok` para decidir. Nunca exibir `message` cru para usuário final — mapear por `code`.

---

## 4. Autenticação e sessão

```ts
export type SessionContext = {
  user: {
    id: string;
    role: Role;
    has2fa: boolean;
    twoFactorRecentlyVerified: boolean;
  };
  impersonatingContactId: string | null;   // não-nulo durante impersonate
  ip: string | null;
  userAgent: string | null;
  correlationId: string;                   // UUID propagado em headers
};

export async function requireSession(): Promise<SessionContext>;
```

- `requireSession()` lê cookies Supabase, valida TTL, retorna `SessionContext` ou lança `ActionError('UNAUTHORIZED', ...)`.
- `correlationId` é lido de `headers().get('x-correlation-id')` ou gerado.
- Impersonate: quando `impersonatingContactId != null`, toda linha de `audit_log` e `timeline_event` registra ambos `actor_user_id` e `impersonating_contact_id`.

---

## 5. Guard RBAC

```ts
export async function requirePermission(
  ctx: SessionContext,
  action: Action,
  resource: Resource,
): Promise<void>;
```

Consulta `can(ctx.user, action, resource)` ([BR-RBAC](../50-business-rules/BR-RBAC.md)). Se `false`, lança `ActionError('UNAUTHORIZED', ...)`. Ações que exigem 2FA fresh checam `ctx.user.twoFactorRecentlyVerified` dentro da matriz.

---

## 6. Validação com Zod

- Todo input cruzando fronteira (UI → Action, webhook → handler) parsa por zod.
- Schema convive no mesmo arquivo da Action: `const createContactSchema = z.object({ ... })`.
- Reaproveitar schemas em `lib/domain/<module>/schemas.ts` quando consumidos por múltiplas Actions.
- Nunca passar objeto não-validado para função de domínio.

---

## 7. Transação + timeline + audit

Regra de ouro: **mesma transação SQL**.

```ts
await db.transaction(async (tx) => {
  const updated = await updateOfferDomain(tx, input);

  await emitTimelineEvent(tx, {
    contactId: /* ... */,
    kind: 'offer_updated',
    source: 'MOD-OFFER',
    actorUserId: ctx.user.id,
    subjectKind: 'offer',
    subjectId: updated.id,
    payload: { changed_fields: Object.keys(input.patch) },
  });

  await logAudit(tx, {
    actorUserId: ctx.user.id,
    actionKind: 'update',
    resourceKind: 'offer',
    resourceId: updated.id,
    before: snapshotBefore,
    after: snapshotAfter,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    context: { correlationId: ctx.correlationId },
  });

  return updated;
});
```

Leituras (SELECTs puros) **não** auditam (ver [BR-AUDIT §3](../50-business-rules/BR-AUDIT.md)).

---

## 8. Revalidação de cache

Toda mutação chama `revalidatePath` do Next antes de retornar:

- Editou contato `X` → `revalidatePath('/contacts/[id]', 'page')` e `/contacts` (lista).
- Aprovou refund `R` → `revalidatePath('/transactions/[id]')` e `/refunds`.
- Rodou `archiveX` → revalidar índice + detalhe.

Jamais chamar `revalidatePath` dentro da transação (é efeito fora do DB).

---

## 9. Correlation ID e observabilidade

- Cada request Next injeta `x-correlation-id` via middleware.
- Server Action lê do header, propaga para:
  - Sentry: `Sentry.setTag('correlation_id', ctx.correlationId)`.
  - Axiom: campo `correlation_id` em todo log estruturado.
  - `audit_log.context.correlationId`.
  - Inngest: `event.data.correlationId`.
- Em erros, `correlationId` volta para UI dentro de `result.error.correlationId` para o usuário reportar.

---

## 10. Impersonação

Quando `admin`/`support`/`financial`/`commercial` impersona contato (ação `contact.impersonate`):

1. Sessão ganha `impersonatingContactId` (cookie assinado, TTL ≤ 30 min).
2. Server Actions continuam usando `ctx.user.id` como `actor_user_id`, mas preenchem `impersonating_contact_id` em `audit_log` e `timeline_event`.
3. Início e fim da impersonação geram `audit_log` com `action_kind='impersonate'`.

---

## 11. Exemplos completos

### 11.1. `createContact`

```ts
'use server';

import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/auth/rbac';
import { db } from '@/lib/db/client';
import { upsertContact, resolveContactIdentity } from '@/lib/domain/contact';
import { emitTimelineEvent } from '@/lib/timeline/emit';
import { logAudit } from '@/lib/audit/log';
import { toActionResult, ActionError } from '@/lib/actions/result';
import { revalidatePath } from 'next/cache';

const schema = z.object({
  brandId: z.string().uuid(),
  name: z.string().min(2),
  email: z.string().email().nullable().optional(),
  phone: z.string().min(8).nullable().optional(),
  cpf: z.string().regex(/^\d{11}$/).nullable().optional(),
  origin: z.enum(['checkout', 'message', 'import', 'manual', 'integration']),
});

export async function createContact(raw: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession();
    const input = schema.parse(raw);

    await requirePermission(ctx, 'contact.bulk_edit', { kind: 'global' });

    const contact = await db.transaction(async (tx) => {
      const resolution = await resolveContactIdentity(tx, input);
      if (resolution.conflict) {
        throw new ActionError('CONFLICT', 'Conflito de identidade', {
          rule: 'BR-IDENTITY',
        });
      }

      const created = await upsertContact(tx, input);

      await emitTimelineEvent(tx, {
        contactId: created.id,
        kind: 'contact_created',
        source: 'MOD-CONTACT',
        actorUserId: ctx.user.id,
        payload: { origin: input.origin },
      });

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'contact',
        resourceId: created.id,
        after: created,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      });

      return created;
    });

    revalidatePath('/contacts');
    revalidatePath(`/contacts/${contact.id}`);
    return contact;
  });
}
```

### 11.2. `approveRefund`

```ts
'use server';

const schema = z.object({
  refundId: z.string().uuid(),
  note: z.string().max(1000).optional(),
});

export async function approveRefund(raw: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession();
    const { refundId, note } = schema.parse(raw);

    await requirePermission(ctx, 'refund.approve', {
      kind: 'transaction',
      id: refundId,
    });

    const result = await db.transaction(async (tx) => {
      const refund = await approveRefundDomain(tx, { refundId, approver: ctx.user.id, note });

      await emitTimelineEvent(tx, {
        contactId: refund.contactId,
        kind: 'sale_refunded',
        source: 'MOD-REFUND',
        actorUserId: ctx.user.id,
        subjectKind: 'transaction',
        subjectId: refund.transactionId,
        payload: { refund_id: refund.id, reason: refund.reason },
      });

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'refund',
        resourceKind: 'transaction',
        resourceId: refund.transactionId,
        before: { status: 'approved' },
        after: { status: 'refunded', refunded_amount: refund.amount },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId, refund_id: refund.id },
      });

      return refund;
    });

    revalidatePath(`/transactions/${result.transactionId}`);
    revalidatePath('/refunds');
    return result;
  });
}
```

### 11.3. `mergeContacts`

```ts
'use server';

const schema = z.object({
  principalId: z.string().uuid(),
  secondaryId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export async function mergeContacts(raw: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession();
    const input = schema.parse(raw);

    if (input.principalId === input.secondaryId) {
      throw new ActionError('VALIDATION_FAILED', 'principal != secondary');
    }

    await requirePermission(ctx, 'contact.merge', {
      kind: 'contact',
      id: input.principalId,
    });

    const result = await db.transaction(async (tx) => {
      const merge = await mergeContactsDomain(tx, {
        ...input,
        actorUserId: ctx.user.id,
      });

      await emitTimelineEvent(tx, {
        contactId: input.principalId,
        kind: 'contact_merged',
        source: 'MOD-MERGE',
        actorUserId: ctx.user.id,
        payload: {
          merged_into: input.principalId,
          merged_from: input.secondaryId,
          reason: input.reason,
        },
      });

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'merge',
        resourceKind: 'contact',
        resourceId: input.principalId,
        before: { secondaryId: input.secondaryId },
        after: { merged_into: input.principalId, merge_id: merge.id },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId, reason: input.reason },
      });

      return merge;
    });

    revalidatePath(`/contacts/${input.principalId}`);
    revalidatePath(`/contacts/${input.secondaryId}`);
    return result;
  });
}
```

---

## 12. Casos de teste obrigatórios

| ID | Cenário | Esperado |
|---|---|---|
| CT-SA-01 | Input inválido | `{ ok:false, error.code:'VALIDATION_FAILED', issues }` |
| CT-SA-02 | Sem sessão | `UNAUTHORIZED` |
| CT-SA-03 | Sessão sem 2FA em ação crítica | `UNAUTHORIZED` com `rule:'BR-RBAC'` |
| CT-SA-04 | Conflito de estado (aprovar refund já aprovado) | `CONFLICT` |
| CT-SA-05 | Sucesso | `{ ok:true, data }`, timeline emitido, `audit_log` gravado, `revalidatePath` chamado |
| CT-SA-06 | Falha no meio da transação | rollback de tudo (domínio + timeline + audit) |
| CT-SA-07 | Impersonação ativa | `audit_log.impersonating_contact_id` preenchido |
| CT-SA-08 | Correlation ID ausente no header | gerado automaticamente e propagado |

Testes vivem em `tests/integration/actions/<module>.test.ts` + `tests/unit/actions/result.test.ts`.

---

## 14. Server Actions implementadas por módulo (T-0-16)

### MOD-ORGANIZATION — `app/(app)/settings/brands/actions.ts`

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `createBrand(rawInput)` | `user.write` (admin+2FA) | `create / brand` | `/settings/brands` |
| `listBrands()` | `requireSession` | — | — |
| `listBrandsForSwitcher()` | `requireSession` | — | — |

Nota: `listBrandsForSwitcher()` é adicionada em T-12-02 para o Brand Switcher da topbar. Retorna lista simples `{ id, name }` sem filtro por usuário (brand_id é contexto fiscal, não RBAC).

### MOD-ORGANIZATION — `app/(app)/settings/account/actions.ts` (T-12-22)

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `updateProfileAction(rawInput)` | `profile.write` (todos autenticados) | `update / user_account` | `/settings/account` |

Nota: `updateProfileAction` é adicionada em T-12-22 para `/settings/account`. Atualiza `name` (fullName) e `phone` do usuário logado.

### MOD-ORGANIZATION — `app/(app)/settings/legal-entities/actions.ts`

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `createLegalEntity(rawInput)` | `user.write` (admin+2FA) | `create / legal_entity` | `/settings/legal-entities` |
| `listLegalEntities()` | `requireSession` | — | — |
| `listBrandsForSelect()` | `requireSession` | — | — |

### MOD-ORGANIZATION — `app/(app)/settings/users/actions.ts`

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `inviteUser(rawInput)` | `user.write` (admin+2FA) | `create / user_account` | `/settings/users` |
| `listUsers()` | `requireSession` | — | — |

### MOD-CAMPAIGN — `app/(app)/campaigns/actions.ts`

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `createCampaign(rawInput)` | `campaign.write` (admin, marketing, commercial) | `create / campaign` | `/campaigns` |
| `createCreative(rawInput)` | `creative.write` (admin, marketing) | `create / creative` | `/campaigns` |
| `issueTrackableLink(rawInput)` | `campaign.write` (admin, marketing, commercial) | `create / trackable_link` | `/campaigns` |

Nota: `issueTrackableLink` gera slug via `crypto.randomBytes(8).toString('hex')` (16 chars hex) e persiste `utm_snapshot` jsonb via `generateUtm` (função pura — `lib/domain/campaign/generate-utm.ts`).

### MOD-FUNNEL — `app/(app)/funnels/actions.ts`

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `createFunnelAction(rawInput)` | `funnel.create` (admin, marketing, commercial) | `create / funnel` | `/funnels` |
| `createFunnelFullAction(rawInput)` | `funnel.create` (admin, marketing, commercial) | `create / funnel` | `/funnels` |
| `createFunnelStageAction(rawInput)` | `funnel.create` (admin, marketing, commercial) | `create / funnel_stage` | `/funnels/[id]` |
| `enterFunnelAction(rawInput)` | `funnel.manage` (admin, marketing, commercial) | `create / funnel_entry` (só se criada) | `/funnels/[id]` |
| `moveStageAction(rawInput)` | `funnel.manage` (admin, marketing, commercial) | `update / funnel_entry` | `/funnels` (layout) |
| `setOpportunityLabelAction(rawInput)` | `funnel.manage` (admin, marketing, commercial) | `update / funnel_entry` | `/funnels` (layout) |
| `markWonAction(rawInput)` | `funnel.close` (admin, commercial) | `update / funnel_entry` | `/funnels` (layout) |
| `markLostAction(rawInput)` | `funnel.close` (admin, commercial) | `update / funnel_entry` | `/funnels` (layout) |
| `getEntryDetailsAction(rawInput)` | `funnel.manage` | — | — |
| `getEntryTimelineAction(rawInput)` | `funnel.manage` | — | — |
| `updateEntryAction(rawInput)` | `funnel.manage` | `update / funnel_entry` | `/funnels` (layout) |
| `listFunnelEntriesAction(rawInput)` | `funnel.manage` | — | — |

Nota: `createFunnelAction` gera slug automaticamente a partir do nome com sufixo numérico em caso de conflito. `createFunnelFullAction` aceita slug explícito + initialStages array — para uso programático (automações, seed).

Nota: `moveStageAction` inclui comentário `// BR-FUNNEL-OPPORTUNITY: drag-drop usa SELECT FOR UPDATE via tx` — a transação SQL garante consistência de leitura de `current_stage_id` sem dupla-atualização.

Nota: `listFunnelEntriesAction` aceita filtros opcionais `assignee` (UUID), `dateFrom`, `dateTo` (string ISO-date). Retorna até 500 entries com JOIN em `funnel_stage`, `contact`, `user_account`. Usada pela list view alternativa ao kanban (T-12-20).

### MOD-FUNNEL — `app/(app)/funnels/[id]/targets/actions.ts`

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `createSalesTargetAction(rawInput)` | `funnel.manage` (admin, marketing, commercial) | `create / sales_target` | `/funnels/[id]/targets`, `/funnels/[id]` |
| `updateSalesTargetAction(rawInput)` | `funnel.manage` (admin, marketing, commercial) | `update / sales_target` | `/funnels/[id]/targets`, `/funnels/[id]` |

### MOD-CATALOG — `app/(app)/settings/catalog/products/actions.ts`

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `createProductAction(rawInput)` | `catalog.write` (admin, marketing) | `create / product` | `/settings/catalog/products` |
| `updateProductAction(rawInput)` | `catalog.write` (admin, marketing) | `update / product` | `/settings/catalog/products` |
| `archiveProductAction(rawInput)` | `catalog.write` (admin, marketing) | `update / product` | `/settings/catalog/products` |
| `listProductsAction(brandId?)` | `requireSession` | — | — |
| `listBrandsForSelectAction()` | `requireSession` | — | — |
| `listCategoriesForSelectAction(brandId?)` | `requireSession` | — | — |
| `getProductOfferCountsAction(productIds[])` | `requireSession` | — | — |
| `listProductOfferUsageAction(productId)` | `requireSession` | — | — |

Notas:
- `updateProductAction` atualiza `name`, `kind`, `categoryId`, `description`. Brand e slug são imutáveis.
- `archiveProductAction` rejeita com `FORBIDDEN` + `rule: 'INV-CATALOG-05'` se o produto estiver referenciado em `offer_condition_item` com condição `status='active'`.
- `getProductOfferCountsAction` (T-14-02): helper interno, retorna `Record<productId, count>` de ofertas associadas a cada produto. Sem RBAC além de sessão.
- `listProductOfferUsageAction` (T-14-02): retorna array `{ offerId, offerName, offerStatus, offerSlug, kinds[] }[]` — ofertas que usam o produto e seus kind de condições. Sem RBAC além de sessão.

### MOD-CATALOG — `app/(app)/settings/catalog/categories/actions.ts`

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `createCategoryAction(rawInput)` | `catalog.write` (admin, marketing) | `create / product_category` | `/settings/catalog/categories` |
| `updateCategoryAction(rawInput)` | `catalog.write` (admin, marketing) | `update / product_category` | `/settings/catalog/categories` |
| `archiveCategoryAction(rawInput)` | `catalog.write` (admin, marketing) | `delete / product_category` | `/settings/catalog/categories` |
| `listCategoriesAction(brandId?)` | `requireSession` | — | — |
| `listBrandsForCategorySelectAction()` | `requireSession` | — | — |

Nota: `updateCategoryAction` atualiza `name` e `parentId` (null para top-level). Slug e brand são imutáveis. Rejeita ciclos diretos (pai = self).

Nota: `archiveCategoryAction` efetua exclusão física (DELETE). `product.category_id` e `product_category.parent_id` têm `ON DELETE SET NULL` — nenhuma FK bloqueia a operação. Produtos vinculados ficam sem categoria.

### MOD-CATALOG — `app/(app)/settings/catalog/benefits/actions.ts`

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `createBenefitAction(rawInput)` | `catalog.write` (admin, marketing) | `create / commercial_benefit` | `/settings/catalog/benefits` |
| `updateBenefitAction(rawInput)` | `catalog.write` (admin, marketing) | `update / commercial_benefit` | `/settings/catalog/benefits` |
| `archiveBenefitAction(rawInput)` | `catalog.write` (admin, marketing) | `update / commercial_benefit` | `/settings/catalog/benefits` |
| `listBenefitsAction(brandId?)` | `requireSession` | — | — |
| `listBrandsForBenefitSelectAction()` | `requireSession` | — | — |

Nota: `updateBenefitAction` atualiza `name`, `description`, `autoTag`, `defaultDurationMonths`, `deliveryStatusRequired`. Slug é imutável (INV-CATALOG-06: autoTag deve ser kebab-case).

Nota: `archiveBenefitAction` rejeita com `FORBIDDEN` se o benefício estiver referenciado em condição ativa (`offer_condition.status='active'`).

### MOD-OFFER — `app/(app)/offers/actions.ts`

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `createOfferAction(rawInput)` | `offer.write` (admin, commercial — 2FA) | `create / offer` | `/offers` |
| `updateOfferAction(rawInput)` | `offer.write` (admin, commercial — 2FA) | `update / offer` | `/offers`, `/offers/[id]` |
| `publishOfferAction(rawInput)` | `offer.write` (admin, commercial — 2FA) | `update / offer` | `/offers`, `/offers/[id]` |
| `archiveOfferAction(rawInput)` | `offer.write` (admin, commercial — 2FA) | `update / offer` | `/offers`, `/offers/[id]` |
| `createConditionAction(rawInput)` | `offer.write` (admin, commercial — 2FA) | `create / offer_condition` | `/offers/[offerId]` |
| `updateConditionPriorityAction(rawInput)` | `offer.write` (admin, commercial — 2FA) | `update / offer_condition` | `/offers/[offerId]` |
| `createRuleGroupAction(rawInput)` | `offer.write` (admin, commercial — 2FA) | `create / offer_condition_rule_group` | `/offers/[offerId]` |
| `createRuleAction(rawInput)` | `offer.write` (admin, commercial — 2FA) | `create / offer_condition_rule` | `/offers/[offerId]` |
| `addConditionItemAction(rawInput)` | `offer.write` (admin, commercial — 2FA) | `create / offer_condition_item` | `/offers/[offerId]` |
| `addPaymentOptionAction(rawInput)` | `offer.write` (admin, commercial — 2FA) | `create / offer_payment_option` | `/offers/[offerId]` |

Notas:
- `updateOfferAction` atualiza `name`, `slug`, `description`, `type`, `renewsOfferId`. Campos imutáveis (`brandId`, `issuingLegalEntityId`) não são aceitos. Rejeita se `status='archived'`. INV-OFFER-04: `type='renewal'` exige `renewsOfferId`.
- `publishOfferAction` rejeita com `VALIDATION_FAILED` + `rule: 'INV-OFFER-01'` se não existir condição padrão (`is_default=true`) com `status='active'`.
- `createRuleAction` chama `validateRuleParams(kind, params)` antes de persistir; rejeita com `VALIDATION_FAILED` se params não conformam ao schema canônico do kind.
- `updateConditionPriorityAction` registra em `offer_condition_priority_history` (INV-OFFER-02) na mesma transação.
- `createOfferAction` faz seed de `offer_sales_counter` com `onConflictDoNothing` (defesa em profundidade contra trigger duplicado de T-6-11).
- Todas as actions usam `offer.write` que exige 2FA (`requires2fa: true` na RBAC_MATRIX).

### MOD-BILLING — `app/(app)/billing/actions.ts`

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `cancelSubscriptionAction(rawInput)` | `billing.cancel` (admin, financial — 2FA) | `update / subscription` | `/billing`, `/billing/[id]` |
| `retryInstallmentAction(rawInput)` | `billing.retry` (admin, financial — 2FA) | `update / installment` | `/billing` |

Notas:
- `cancelSubscriptionAction` chama `cancelSubscription(tx, subscriptionId, reason)` do domínio. A emissão de `TE-SUBSCRIPTION-CANCELLED` ocorre dentro do domínio (via `cancelSubscription`).
- `retryInstallmentAction` rejeita com `VALIDATION` + `rule: 'BR-BILLING'` se `installment.status !== 'overdue'`. Incrementa `retry_count` e `last_retry_at` — o pagamento real é responsabilidade do provedor externo.

RBAC novas ações adicionadas em `lib/auth/rbac/types.ts` e `lib/auth/rbac/matrix.ts`:
- `billing.cancel`: roles `admin`, `financial`, `requires2fa: true`
- `billing.retry`: roles `admin`, `financial`, `requires2fa: true`

### MOD-INTEGRATIONS — `app/(app)/settings/webhooks/actions.ts`

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `getWebhookLogs(rawInput)` | `requireSession` | — | — |
| `getWebhookLog(rawInput)` | `requireSession` | — | — |
| `reprocessWebhook(rawInput)` | `webhook.reprocess` (admin, financial — 2FA) | `other / webhook_log` | `/settings/webhooks`, `/settings/webhooks/[id]` |

Nota: `reprocessWebhook` aplica `SELECT FOR UPDATE` para evitar corrida (FLOW-12 §E-04); reseta `status='received', attempts=0, lastError=null`; enfileira `digital-guru/webhook.received` no Inngest fora da transação SQL. Apenas `status IN ('failed', 'dead_letter')` pode ser reprocessado — outros retornam `CONFLICT`.

Nota RBAC: `webhook.reprocess` é nova ação na matriz (admin, financial, requires2fa=true). Adicionada em `lib/auth/rbac/types.ts` e `lib/auth/rbac/matrix.ts` para satisfazer FLOW-12 §pré-condições.

### MOD-CONTACT — `app/(app)/contacts/[id]/notes/actions.ts` (T-12-14)

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `createNoteAction(rawInput)` | `contact.write` (todos os roles autenticados) | — | `/contacts/[id]` |
| `updateNoteAction(rawInput)` | `contact.write` + ownership (só autor) | — | `/contacts/[id]` |
| `deleteNoteAction(rawInput)` | `contact.write` + ownership (só autor) | — | `/contacts/[id]` |
| `listNotesAction(rawInput)` | `requireSession` | — | — |

Notas:
- `updateNoteAction` e `deleteNoteAction` verificam `authorUserId === ctx.user.id` e lançam `UNAUTHORIZED` com `rule: 'BR-RBAC'` se o usuário não for o autor.
- `listNotesAction` faz JOIN com `user_account` para retornar `authorEmail` e `authorName`.
- Todas as notas têm `pinned=false` no create; campo existe no schema para uso futuro.

### MOD-TICKET — `app/(app)/tickets/actions.ts`

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `openTicketAction(rawInput)` | `ticket.open` (todos os roles autenticados) | — | `/tickets` |
| `changeTicketStatusAction(rawInput)` | `ticket.open` / `ticket.cancel` (cancelamento) | — | `/tickets`, `/tickets/[id]` |
| `assignTicketAction(rawInput)` | `ticket.open` | — | `/tickets`, `/tickets/[id]` |
| `assignTicketToMeAction(ticketId)` | `ticket.open` | — | `/tickets`, `/tickets/[id]` |
| `addTicketNoteAction(rawInput)` | `ticket.open` | — | `/tickets/[id]` |
| `updateTicketAction(rawInput)` | `ticket.open` | — | `/tickets/[id]`, `/tickets` |
| `getTicketTimeline(rawTicketId)` | `ticket.open` | — | — |
| `listUsersAction()` | `ticket.open` | — | — |

Notas (T-12-30):
- `updateTicketAction` atualiza campo individual (`title`, `description`, `category`, `priority`) e delega a `updateTicket(tx, id, patch)` do domínio. Emite `TE-TICKET-UPDATED`.
- `getTicketTimeline` consulta `timeline_event WHERE subject_kind='ticket' AND subject_id=ticketId`, ordenado por `occurred_at DESC`, limite 100.
- `listUsersAction` retorna `user_account WHERE is_active=true AND deleted_at IS NULL`, ordenado por `full_name`.

### MOD-AUTOMATION — `app/(app)/automations/actions.ts`

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `createFlow(rawInput)` | `automation.write` (admin, marketing) | `create / automation_flow` | `/automations` |
| `updateFlow(rawInput)` | `automation.write` (admin, marketing) | `update / automation_flow` | `/automations`, `/automations/[id]` |
| `publishFlow(rawInput)` | `automation.write` (admin, marketing) | `update / automation_flow` | `/automations`, `/automations/[id]` |
| `unpublishFlow(rawInput)` | `automation.write` (admin, marketing) | `update / automation_flow` | `/automations`, `/automations/[id]` |
| `deleteFlow(rawInput)` | `automation.write` (admin, marketing) | `delete / automation_flow` | `/automations` |
| `createNode(rawInput)` | `automation.write` (admin, marketing) | `create / automation_node` | `/automations/[id]` |
| `updateNode(rawInput)` | `automation.write` (admin, marketing) | `update / automation_node` | `/automations/[id]` |
| `deleteNode(rawInput)` | `automation.write` (admin, marketing) | `delete / automation_node` | `/automations/[id]` |
| `upsertTrigger(rawInput)` | `automation.write` (admin, marketing) | `update / automation_trigger` | — |
| `upsertCondition(rawInput)` | `automation.write` (admin, marketing) | `update / automation_condition` | — |
| `upsertAction(rawInput)` | `automation.write` (admin, marketing) | `update / automation_action` | — |
| `reprocessExecution(rawInput)` | `automation.reprocess` (admin) | `other / automation_execution` | `/automations/[id]/executions` |

Notas:
- `publishFlow` rejeita com `VALIDATION` + `rule: 'INV-AUTOMATION-01'` se `startNodeId IS NULL`.
- `deleteFlow` é soft-delete (`deletedAt = now(), isActive = false`) — nunca DELETE físico.
- `deleteNode` é DELETE físico (nó é filho subordinado com `ON DELETE CASCADE` do flow).
- `upsertCondition` valida `expr` com `conditionExprSchema` antes de persistir (INV-AUTOMATION-04).
- `upsertAction` valida `params` com `actionParamsSchema` (discriminatedUnion por kind) antes de persistir (INV-AUTOMATION-04).
- `upsertTrigger` valida `filter` com `triggerFilterSchema` (discriminatedUnion por kind) quando fornecido.
- `reprocessExecution` só aceita `status='failed'`; cria nova `automation_execution` com `idempotencyKey = "reprocess:<id>:<timestamp>"` e enfileira `automation/run` no Inngest fora da transação SQL.

RBAC novas ações adicionadas em `lib/auth/rbac/types.ts` e `lib/auth/rbac/matrix.ts`:
- `automation.write`: roles `admin`, `marketing`, `requires2fa: false`
- `automation.reprocess`: roles `admin`, `requires2fa: false`

### MOD-NOTIFICATIONS — `app/(app)/notifications/actions.ts` (T-12-04)

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `listNotifications(limit?)` | `requireSession` | — | — |
| `markAllAsRead()` | `requireSession` | — | — |
| `markAsRead(rawInput)` | `requireSession` | — | — |

Notas:
- `listNotifications` retorna últimas N notificações do usuário (default 20), atualmente fallback em `audit_log` filtrado por `actor_user_id`. TODO: migrar para tabela `user_notification` quando criada.
- `markAllAsRead` e `markAsRead` são stubs em T-12-04 (no-op) — implementação real vira TODO quando tabela `user_notification` criada.
- Tipo de retorno: `NotificationItem[]` com campos `id, message, resourceKind, resourceId, isRead, createdAt`.

### MOD-ANALYTICS — `app/(app)/analytics/actions.ts` (T-12-27)

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `saveAnalyticsFiltersAction(input)` | `requireSession` | — | — |
| `listBrandsForAnalytics()` | `requireSession` | — | — |
| `getAnalyticsFilters()` | (helper server-side, não-action) | — | — |

Notas:
- Filtros globais de analytics (`brandId`, `period`) persistidos em cookie `cne_analytics_filters` (max-age: 30 dias).
- `saveAnalyticsFiltersAction` grava cookie (sem mutação de domínio, sem audit, sem RBAC além de session).
- `getAnalyticsFilters` é helper server-side puro (pode ser chamado de Server Components, não é action).
- `listBrandsForAnalytics` retorna marcas ativas `{ id, name }` para dropdown de filtros.

### MOD-SETTINGS — `app/(app)/settings/integrations/actions.ts` (T-12-23)

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `testIntegrationAction(rawInput)` | `integration.configure` (admin+2FA) | — | — |

Nota: `testIntegrationAction` valida env vars do provedor (digital_guru, brevo, whatsapp_official, instagram, notazz) sem fazer request externo. Retorna `{ ok: boolean, message: string }`.

### MOD-SETTINGS — `app/(app)/settings/funnels/actions.ts` (T-12-24)

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `listFunnelsForSettings()` | `funnel.write` (admin, marketing) | — | — |
| `getFunnelWithStages(funnelId)` | `funnel.write` (admin, marketing) | — | — |
| `updateFunnelAction(rawInput)` | `funnel.write` (admin, marketing) | `update / funnel` | `/settings/funnels`, `/funnels/[id]` |
| `listScoreRulesAction(funnelId)` | `funnel.write` (admin, marketing) | — | — |
| `createScoreRuleAction(rawInput)` | `funnel.write` (admin, marketing) | `create / funnel_score_rule` | `/settings/funnels` |
| `updateScoreRuleAction(rawInput)` | `funnel.write` (admin, marketing) | `update / funnel_score_rule` | `/settings/funnels` |
| `deleteScoreRuleAction(rawInput)` | `funnel.write` (admin, marketing) | `delete / funnel_score_rule` | `/settings/funnels` |

Notas (T-12-24):
- `listFunnelsForSettings` retorna funis com metadados: brandName, stageCount, isActive (não deletados).
- `getFunnelWithStages` carrega funil + estágios ordenados por position para edição.
- `updateFunnelAction` atualiza nome + upsert estágios (sem id = criar, com id = atualizar posição/nome). Remove estágios não presentes no input.
- Score rules (create/update/delete) permitem configurar ganho/perda de pontos por evento de funil.

### MOD-SETTINGS (Audit Log Export) — `app/(app)/settings/audit/export/route.ts` (T-12-25)

Route Handler GET para exportar trilha de auditoria como CSV:

| Endpoint | Guard | Filtros | Resposta |
|---|---|---|---|
| `GET /settings/audit/export` | `requireSession` + `audit.read` (admin) | `userId`, `actionKind`, `resourceKind`, `resourceId`, `dateFrom`, `dateTo` (via searchParams) | text/csv com Content-Disposition attachment |

Notas:
- Limita exportação a 10.000 linhas (`EXPORT_LIMIT`).
- CSV contém colunas: `timestamp, actor_email, action_kind, resource_kind, resource_id, changes` (JSON dos before/after).
- Filename: `audit-log-YYYY-MM-DD.csv`.

### MOD-RBAC — `app/(app)/settings/permissions/actions.ts` (T-15-02)

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `grantPermissionAction(rawInput)` | admin-only (BR-RBAC) | `other / role_permission` | `/settings/permissions` |
| `revokePermissionAction(rawInput)` | admin-only (BR-RBAC) | `other / role_permission` | `/settings/permissions` |
| `getRoleMatrixAction()` | admin-only (BR-RBAC) | — | — |

Notas (T-15-02):
- `grantPermissionAction` aceita `{ roleId: UUID, permissionId: UUID }`. Se `role.kind='admin'`, operação é no-op silencioso (admin tem todas as permissões implicitamente).
- `revokePermissionAction` rejeita com `BUSINESS_RULE_VIOLATED` (code `CannotModifyAdminRole`) se tentar revogar permissão do role `admin`.
- `getRoleMatrixAction` retorna `{ roles: RoleMatrixRole[], permissions: RoleMatrixPermission[], assignments: RoleMatrixAssignment[] }` — matriz completa sem filtro. Leitura, sem audit.
- Guard: não há Action `rbac.manage` na matriz canônica (registrado como OQ-RBAC-MANAGE-01); fallback é admin-only via `user.role === 'admin'`.
- Audit gerado pelo domínio (`grantPermission`, `revokePermission` internamente chamam `logAudit`).

### MOD-CHANNEL — `app/(app)/settings/integrations/[provider]/actions.ts` (T-15-05)

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `createChannelAccountAction(rawInput)` | `integration.configure` (admin+2FA) | `create / channel_account` | `/settings/integrations`, `/settings/integrations/[provider]` |
| `updateChannelAccountAction(rawInput)` | `integration.configure` (admin+2FA) | `update / channel_account` | `/settings/integrations`, `/settings/integrations/[provider]` |
| `testConnectionAction(rawInput)` | `integration.configure` (admin+2FA) | — | — |

Notas (T-15-05):
- `createChannelAccountAction` aceita `{ brandId: UUID, channelKind: enum, externalId: string, credentials: Record<string, string> }`. Retorna `{ id: string }` do novo `channel_account`. Credenciais são encriptadas via ADR-18 antes de persistir.
- `updateChannelAccountAction` aceita `{ id: UUID, credentials?: Record<string, string>, isActive?: boolean }`. Se `credentials` fornecidas, re-encripta antes de UPDATE. Retorna `ActionResult<void>`.
- `testConnectionAction` aceita `{ id: UUID }`. **Phase 1:** placeholder que retorna `{ ok: true, message: '...' }`. Integração real com provedores (WhatsApp, Instagram, etc.) fica Sprint 16+. Retorna `{ ok: boolean, message: string }`.
- Validação Zod: `channelKind` é enum `['whatsapp', 'instagram', 'email']`. Rejeita `VALIDATION` se invalid.
- Erros: `NOT_FOUND` para brand/channel_account não encontrado; `VALIDATION` para duplicate (brandId, channelKind, externalId) ou channelKind inválido.
- ADR-18: credenciais persistidas como `CredentialEnvelope` (jsonb) com `{ v: 1, encryptedAt: ISO string, ciphertext: base64 }`. Plaintext nunca em listagem.
- Audit gerado por `createChannelAccount` / `updateChannelAccount` do domínio (chamadas via transação).

---

## 13. Open Questions

- `OQ-SA-01`: formulários complexos com optimistic UI — quando usar `useActionState` vs mutação manual?
- `OQ-SA-02`: Actions que afetam múltiplos contatos (bulk) — particionar em N transações ou 1 transação grande?
- `OQ-SA-03`: rate-limit por Action crítica (refund, impersonate) — camada de middleware ou dentro da Action?
