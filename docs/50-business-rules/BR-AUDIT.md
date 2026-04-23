# BR-AUDIT: trilha de auditoria imutável

## Enunciado

1. **Toda ação crítica** registra linha em `audit_log`. Escopo:
   - ações da matriz RBAC marcadas como críticas (ver [BR-RBAC](./BR-RBAC.md));
   - mudanças em `transaction` (status, valores);
   - mudanças em `entitlement` (concessão, extensão, revogação);
   - mudanças em `offer` e `offer_condition` (create/update/archive);
   - `merge` e `unmerge` de contato;
   - `impersonate` de contato;
   - configuração de integração externa;
   - criação/edição/remoção de usuário interno.
2. **Formato canônico** da tabela `audit_log`:
   ```
   id, actor_user_id, action_kind, resource_kind, resource_id,
   before jsonb, after jsonb, ip, user_agent, created_at
   ```
3. **Append-only.** Trigger bloqueia `UPDATE` e `DELETE` em `audit_log`.
4. **Retenção mínima: 3 anos.** Expurgo anterior requer ADR e processo formal; Fase 1 não expurga.
5. `actor_user_id` pode ser `NULL` somente quando a ação foi executada por `actor_system` (ex.: webhook de integração); neste caso `before.actor_system` descreve a origem.
6. `before`/`after` guardam o **snapshot parcial** dos campos alterados; jamais incluir secrets ou senhas.

## Motivação

Governança, LGPD, conciliação financeira e investigação de incidentes. Imutabilidade evita que operador cubra rastros. Formato único simplifica queries de compliance.

## Escopo

- Módulos: todos que executam ações críticas. Emissão centralizada em `lib/audit/log.ts`.
- Entidades: `audit_log`, mais entidades observadas (transaction, entitlement, offer, offer_condition, user_account, contact).

## Enforcement

- [x] DB trigger — append-only em `audit_log`.
- [x] Função de domínio — `logAudit(entry)` chamada em Server Actions.
- [x] Guard em Server Action — toda ação crítica chama `logAudit` dentro da mesma transação SQL do efeito.
- [x] RLS/permissões — apenas leitura para `admin`; escrita via SECURITY DEFINER do servidor.

## DDL / constraint SQL

```sql
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NULL REFERENCES user_account(id),
  actor_system text NULL,                         -- ex.: 'digital_guru', 'automation'
  action_kind audit_action_kind NOT NULL,
  resource_kind text NOT NULL,                    -- 'transaction','contact','offer',...
  resource_id uuid NULL,
  before jsonb NOT NULL DEFAULT '{}',
  after jsonb NOT NULL DEFAULT '{}',
  ip text NULL,
  user_agent text NULL,
  context jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_audit_actor CHECK (actor_user_id IS NOT NULL OR actor_system IS NOT NULL)
);

CREATE INDEX idx_audit_resource ON audit_log (resource_kind, resource_id);
CREATE INDEX idx_audit_actor ON audit_log (actor_user_id);
CREATE INDEX idx_audit_time ON audit_log (created_at DESC);

-- Append-only
CREATE OR REPLACE FUNCTION audit_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (TG_OP=%)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_append_only();
```

## Contrato TS

```ts
import type { AuditActionKind } from '@/lib/db/enums';

export type AuditEntry = {
  actorUserId?: string | null;
  actorSystem?: string | null;
  actionKind: AuditActionKind;
  resourceKind: string;
  resourceId?: string | null;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
  context?: Record<string, unknown>;
};

export async function logAudit(entry: AuditEntry): Promise<void>;
```

Uso obrigatório em Server Actions de ações críticas, **dentro da mesma transação** do efeito (atomicidade).

## Tabela: o que é registrado

| Evento | action_kind | resource_kind | Campos before/after |
|---|---|---|---|
| Reembolso aprovado | `refund` | `transaction` | status, refunded_amount |
| Alteração em oferta | `update` | `offer` | campos mudados |
| Criação de condição | `create` | `offer_condition` | objeto criado |
| Merge de contato | `merge` | `contact` | merged_into, merged_from |
| Unmerge | `unmerge` | `contact` | merge_id |
| Impersonate | `impersonate` | `contact` | duration, target |
| Config integração | `update` | `integration` | provider, fields (sem secrets) |
| Mudança status transação | `status_change` | `transaction` | from, to |
| Exclusão contato | `delete` | `contact` | snapshot |

## Casos de teste

1. **CT-AUDIT-01 — Update em oferta gera 1 linha**
   - Dado: `offer.price` alterado por user U.
   - Quando: Server Action `updateOffer` executa.
   - Então: `audit_log` tem 1 linha com `action_kind='update'`, `resource_kind='offer'`, `before.price=100`, `after.price=120`, `actor_user_id=U.id`.

2. **CT-AUDIT-02 — DELETE em audit_log falha**
   - Dado: linha existente em `audit_log`.
   - Quando: `DELETE FROM audit_log WHERE id=...`.
   - Então: erro `audit_log is append-only`.

3. **CT-AUDIT-03 — UPDATE em audit_log falha**
   - Idem, erro de trigger.

4. **CT-AUDIT-04 — Ação por sistema sem usuário**
   - Dado: webhook Digital Guru aprova venda.
   - Quando: `logAudit({actorSystem:'digital_guru', actionKind:'status_change', resourceKind:'transaction', ...})`.
   - Então: linha aceita; `actor_user_id IS NULL`, `actor_system='digital_guru'`.

5. **CT-AUDIT-05 — Constraint de actor**
   - Dado: `logAudit({actorUserId:null, actorSystem:null, ...})`.
   - Então: erro de `ck_audit_actor`.

6. **CT-AUDIT-06 — Secrets não vazam**
   - Dado: `updateIntegrationConfig` altera `api_key`.
   - Quando: registro de auditoria.
   - Então: `before.api_key`/`after.api_key` estão mascarados (`'***'`); teste verifica.

## Rastreabilidade

- Teste esperado: `tests/integration/audit/append-only.test.ts`, `tests/unit/audit/log-audit.test.ts`.
- Referenciada em: [BR-RBAC](./BR-RBAC.md), [BR-REFUND](./BR-REFUND.md), [BR-MERGE](./BR-MERGE.md), [MOD-TRANSACTION], [MOD-ENTITLEMENT], [MOD-OFFER].

## Open Questions

- `OQ-BR-AUDIT-01`: retenção além de 3 anos — movimento para storage frio? Particionamento por ano?
- `OQ-BR-AUDIT-02`: queries de auditoria para `financial` (somente ações financeiras) — view dedicada ou filtro na app?
- `OQ-BR-AUDIT-03`: campo `ip` precisa anonimização por LGPD (últimos octetos)?
