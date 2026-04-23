# BR-RBAC: controle de acesso por papel

## Enunciado

1. Cada usuário interno tem **um papel** (`role_kind`): `admin`, `financial`, `marketing`, `support`, `commercial`.
2. Toda ação crítica do sistema tem autorização verificada por função pura `can(user, action, resource)` baseada na matriz canônica.
3. Autorização é **declarativa por tabela**: o código não compõe `if role==='admin'` — consulta a matriz.
4. **2FA (TOTP) é obrigatório** para `admin` e `financial` para ações críticas: reembolso, exclusão de contato, edição de oferta, edição de condição, configuração de integração, criação/edição de usuário interno.
5. Toda ação crítica autorizada gera linha em `audit_log` (ver [BR-AUDIT](./BR-AUDIT.md)).
6. Na Fase 1 não há escopo por marca — papel é global. Fase 2 adiciona escopo.

## Motivação

Centralizar decisão de autorização em um ponto testável, auditável e alterável sem cirurgia. Evita duplicação de lógica de permissão por tela. Materializa a matriz do PRD ([personas-rbac-matrix](../00-product/03-personas-rbac-matrix.md)) como artefato executável.

## Escopo

- Módulos: todos. Guard aplicado em Server Actions e em UI (read-only de permissão).
- Entidades: `user_account`, `role_kind` (enum), ações enumeradas pela matriz.

## Enforcement

- [x] Função de domínio pura — `can()` sobre tabela declarativa.
- [x] Guard em Server Action — chamada obrigatória antes de mutações críticas.
- [x] Guard em UI — oculta/desabilita elementos conforme `can()`.
- [x] Auditoria — ações críticas geram `audit_log`.
- [x] 2FA — enforce no login e re-check no momento da ação crítica.

## Contrato TS

```ts
export type Role = 'admin' | 'financial' | 'marketing' | 'support' | 'commercial';

export type Action =
  | 'billing.view'
  | 'refund.open'
  | 'refund.approve'
  | 'offer.write'
  | 'offer.condition.write'
  | 'coupon.write'
  | 'campaign.write'
  | 'creative.write'
  | 'funnel.write'
  | 'contact.merge'
  | 'contact.unmerge'
  | 'contact.impersonate'
  | 'contact.bulk_edit'
  | 'integration.configure'
  | 'user.write'
  | 'inbox.reply'
  | 'ticket.open'
  | 'ticket.cancel';

export type User = {
  id: string;
  role: Role;
  has2fa: boolean;
  twoFactorRecentlyVerified: boolean; // verificação fresh (≤ 5 min) na sessão
};

export type Resource =
  | { kind: 'global' }
  | { kind: 'contact'; id: string }
  | { kind: 'offer'; id: string }
  | { kind: 'transaction'; id: string }
  | { kind: 'ticket'; id: string }
  | { kind: 'campaign'; id: string }
  | { kind: 'funnel'; id: string };

export function can(user: User, action: Action, resource: Resource): boolean;
```

A função é **pura** e consulta a tabela abaixo. Ações marcadas como "2FA" exigem `user.has2fa && user.twoFactorRecentlyVerified`.

## Tabela de decisão (matriz canônica)

| Ação | admin | financial | marketing | support | commercial | 2FA? |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `billing.view` | ✅ | ✅ | ❌ | ❌ | ✅ | — |
| `refund.open` | ✅ | ✅ | ❌ | ❌ | ❌ | sim |
| `refund.approve` | ✅ | ✅ | ❌ | ❌ | ❌ | sim |
| `offer.write` | ✅ | ❌ | ❌ | ❌ | ✅ | sim |
| `offer.condition.write` | ✅ | ❌ | ✅ | ❌ | ✅ | — |
| `coupon.write` | ✅ | ❌ | ❌ | ❌ | ✅ | — |
| `campaign.write` | ✅ | ❌ | ✅ | ❌ | ✅ | — |
| `creative.write` | ✅ | ❌ | ✅ | ❌ | ❌ | — |
| `funnel.write` | ✅ | ❌ | ✅ | ❌ | ✅ | — |
| `contact.merge` | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `contact.unmerge` | ✅ | ✅ | ❌ | ❌ | ❌ | sim |
| `contact.impersonate` | ✅ | ✅ | ❌ | ✅ | ✅ | sim |
| `contact.bulk_edit` | ✅ | ✅ | ❌ | ✅ | ✅ | sim |
| `integration.configure` | ✅ | ❌ | ❌ | ❌ | ❌ | sim |
| `user.write` | ✅ | ❌ | ❌ | ❌ | ❌ | sim |
| `inbox.reply` | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `ticket.open` | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `ticket.cancel` | ✅ | ✅ | ❌ | ✅ | ✅ | — |

Implementação: `lib/auth/rbac/matrix.ts` exporta o objeto `RBAC_MATRIX` e `can()` o consulta.

## Casos de teste

1. **CT-RBAC-01 — Financial não cria oferta**
   - Dado: `user = { role: 'financial', has2fa: true, twoFactorRecentlyVerified: true }`.
   - Quando: `can(user, 'offer.write', {kind:'global'})`.
   - Então: `false`.

2. **CT-RBAC-02 — Marketing não aprova reembolso**
   - Dado: `user.role='marketing'`.
   - Quando: `can(user, 'refund.approve', {kind:'transaction', id:'T1'})`.
   - Então: `false`.

3. **CT-RBAC-03 — Admin pode tudo**
   - Dado: `user.role='admin'`, 2FA verificado.
   - Quando: `can(user, any_action, any_resource)`.
   - Então: `true` para toda ação da matriz.

4. **CT-RBAC-04 — 2FA ausente bloqueia ação crítica**
   - Dado: `user.role='admin'`, `twoFactorRecentlyVerified=false`.
   - Quando: `can(user, 'refund.approve', ...)`.
   - Então: `false` (mesmo sendo admin).

5. **CT-RBAC-05 — Suporte responde inbox**
   - Dado: `user.role='support'`.
   - Quando: `can(user, 'inbox.reply', ...)`.
   - Então: `true`.

6. **CT-RBAC-06 — Comercial cria oferta com 2FA**
   - Dado: `user.role='commercial'`, 2FA verificado.
   - Quando: `can(user, 'offer.write', {kind:'offer',id:'O1'})`.
   - Então: `true`. Sem 2FA fresh: `false`.

## Rastreabilidade

- Teste esperado: `tests/unit/auth/rbac.test.ts`.
- Referenciada em: todos os módulos com Server Actions; [BR-AUDIT](./BR-AUDIT.md); [BR-REFUND](./BR-REFUND.md).
- Fonte humana: [`00-product/03-personas-rbac-matrix.md`](../00-product/03-personas-rbac-matrix.md).

## Open Questions

- `OQ-BR-RBAC-01`: janela de "2FA recentemente verificado" — 5 min é adequado? (tradeoff UX × segurança)
- `OQ-BR-RBAC-02`: ação `contact.bulk_edit` exige 2FA mesmo para `support` no dia-a-dia?
- `OQ-BR-RBAC-03`: escopo por marca na Fase 2 — representar como filtro adicional em `can()` ou tabela separada?
