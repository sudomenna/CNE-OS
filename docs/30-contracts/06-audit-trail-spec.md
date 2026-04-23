# Contrato da trilha de auditoria

Especificação técnica de `audit_log`: DDL, escopo, consulta, helper. Regra de negócio canônica em [BR-AUDIT](../50-business-rules/BR-AUDIT.md); este documento é o **contrato fixo** que consumidores (Server Actions, jobs, admin tools) obedecem.

---

## 1. DDL canônico

```sql
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id uuid NULL,
  actor_user_id uuid NULL REFERENCES user_account(id) ON DELETE RESTRICT,
  actor_system text NULL,                        -- ex.: 'digital_guru', 'automation', 'cron'
  impersonating_contact_id uuid NULL REFERENCES contact(id) ON DELETE RESTRICT,
  action_kind audit_action_kind NOT NULL,
  resource_kind text NOT NULL,                   -- 'transaction','contact','offer','offer_condition','user_account','user_role','role','webhook_log','integration','entitlement','refund'
  resource_id uuid NULL,
  before jsonb NOT NULL DEFAULT '{}',
  after jsonb NOT NULL DEFAULT '{}',
  ip text NULL,
  user_agent text NULL,
  note text NULL,
  context jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_audit_actor CHECK (
    actor_user_id IS NOT NULL OR actor_system IS NOT NULL
  )
);

CREATE INDEX idx_audit_resource ON audit_log (resource_kind, resource_id);
CREATE INDEX idx_audit_actor ON audit_log (actor_user_id, created_at DESC);
CREATE INDEX idx_audit_time ON audit_log (created_at DESC);
CREATE INDEX idx_audit_correlation ON audit_log (correlation_id);
CREATE INDEX idx_audit_action ON audit_log (action_kind, created_at DESC);

-- Trigger: bloquear UPDATE/DELETE (append-only)
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

Notas:

- `correlation_id` liga a linha ao request/Action/job originador (ver [`05-api-server-actions.md §9`](./05-api-server-actions.md)).
- `impersonating_contact_id` é preenchido quando operador agia impersonando contato ([BR-RBAC](../50-business-rules/BR-RBAC.md)).
- `ON DELETE RESTRICT` em `actor_user_id` evita que desativação de usuário apague histórico.

---

## 2. Escopo obrigatório — o que AUDITAR

Ações críticas que **devem** gerar linha em `audit_log`:

### 2.1. RBAC e gestão de acesso

| Ação | `action_kind` | `resource_kind` |
|---|---|---|
| Criar usuário interno | `create` | `user_account` |
| Atualizar usuário (e-mail, status, 2FA) | `update` | `user_account` |
| Desativar usuário | `delete` | `user_account` |
| Atribuir/remover papel | `update` | `user_role` |
| Alterar permissões de papel (matriz) | `update` | `role` |
| Impersonar contato (início) | `impersonate` | `contact` |
| Encerrar impersonação | `impersonate` | `contact` (`after.ended=true`) |

### 2.2. Transação e snapshot

| Ação | `action_kind` | `resource_kind` |
|---|---|---|
| Mudança de `transaction.status` | `status_change` | `transaction` |
| Criação manual de transação | `create` | `transaction` |
| Alteração de valor/campos sensíveis | `update` | `transaction` |

Snapshot em si (`transaction_snapshot`) **não é editado**, portanto não gera audit (imutável por contrato, [BR-SNAPSHOT-IMMUTABILITY](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md)). A flag `transaction_snapshot_flag` (`normal`/`refunded`/`disputed`) altera-se via operação que já audita na `transaction`.

### 2.3. Entitlement

| Ação | `action_kind` | `resource_kind` |
|---|---|---|
| Concessão manual | `create` | `entitlement` |
| Mudança de `status` | `status_change` | `entitlement` |
| Revogação | `update` | `entitlement` |

### 2.4. Oferta e condições

| Ação | `action_kind` | `resource_kind` |
|---|---|---|
| Criar/atualizar oferta | `create`/`update` | `offer` |
| Mudar `offer.status` | `status_change` | `offer` |
| Criar/atualizar condição | `create`/`update` | `offer_condition` |
| Mudar `offer_condition.status` | `status_change` | `offer_condition` |
| Arquivar oferta ou condição | `update` | `offer`/`offer_condition` |

### 2.5. Contato — ações raras/sensíveis

| Ação | `action_kind` | `resource_kind` |
|---|---|---|
| Merge | `merge` | `contact` |
| Unmerge | `unmerge` | `contact` |
| Bulk edit | `update` | `contact` (1 linha por contato afetado OU 1 com `after.ids=[...]`) |
| Blacklist | `status_change` | `contact` |
| Delete lógico | `delete` | `contact` |

### 2.6. Refund

| Ação | `action_kind` | `resource_kind` |
|---|---|---|
| Abrir pedido de reembolso | `create` | `refund` |
| Aprovar | `refund` | `transaction` (cruzado em `refund` via `context.refund_id`) |
| Rejeitar | `update` | `refund` |
| Marcar processado (externo confirmou) | `status_change` | `refund` |

### 2.7. Integrações

| Ação | `action_kind` | `resource_kind` |
|---|---|---|
| Configurar credencial/endpoint | `update` | `integration` (segredos mascarados em §5) |
| Reprocessar webhook | `update` | `webhook_log` |

---

## 3. O que NÃO auditar

Auditar ruído enche a tabela e dilui investigação. **Não** auditar:

- Leituras (`SELECT`, listagens, detalhe) — telemetria de acesso vai para Axiom, não para `audit_log`.
- Emissão de `timeline_event` — a timeline já é o registro.
- Envio de mensagem outbound normal em inbox (já registrado em `timeline_event` e `message`).
- Mutação de tabelas operacionais de alta frequência: `conversation.last_activity_at`, contadores de clique de campanha, `offer.sales_count` incremento automático (o aprovar da transação já audita o efeito).
- Login bem-sucedido (vai para log de autenticação Supabase). Falha de login crítica pode ir, mas não obrigatória.
- Automações executando em loop (a execução fica em `automation_execution`).

Exceção: qualquer operação **manual** sobre os itens acima (ex.: edição manual de `offer.sales_count`) audita.

---

## 4. Helper canônico

Assinatura única para escrita:

```ts
// lib/audit/log.ts
import type { AuditActionKind } from '@/lib/db/enums';
import type { DbTx } from '@/lib/db/client';

export type AuditEntry = {
  actorUserId?: string | null;
  actorSystem?: string | null;
  impersonatingContactId?: string | null;
  actionKind: AuditActionKind;
  resourceKind: string;
  resourceId?: string | null;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
  note?: string | null;
  context?: Record<string, unknown>;    // correlationId vai aqui
};

export async function audit(tx: DbTx, entry: AuditEntry): Promise<void>;
```

Regras de uso:

1. Chamar **sempre dentro** da mesma transação `tx` do efeito (atomicidade).
2. Invariante: `entry.actorUserId || entry.actorSystem` tem que ser truthy (constraint enforça).
3. Helper mascara campos sensíveis automaticamente (§5) antes de persistir.
4. Helper valida `resourceKind` contra whitelist em `lib/audit/resource-kinds.ts` — `resourceKind` novo exige PR + update da whitelist.

Exemplo mínimo:

```ts
await audit(tx, {
  actorUserId: ctx.user.id,
  impersonatingContactId: ctx.impersonatingContactId,
  actionKind: 'status_change',
  resourceKind: 'transaction',
  resourceId: tx.id,
  before: { status: 'pending' },
  after: { status: 'approved' },
  ip: ctx.ip,
  userAgent: ctx.userAgent,
  context: { correlationId: ctx.correlationId },
});
```

---

## 5. Sanitização de campos sensíveis

Antes de persistir, `audit()` substitui valores sensíveis por `'***'`:

| Campo | Onde | Comportamento |
|---|---|---|
| `api_key`, `secret`, `token`, `password`, `webhook_secret` | `before`, `after`, `context` | mascarado recursivamente |
| `cpf`, `cnpj` | não mascarado (auditoria financeira exige) |
| `email`, `phone` | não mascarado (necessário para investigação) |
| `card_*`, `pan` | sempre mascarado |

Whitelist/blacklist em `lib/audit/sanitize.ts`. Teste CT-AUDIT-06 garante que adicionar chave nova não sensível não quebra.

---

## 6. Retenção e arquivamento

- **Retenção mínima: 3 anos** ([BR-AUDIT §1.4](../50-business-rules/BR-AUDIT.md)). Nenhum `DELETE` antes disso, sob nenhuma hipótese.
- **Particionamento:** a partir do 4º ano, tabela é particionada por trimestre via `pg_partman`:
  ```
  audit_log_2027_q1, audit_log_2027_q2, ...
  ```
- Partições com mais de 3 anos completos podem ser movidas para `audit_log_archive` (tablespace em storage frio), acessíveis via `UNION ALL` em views de investigação.
- Expurgo além do arquivo frio **só** via ADR aprovado + pedido formal.

---

## 7. Consulta — tela de admin

Rota: `app/(app)/settings/audit/page.tsx`. Acesso: `admin` (apenas leitura; `financial` tem view filtrada a ações financeiras).

Filtros suportados:

| Filtro | Coluna |
|---|---|
| Ator (usuário) | `actor_user_id` |
| Sistema | `actor_system` |
| Ação | `action_kind` |
| Recurso | `resource_kind` + `resource_id` |
| Período | `created_at` range |
| Correlation ID | `correlation_id` |
| Impersonação | `impersonating_contact_id IS NOT NULL` |

Paginação keyset por `(created_at DESC, id DESC)` para evitar offset em tabela grande.

Export CSV: `admin` pode exportar resultado filtrado (até 100k linhas por export). Campos: todos exceto `context.secretRedactedKeys`. Export gera linha em `audit_log` (meta-auditoria): `action_kind='other'`, `resource_kind='audit_log'`, `after={ rows_exported, filters }`.

---

## 8. Casos de teste

| ID | Cenário | Esperado |
|---|---|---|
| CT-AUDIT-01 | INSERT via `audit()` com dados válidos | linha persistida, trigger não dispara |
| CT-AUDIT-02 | `UPDATE audit_log SET note='x' WHERE id=$1` | erro `audit_log is append-only` |
| CT-AUDIT-03 | `DELETE FROM audit_log WHERE id=$1` | erro `audit_log is append-only` |
| CT-AUDIT-04 | INSERT com `actor_user_id IS NULL AND actor_system IS NULL` | erro `ck_audit_actor` |
| CT-AUDIT-05 | INSERT de webhook Digital Guru com `actor_system='digital_guru'` | linha aceita, `actor_user_id IS NULL` |
| CT-AUDIT-06 | `before.api_key='real-value'` | persistido como `***` |
| CT-AUDIT-07 | Query por `actor_user_id` no último mês | usa `idx_audit_actor`, retorna keyset ordenado |
| CT-AUDIT-08 | Query por `resource_kind='transaction'` + `resource_id=T1` | usa `idx_audit_resource` |
| CT-AUDIT-09 | Export CSV via admin | gera nova linha em `audit_log` (meta) com `action_kind='other'` |
| CT-AUDIT-10 | Impersonação: `impersonating_contact_id` preenchido e consultável por filtro |
| CT-AUDIT-11 | Transação que falha após `audit()` rollback | nenhuma linha em `audit_log` |

Testes vivem em `tests/integration/audit/append-only.test.ts`, `tests/integration/audit/sanitize.test.ts`, `tests/unit/audit/log-audit.test.ts`.

---

## 9. Interação com outros contratos

- **Timeline** ([`03-timeline-event-catalog.md`](./03-timeline-event-catalog.md)) e audit são complementares, não redundantes:
  - Timeline = jornada do **contato** (quem viu o quê, quando aconteceu).
  - Audit = log de **ações administrativas** para compliance (quem mexeu em quê, por que).
  - Uma mesma operação pode gerar ambos (ex.: aprovar refund → `TE-SALE-REFUNDED` + `audit_log.action_kind='refund'`).
- **Server Actions** ([`05-api-server-actions.md §7`](./05-api-server-actions.md)) carregam `correlationId` que casa as três tabelas: request → timeline → audit.
- **Webhook** ([`04-webhook-contracts.md`](./04-webhook-contracts.md)) reprocessamento manual audita (`action_kind='update'`, `resource_kind='webhook_log'`).

---

## 10. Open Questions

- `OQ-AUDIT-SPEC-01`: particionamento trimestral vs mensal — volume esperado no Ano 2 define granularidade.
- `OQ-AUDIT-SPEC-02`: anonimização de `ip` (últimos octetos) por LGPD — aplicar em 100% ou só após 1 ano?
- `OQ-AUDIT-SPEC-03`: auditar leitura de dados pessoais de contato (acesso a CPF, documento)? Base legal LGPD favorece, custo de volume alto.
- `OQ-AUDIT-SPEC-04`: integração com SIEM externo no futuro — exportar stream via Axiom?
