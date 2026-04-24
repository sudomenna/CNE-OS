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
| `createFunnelStageAction(rawInput)` | `funnel.create` (admin, marketing, commercial) | `create / funnel_stage` | `/funnels/[id]` |
| `enterFunnelAction(rawInput)` | `funnel.manage` (admin, marketing, commercial) | `create / funnel_entry` (só se criada) | `/funnels/[id]` |
| `moveStageAction(rawInput)` | `funnel.manage` (admin, marketing, commercial) | `update / funnel_entry` | `/funnels` (layout) |
| `setOpportunityLabelAction(rawInput)` | `funnel.manage` (admin, marketing, commercial) | `update / funnel_entry` | `/funnels` (layout) |
| `markWonAction(rawInput)` | `funnel.close` (admin, commercial) | `update / funnel_entry` | `/funnels` (layout) |
| `markLostAction(rawInput)` | `funnel.close` (admin, commercial) | `update / funnel_entry` | `/funnels` (layout) |

Nota: `moveStageAction` inclui comentário `// BR-FUNNEL-OPPORTUNITY: drag-drop usa SELECT FOR UPDATE via tx` — a transação SQL garante consistência de leitura de `current_stage_id` sem dupla-atualização.

### MOD-FUNNEL — `app/(app)/funnels/[id]/targets/actions.ts`

| Função | Guard | Audit | Revalida |
|---|---|---|---|
| `createSalesTargetAction(rawInput)` | `funnel.manage` (admin, marketing, commercial) | `create / sales_target` | `/funnels/[id]/targets`, `/funnels/[id]` |
| `updateSalesTargetAction(rawInput)` | `funnel.manage` (admin, marketing, commercial) | `update / sales_target` | `/funnels/[id]/targets`, `/funnels/[id]` |

---

## 13. Open Questions

- `OQ-SA-01`: formulários complexos com optimistic UI — quando usar `useActionState` vs mutação manual?
- `OQ-SA-02`: Actions que afetam múltiplos contatos (bulk) — particionar em N transações ou 1 transação grande?
- `OQ-SA-03`: rate-limit por Action crítica (refund, impersonate) — camada de middleware ou dentro da Action?
