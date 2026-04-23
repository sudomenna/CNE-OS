# Merge e pendências de contato (Módulo MOD-MERGE)

## 1. Finalidade

Modelar **pendências de identidade** (`contact_issue`) abertas pelo resolvedor `BR-IDENTITY` quando não há resolução automática segura, e o **merge não-destrutivo** de dois contatos em um principal, com registro de autor, motivo, antes/depois, possibilidade de **undo** e reemissão do histórico. Este módulo opera sobre o agregado `contact` (MOD-CONTACT) sem alterá-lo: apenas reaponta FKs e marca `merged_into_id`.

## 2. Ownership (paralelização)

- Arquivos que POSSUI (edita):
  - `lib/db/schema/contact_merge.ts` (tabelas `contact_issue`, `contact_merge`, `contact_merge_undo`)
  - `lib/db/schema/_relations/contact_merge.ts`
  - `lib/domain/merge/` — `mergeContacts()`, `undoMerge()`, `resolveIssue()`
  - `app/(app)/contacts/[id]/issues/` — UI de resolução de pendência
  - `app/(app)/contacts/merge/` — UI de merge manual
  - `tests/unit/merge/**`, `tests/integration/merge/**`
- Arquivos que LÊ (read-only):
  - `lib/db/schema/contact.ts` (lê e atualiza `merged_into_id` via Server Action exposta por MOD-CONTACT; não edita o schema)
  - `docs/50-business-rules/BR-MERGE.md`, `BR-IDENTITY.md`, `BR-RBAC.md`
  - `docs/30-contracts/01-enums.md` (`contact_issue_kind`, `contact_issue_status`)
- Interfaces públicas expostas:
  - `openIssue(input): ContactIssue`
  - `resolveIssue(issueId, resolution)`
  - `mergeContacts(principalId, secondaryId, reason, actorUserId): MergeResult`
  - `undoMerge(mergeId, actorUserId)`

## 3. Entidades e campos

### 3.1 `contact_issue`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `contact_id` | uuid | não | — | FK `contact(id)` — contato "foco" da pendência |
| `related_contact_id` | uuid | sim | — | FK `contact(id)` — outro contato envolvido quando aplicável |
| `kind` | `contact_issue_kind` | não | — | enum |
| `status` | `contact_issue_status` | não | `'open'` | enum |
| `detail` | text | não | — | descrição humana |
| `payload` | jsonb | não | `'{}'` | dados estruturados (ex.: `{ email: '...', phone: '...' }`) |
| `opened_by_system` | text | sim | — | `'identity_resolver'`, `'automation'`, `'integration'` |
| `opened_by_user_id` | uuid | sim | — | FK `user_account(id)` |
| `resolved_by_user_id` | uuid | sim | — | FK `user_account(id)` |
| `resolution` | text | sim | — | resumo humano |
| `resolved_at` | timestamptz | sim | — | — |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |

Índices: `idx_contact_issue_contact_status (contact_id, status)`, `idx_contact_issue_open (status) WHERE status = 'open'`.

### 3.2 `contact_merge`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `principal_contact_id` | uuid | não | — | FK `contact(id) ON DELETE RESTRICT` |
| `secondary_contact_id` | uuid | não | — | FK `contact(id) ON DELETE RESTRICT` |
| `reason` | text | não | — | — |
| `issue_id` | uuid | sim | — | FK `contact_issue(id) ON DELETE SET NULL` |
| `merged_by_user_id` | uuid | não | — | FK `user_account(id) ON DELETE RESTRICT` |
| `reassigned_tables` | jsonb | não | `'{}'` | contagem por tabela: `{ transaction: 3, conversation: 1, ... }` |
| `principal_snapshot` | jsonb | não | — | estado do principal **antes** do merge |
| `secondary_snapshot` | jsonb | não | — | estado do secundário **antes** do merge |
| `undone_at` | timestamptz | sim | — | timestamp do undo (SET pelo mesmo registro ou via `contact_merge_undo`) |
| `created_at` | timestamptz | não | `now()` | — |

`ck_contact_merge_distinct`: `principal_contact_id <> secondary_contact_id`.

### 3.3 `contact_merge_undo`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `merge_id` | uuid | não | — | FK `contact_merge(id) ON DELETE RESTRICT`, `uq_contact_merge_undo_merge` |
| `reason` | text | não | — | — |
| `undone_by_user_id` | uuid | não | — | FK `user_account(id) ON DELETE RESTRICT` — exige papel `admin` ou `financial` (ver `BR-RBAC`) |
| `reverted_tables` | jsonb | não | `'{}'` | — |
| `created_at` | timestamptz | não | `now()` | — |

### 3.4 DDL

```sql
CREATE TABLE contact_issue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  related_contact_id uuid REFERENCES contact(id) ON DELETE SET NULL,
  kind contact_issue_kind NOT NULL,
  status contact_issue_status NOT NULL DEFAULT 'open',
  detail text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_by_system text,
  opened_by_user_id uuid REFERENCES user_account(id) ON DELETE SET NULL,
  resolved_by_user_id uuid REFERENCES user_account(id) ON DELETE SET NULL,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contact_issue_contact_status ON contact_issue (contact_id, status);
CREATE INDEX idx_contact_issue_open ON contact_issue (status) WHERE status = 'open';

CREATE TABLE contact_merge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_contact_id uuid NOT NULL REFERENCES contact(id) ON DELETE RESTRICT,
  secondary_contact_id uuid NOT NULL REFERENCES contact(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  issue_id uuid REFERENCES contact_issue(id) ON DELETE SET NULL,
  merged_by_user_id uuid NOT NULL REFERENCES user_account(id) ON DELETE RESTRICT,
  reassigned_tables jsonb NOT NULL DEFAULT '{}'::jsonb,
  principal_snapshot jsonb NOT NULL,
  secondary_snapshot jsonb NOT NULL,
  undone_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_contact_merge_distinct CHECK (principal_contact_id <> secondary_contact_id)
);
CREATE INDEX idx_contact_merge_principal ON contact_merge (principal_contact_id);
CREATE INDEX idx_contact_merge_secondary ON contact_merge (secondary_contact_id);

CREATE TABLE contact_merge_undo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merge_id uuid NOT NULL REFERENCES contact_merge(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  undone_by_user_id uuid NOT NULL REFERENCES user_account(id) ON DELETE RESTRICT,
  reverted_tables jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_contact_merge_undo_merge UNIQUE (merge_id)
);
```

## 4. Relações (ASCII)

```
contact (principal) <──┐
                       │   contact_merge ──> contact_issue (opcional)
contact (secondary) <──┘         │
                                 └── contact_merge_undo (0..1)
```

## 5. Invariantes

- `INV-MERGE-01`: um `contact_merge` tem `principal_contact_id <> secondary_contact_id` (CHECK).
- `INV-MERGE-02`: após merge, `contact.merged_into_id` do secundário **é igual** a `principal_contact_id` e nenhum registro novo pode ser criado com o id do secundário como alvo (guard na Server Action de MOD-CONTACT).
- `INV-MERGE-03`: undo é atômico: reseta `merged_into_id = NULL` no secundário e reaponta todas as FKs listadas em `reassigned_tables` do registro `contact_merge`.
- `INV-MERGE-04`: `contact_merge_undo` tem relação 1-1 com `contact_merge` (`uq_contact_merge_undo_merge`). Undo só pode ocorrer uma vez por merge.
- `INV-MERGE-05`: `contact_issue` com `status = 'resolved'` exige `resolved_by_user_id` e `resolved_at` preenchidos.
- `INV-MERGE-06`: fechar uma `contact_issue` via merge preenche automaticamente `contact_merge.issue_id` e marca a issue como `resolved`.

## 6. Estados e transições

### 6.1 `contact_issue.status`

| Origem | Evento | Destino | Guard |
|---|---|---|---|
| `open` | atendente resolve manualmente | `resolved` | `resolution` preenchida + `resolved_by_user_id` |
| `open` | merge executado vinculado à issue | `resolved` | `contact_merge.issue_id` setado |
| `open` | atendente ignora (falso positivo) | `ignored` | `resolution` preenchida |
| `resolved`/`ignored` | atendente reabre | `open` | exige justificativa; novo ciclo |

### 6.2 `contact_merge`

| Origem | Evento | Destino | Guard |
|---|---|---|---|
| (criado) | `undone_at IS NULL` | vigente | — |
| vigente | admin/financial executa undo | `undone_at = now()` + `contact_merge_undo` criado | `BR-RBAC`: somente papéis `admin` ou `financial` |

## 7. Regras de negócio referenciadas

- [`BR-MERGE`](../50-business-rules/BR-MERGE.md) — merge não-destrutivo, undo, reapontamento de FKs.
- [`BR-IDENTITY`](../50-business-rules/BR-IDENTITY.md) — quem abre issue e com que kind.
- [`BR-RBAC`](../50-business-rules/BR-RBAC.md) — quem pode executar merge / undo.
- [`BR-AUDIT`](../50-business-rules/BR-AUDIT.md) — merge e undo geram `audit_log`.
- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md) — contrato de emissão.

## 8. Eventos de timeline emitidos

| TE | Quando | Payload |
|---|---|---|
| `TE-CONTACT-ISSUE-OPENED` | nova `contact_issue` criada | `{ issue_id, kind, detail }` |
| `TE-CONTACT-ISSUE-RESOLVED` | `contact_issue` muda para `resolved`/`ignored` | `{ issue_id, resolution }` |
| `TE-CONTACT-MERGED` | `contact_merge` inserido | `{ merged_into, merged_from, reason }` — emitido no **principal** e no **secundário** |
| `TE-CONTACT-UNMERGED` | `contact_merge_undo` inserido | `{ merge_id }` — emitido no principal e no secundário |

## 9. Fluxos relacionados

- `FLOW-IDENTITY-RESOLUTION` — atendente abre pendência, escolhe merge ou correção manual.
- `FLOW-MERGE-MANUAL` — merge iniciado pelo atendente direto na UI.
- `FLOW-MERGE-UNDO` — admin/financeiro desfaz merge.

## 10. Casos de teste obrigatórios

- `issue.open-by-resolver` — `BR-IDENTITY` no cenário "e-mail match, telefone diferente, sem CPF" cria `contact_issue` com `kind = 'email_duplicate'` e emite `TE-CONTACT-ISSUE-OPENED`.
- `merge.happy-path` — merge de dois contatos: secundário recebe `merged_into_id`, transações do secundário reapontam para principal, evento `TE-CONTACT-MERGED` aparece nas duas timelines.
- `merge.preserves-transactions` — transações, conversas, tickets, tags do secundário passam a ser visíveis na visão do principal.
- `merge.snapshots-before-state` — `principal_snapshot` e `secondary_snapshot` contêm o estado pré-merge completo (nome, CPF, telefones, e-mails).
- `merge.resolves-linked-issue` — merge vinculado a `issue_id` marca a issue como `resolved` automaticamente.
- `merge.rejects-same-contact` — tentar merge com `principal = secondary` falha no CHECK.
- `undo.admin-only` — `commercial` tentando undo é negado; `admin` consegue.
- `undo.restores-fks` — após undo, transações voltam a apontar para o contato secundário, `merged_into_id` vira NULL e `TE-CONTACT-UNMERGED` é emitido.
- `undo.once-per-merge` — segundo undo no mesmo `contact_merge` falha por `uq_contact_merge_undo_merge`.
- `issue.reopen.requires-reason` — reabrir issue sem justificativa é recusado pela Server Action.

## 11. Open Questions

- `OQ-MERGE-01` — sugerir merge automático baseado em similaridade (nome + telefone) está no escopo da Fase 1 ou só manual?
- `OQ-MERGE-02` — merge múltiplo (>2 contatos em uma operação) é composição de N merges 2-a-2 ou precisa de operação transacional dedicada?
- `OQ-MERGE-03` — precisamos de um "soft-merge" (apenas marcar como provável duplicata sem reapontar FKs) como estado intermediário?
