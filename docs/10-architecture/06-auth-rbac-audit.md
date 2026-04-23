# 06 — Auth, RBAC e Auditoria

Autenticação, autorização e trilha de auditoria. Complementa [BR-RBAC](../50-business-rules/BR-RBAC.md), [BR-AUDIT](../50-business-rules/BR-AUDIT.md) e [`30-contracts/06-audit-trail-spec.md`](../30-contracts/06-audit-trail-spec.md).

---

## 1. Autenticação — Supabase Auth

### 1.1. Fatores suportados

| Fator | Quem usa | Observação |
|---|---|---|
| Email + senha | Todos | Política mínima: 10 chars, sem dicionário trivial |
| Magic link | Todos (fallback, recuperação) | TTL 15 min |
| TOTP (2FA) | `admin`, `financial` **obrigatório**; demais opcional | App autenticador padrão (Google/1Password) |
| WebAuthn / Passkey | Fase 2 | — |

### 1.2. Fluxo de login

```
1. /login  -> form email+senha (client)
2. Server Action loginAction:
     - supabase.auth.signInWithPassword()
     - Se usuário tem 2FA: redireciona para /login/2fa
3. /login/2fa -> input TOTP
4. Server Action verifyTotp:
     - supabase.auth.mfa.verify()
     - Set cookie `twoFactorRecentlyVerifiedAt = now()`
5. Redirect -> /app/contacts (ou `returnTo`)
```

Middleware Next.js (`middleware.ts`) usa `@supabase/ssr` para refresh de sessão em cada navegação.

### 1.3. `requireSession()`

Helper canônico consumido por toda Server Action ([`30-contracts/05-api-server-actions.md §4`](../30-contracts/05-api-server-actions.md)):

```ts
// lib/auth/session.ts
import { cookies, headers } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { ActionError } from '@/lib/actions/result';

export async function requireSession(): Promise<SessionContext> {
  const supabase = createServerClient(/* ... */);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new ActionError('UNAUTHORIZED', 'no session');

  const userAccount = await loadUserAccount(user.id);
  if (!userAccount || userAccount.deletedAt) {
    throw new ActionError('UNAUTHORIZED', 'user disabled');
  }

  const twoFactorRecentlyVerified =
    userAccount.twoFactorVerifiedAt !== null &&
    Date.now() - userAccount.twoFactorVerifiedAt.getTime() < 5 * 60_000;

  const impersonatingContactId = readImpersonationCookie();

  return {
    user: {
      id: userAccount.id,
      role: userAccount.role,
      has2fa: userAccount.has2fa,
      twoFactorRecentlyVerified,
    },
    impersonatingContactId,
    ip: headers().get('x-forwarded-for') ?? null,
    userAgent: headers().get('user-agent') ?? null,
    correlationId: headers().get('x-correlation-id') ?? crypto.randomUUID(),
  };
}
```

### 1.4. Sessão e expiração

| Item | Valor |
|---|---|
| TTL de sessão | 30 dias (rotação automática a cada refresh) |
| Inatividade forçada | 7 dias sem uso -> refresh negado |
| Logout forçado | Admin pode revogar sessões via UI (invalida refresh token Supabase) |
| 2FA fresh window | 5 minutos ([BR-RBAC OQ-01](../50-business-rules/BR-RBAC.md)) |

Logout:

```ts
await supabase.auth.signOut();     // invalida sessão atual
await revokeAllSessionsForUser();  // apenas admin, via service role
```

---

## 2. RBAC

### 2.1. Modelo

Implementação declarativa baseada na matriz canônica ([BR-RBAC](../50-business-rules/BR-RBAC.md)). Tabelas:

```sql
CREATE TABLE role (
  id uuid PRIMARY KEY,
  kind role_kind NOT NULL UNIQUE,          -- 'admin','financial','marketing','support','commercial'
  description text
);

CREATE TABLE permission (
  id uuid PRIMARY KEY,
  action text NOT NULL UNIQUE,             -- 'refund.approve', 'offer.write', ...
  requires_two_factor boolean NOT NULL DEFAULT false
);

CREATE TABLE role_permission (
  role_id uuid REFERENCES role(id),
  permission_id uuid REFERENCES permission(id),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_account (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  role_kind role_kind NOT NULL,            -- Fase 1: 1 papel por usuário
  has_2fa boolean NOT NULL DEFAULT false,
  two_factor_verified_at timestamptz NULL,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Seed (uma vez, em migration inicial) popula `role`, `permission` e `role_permission` a partir da matriz canônica. Alterações na matriz viram migration dedicada + atualização de `BR-RBAC.md` (serial).

### 2.2. `can()` e `requirePermission()`

`can()` é **função pura** que consulta uma matriz em memória (carregada uma vez a partir do DB no boot, com invalidação):

```ts
// lib/auth/rbac/matrix.ts
export function can(user: User, action: Action, resource: Resource): boolean {
  const entry = RBAC_MATRIX[action];
  if (!entry) return false;
  if (!entry.roles.includes(user.role)) return false;
  if (entry.requires2fa && !(user.has2fa && user.twoFactorRecentlyVerified)) return false;
  // resource-specific hooks (ex.: own vs any)
  return true;
}

// lib/auth/rbac/require.ts
export async function requirePermission(
  ctx: SessionContext,
  action: Action,
  resource: Resource,
): Promise<void> {
  if (!can(ctx.user, action, resource)) {
    throw new ActionError('UNAUTHORIZED', `denied: ${action}`, { rule: 'BR-RBAC' });
  }
}
```

Uso:

```ts
await requirePermission(ctx, 'refund.approve', { kind: 'transaction', id: refundId });
```

Chamado **sempre antes** da transação. Falha cedo.

### 2.3. UI — permissão como primeira classe

Componentes usam hook `useCan(action, resource)` (server component usa `can()` direto):

```tsx
<Show when={can(user, 'refund.approve', { kind: 'transaction', id: tx.id })}>
  <ApproveButton />
</Show>
```

Nunca depender apenas da UI: Server Action sempre re-verifica.

---

## 3. Impersonação

Operadores com permissão `contact.impersonate` podem "entrar como" contato — útil para suporte, financial, commercial revisando vendas.

### 3.1. Fluxo

```
1. Operador clica "Impersonar" no perfil do contato
2. Server Action startImpersonation:
     - requirePermission(ctx, 'contact.impersonate', { kind:'contact', id })
     - audit(tx, { action_kind:'impersonate', resource_kind:'contact', ... })
     - Set cookie `impersonation` assinado (HMAC), TTL 30 min,
       payload: { contactId, startedAt, actorUserId }
     - Emite TE-IMPERSONATION-STARTED na timeline do contato
3. Banner UI mostra "Você está visualizando como <contato>"
4. Enquanto cookie ativo, TODAS as Server Actions e timeline_event / audit_log gravam:
     - actor_user_id = operador (original)
     - impersonating_contact_id = contato
5. Operador clica "Encerrar":
     - Clear cookie
     - audit(tx, { action_kind:'impersonate', after:{ ended:true } })
     - Emite TE-IMPERSONATION-ENDED
```

### 3.2. Regras

1. **Operador é sempre o `actor`.** Contato **nunca** é autor legal da ação.
2. **Não se impersona usuário interno.** Apenas `contact`.
3. **Ações sensíveis continuam exigindo permissão do operador.** Impersonação não escala permissão.
4. **2FA fresh** exigido para ações críticas mesmo durante impersonação.
5. Cookie HMAC-signed com secret `IMPERSONATION_SIGNING_KEY` (env).

---

## 4. Auditoria — visão arquitetural

Regras canônicas em [BR-AUDIT](../50-business-rules/BR-AUDIT.md); contrato técnico em [`30-contracts/06-audit-trail-spec.md`](../30-contracts/06-audit-trail-spec.md). Aqui: como o sistema compõe as três tabelas.

### 4.1. Três fontes complementares

| Fonte | Responde "o quê?" | Escopo |
|---|---|---|
| `audit_log` | Quem mexeu em quê, por quê, quando — **compliance administrativo** | Ações sensíveis (RBAC, transação, refund, integração, impersonação, oferta) |
| `timeline_event` | O que aconteceu **com o contato**, em ordem — **narrativa do contato** | Eventos visíveis na jornada |
| `<entidade>_history` + `*_status_history` | Histórico granular de mudança de status/valor de um registro — **diagnóstico fino** | Por entidade (conversation, ticket, entitlement, transaction, etc.) |

Uma operação crítica pode gerar entradas nas três.

Exemplo — aprovar refund:

1. `audit_log` (`action_kind='refund'`, `resource_kind='transaction'`, `before.status='approved'`, `after.status='refunded'`).
2. `timeline_event` (`kind='sale_refunded'`, `source='MOD-REFUND'`).
3. `transaction_status_history` (`from_status='approved'`, `to_status='refunded'`).
4. `entitlement_status_history` (cada entitlement revogado).

### 4.2. Helper único de escrita

```ts
// lib/audit/log.ts
export async function audit(tx: DbTx, entry: AuditEntry): Promise<void>;
```

Regras de uso invioláveis ([`30-contracts/06-audit-trail-spec.md §4`](../30-contracts/06-audit-trail-spec.md)):

1. **Sempre dentro** da mesma `tx` do efeito.
2. **Sempre** com `correlationId` em `context`.
3. **Sanitização automática** de campos sensíveis (`api_key`, `secret`, `token`, `password`, `card_*`).
4. **Whitelist de `resource_kind`** validada em tempo de execução.

### 4.3. Quando NÃO auditar

- Leituras (ver telemetria de acesso em Axiom).
- Emissão de `timeline_event` (já é registro).
- Alta frequência operacional (contadores incrementais, CDC de última atividade).

Ver [`30-contracts/06-audit-trail-spec.md §3`](../30-contracts/06-audit-trail-spec.md).

### 4.4. Retenção

- **Mínimo 3 anos** por lei ([BR-AUDIT](../50-business-rules/BR-AUDIT.md)).
- Particionamento trimestral via `pg_partman` a partir do 4º ano.
- Export semanal para bucket cold (Supabase Storage `backups-cold`).
- Expurgo **proibido** sem ADR + pedido formal.

---

## 5. 2FA — enforcement detalhado

| Ação | Exige 2FA fresh? (≤ 5 min) |
|---|---|
| `refund.open`, `refund.approve` | Sim |
| `offer.write` (criar/editar oferta) | Sim |
| `contact.unmerge` | Sim |
| `contact.impersonate` | Sim |
| `contact.bulk_edit` | Sim |
| `integration.configure` | Sim |
| `user.write` (criar/desativar usuário) | Sim |
| `offer.condition.write` | Não |
| `campaign.write`, `creative.write`, `funnel.write` | Não |
| `inbox.reply`, `ticket.open`, `ticket.cancel` | Não |

Ao executar ação 2FA-requerida com `twoFactorRecentlyVerified=false`, Server Action retorna `UNAUTHORIZED` com `rule='BR-RBAC'`. UI mostra modal "Reconfirme sua identidade (2FA)".

---

## 6. Configuração de sessão crítica

### 6.1. Cookies

| Cookie | Propósito | Atributos |
|---|---|---|
| `sb-access-token`, `sb-refresh-token` | Supabase Auth | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` |
| `impersonation` | Cookie HMAC com `contactId`, TTL 30min | `HttpOnly`, `Secure`, `SameSite=Strict` |
| `correlation_id` | Gerado pelo middleware quando ausente | Não cookie — header apenas |
| `2fa_verified_at` | Não existe como cookie — persistido em `user_account.two_factor_verified_at` | — |

### 6.2. Middleware Next.js

```ts
// middleware.ts (sketch)
import { NextResponse } from 'next/server';
import { updateSession } from '@/lib/auth/middleware';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // 1. Refresh session Supabase
  await updateSession(req, res);

  // 2. Injetar correlation id
  if (!req.headers.get('x-correlation-id')) {
    res.headers.set('x-correlation-id', crypto.randomUUID());
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/inngest).*)'],
};
```

---

## 7. Segurança adicional

| Item | Mecanismo |
|---|---|
| Proteção CSRF em Server Actions | Next.js nativa (Origin header check) |
| Rate limit login | Supabase Auth nativo; Fase 2: reforço via Inngest |
| Rate limit Server Actions sensíveis | `lib/ratelimit.ts` (Supabase KV ou Inngest throttling), aplicado a `refund.*`, `contact.impersonate` |
| Rotação de secrets | Trimestral; calendário em `docs/90-meta` |
| Headers HTTP | `Content-Security-Policy`, `X-Frame-Options=DENY`, `Strict-Transport-Security` configurados em `next.config.js` |
| Password leak check | Supabase Auth integra `HaveIBeenPwned` na criação |

---

## 8. Casos de teste

| ID | Cenário | Esperado |
|---|---|---|
| CT-AUTH-01 | Acesso a `/app/*` sem sessão -> redirect `/login` | middleware |
| CT-AUTH-02 | 2FA expirada em ação crítica -> `UNAUTHORIZED` com `rule=BR-RBAC` | unit |
| CT-AUTH-03 | Impersonação ativa grava `impersonating_contact_id` em audit + timeline | integration |
| CT-AUTH-04 | Admin revoga sessão de outro user -> `refresh_token` invalidado | integration |
| CT-AUTH-05 | Mudança de senha encerra todas sessões -> re-login obrigatório | integration |
| CT-AUTH-06 | Matriz RBAC cobre todas as Actions declaradas (sem órfãs) | unit (introspection) |
| CT-AUTH-07 | `can()` retorna `false` para ação inexistente | unit |

Testes em `tests/unit/auth/` e `tests/integration/auth/`.

---

## 9. Open Questions

- `OQ-AUTH-01`: passkey/WebAuthn como substituto do TOTP na Fase 2 — matar senha?
- `OQ-AUTH-02`: multi-role por usuário (Fase 2) ou manter 1-papel-por-usuário permanentemente?
- `OQ-AUTH-03`: rate limit por Action crítica — usar Supabase Edge Config ou Inngest como throttle?
