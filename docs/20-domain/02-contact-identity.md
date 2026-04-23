# Contato e identidade (Módulo MOD-CONTACT)

## 1. Finalidade

Cadastro único global de **pessoas físicas** (contatos) do ecossistema CNE, com resolução de identidade por CPF → telefone → e-mail, múltiplos telefones/e-mails/documentos, classificação comercial operacional (lead/cliente/aluno/lead pago), tags, campos personalizados, notas e histórico append-only de status. É o agregado-raiz do CRM: todas as demais entidades do sistema (conversa, ticket, transação, oportunidade) apontam para um `contact_id`.

## 2. Ownership (paralelização)

- Arquivos que POSSUI (edita):
  - `lib/db/schema/contact.ts` (todas as tabelas listadas na §3)
  - `lib/db/schema/_relations/contact.ts`
  - `lib/domain/contact/` — resolvers de identidade, classificação, normalização de telefone/e-mail/CPF
  - `lib/domain/contact/normalize.ts`
  - `app/(app)/contacts/` — listagem, detalhe, edição, resolução de pendências (UI de `contact_issue` é de MOD-MERGE, ver §2 daquele módulo)
  - `app/(app)/contacts/actions.ts` — Server Actions: criar, atualizar, tag, nota, mudança de status
  - `tests/unit/contact/**`
- Arquivos que LÊ (read-only):
  - `docs/30-contracts/01-enums.md` (`contact_status`, `contact_phone_status`, `contact_email_status`, `contact_classification`, `contact_issue_kind`)
  - `docs/50-business-rules/BR-IDENTITY.md`, `BR-CONTACT-CLASSIFICATION.md`, `BR-MERGE.md`, `BR-TIMELINE.md`
  - `lib/db/schema/organization.ts` (para `brand_id` em campos custom scopados por marca)
  - `lib/db/schema/transaction.ts` (leitura para calcular classificação)
- Interfaces públicas expostas:
  - `resolveContactIdentity(input): IdentityResolution` — ver [`BR-IDENTITY`](../50-business-rules/BR-IDENTITY.md).
  - `classifyContact(contactId): ContactClassification` — ver [`BR-CONTACT-CLASSIFICATION`](../50-business-rules/BR-CONTACT-CLASSIFICATION.md).
  - `applyTag(contactId, tag, source)`, `removeTag(contactId, tag)`.
  - `changeContactStatus(contactId, to, reason)` — cria linha em `contact_status_history` e emite `TE-CONTACT-UPDATED`/`TE-CONTACT-BLACKLISTED`.

## 3. Entidades e campos

### 3.1 `contact`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `full_name` | text | não | — | — |
| `cpf` | varchar(11) | sim | — | `uq_contact_cpf` (parcial WHERE cpf IS NOT NULL AND deleted_at IS NULL), `ck_contact_cpf_length` |
| `status` | `contact_status` | não | `'active'` | — |
| `classification` | `contact_classification` | não | `'lead'` | — |
| `birth_date` | date | sim | — | — |
| `origin` | text | sim | — | marca de onde veio ('checkout','message','import','manual','integration') |
| `merged_into_id` | uuid | sim | — | FK `contact(id)` — quando mergeado, aponta para o principal |
| `notes_summary` | text | sim | — | resumo livre |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |
| `deleted_at` | timestamptz | sim | — | soft-delete |

### 3.2 `contact_phone`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `contact_id` | uuid | não | — | FK `contact(id) ON DELETE CASCADE` |
| `e164` | varchar(16) | não | — | telefone normalizado em E.164, `uq_contact_phone_e164` (parcial WHERE status NOT IN ('invalid')) |
| `status` | `contact_phone_status` | não | `'secondary'` | — |
| `whatsapp_checked_at` | timestamptz | sim | — | — |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |

Índice único parcial `uq_contact_phone_primary`: um único `status='primary'` por `contact_id`.

### 3.3 `contact_email`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `contact_id` | uuid | não | — | FK `contact(id) ON DELETE CASCADE` |
| `email` | text | não | — | normalizado (lowercase, trim), `uq_contact_email` (parcial WHERE status NOT IN ('invalid','unsubscribed')) |
| `status` | `contact_email_status` | não | `'alternative'` | — |
| `verified_at` | timestamptz | sim | — | — |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |

Índice único parcial `uq_contact_email_primary`: único `status='primary'` por `contact_id`.

### 3.4 `contact_document`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `contact_id` | uuid | não | — | FK `contact(id) ON DELETE CASCADE` |
| `kind` | text | não | — | `'rg'`, `'passport'`, `'cnh'`, `'other'` — CPF vive na `contact.cpf` |
| `value` | text | não | — | — |
| `issuer` | text | sim | — | — |
| `created_at` | timestamptz | não | `now()` | — |

### 3.5 `contact_tag`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `contact_id` | uuid | não | — | FK `contact(id) ON DELETE CASCADE` |
| `tag` | text | não | — | normalizada em kebab-case lower |
| `source` | text | não | `'manual'` | `'manual'|'benefit'|'automation'` |
| `applied_by` | uuid | sim | — | FK `user_account(id) ON DELETE SET NULL` |
| `created_at` | timestamptz | não | `now()` | `uq_contact_tag` em `(contact_id, tag)` |

### 3.6 `contact_custom_field`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `contact_id` | uuid | não | — | FK `contact(id) ON DELETE CASCADE` |
| `brand_id` | uuid | sim | — | FK `brand(id)` — null = campo global |
| `key` | text | não | — | slug do campo |
| `value` | jsonb | não | `'null'` | — |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | `uq_contact_custom_field` em `(contact_id, brand_id, key)` |

### 3.7 `contact_note`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `contact_id` | uuid | não | — | FK `contact(id) ON DELETE CASCADE` |
| `author_user_id` | uuid | não | — | FK `user_account(id) ON DELETE RESTRICT` |
| `body` | text | não | — | — |
| `pinned` | boolean | não | `false` | — |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |

### 3.8 `contact_status_history` (append-only)

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `contact_id` | uuid | não | — | FK `contact(id)` |
| `from_status` | `contact_status` | sim | — | — |
| `to_status` | `contact_status` | não | — | — |
| `from_classification` | `contact_classification` | sim | — | — |
| `to_classification` | `contact_classification` | sim | — | — |
| `changed_by` | uuid | sim | — | FK `user_account(id) ON DELETE SET NULL` |
| `reason` | text | sim | — | — |
| `created_at` | timestamptz | não | `now()` | trigger bloqueia UPDATE/DELETE |

### 3.9 DDL Drizzle/SQL

```sql
CREATE TABLE contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  cpf varchar(11),
  status contact_status NOT NULL DEFAULT 'active',
  classification contact_classification NOT NULL DEFAULT 'lead',
  birth_date date,
  origin text,
  merged_into_id uuid REFERENCES contact(id) ON DELETE SET NULL,
  notes_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT ck_contact_cpf_length CHECK (cpf IS NULL OR (char_length(cpf) = 11 AND cpf ~ '^[0-9]{11}$'))
);
CREATE UNIQUE INDEX uq_contact_cpf ON contact (cpf)
  WHERE cpf IS NOT NULL AND deleted_at IS NULL AND merged_into_id IS NULL;
CREATE INDEX idx_contact_classification ON contact (classification);
CREATE INDEX idx_contact_status ON contact (status);
CREATE INDEX idx_contact_merged_into ON contact (merged_into_id);

CREATE TABLE contact_phone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  e164 varchar(16) NOT NULL,
  status contact_phone_status NOT NULL DEFAULT 'secondary',
  whatsapp_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_contact_phone_e164 ON contact_phone (e164)
  WHERE status <> 'invalid';
CREATE UNIQUE INDEX uq_contact_phone_primary ON contact_phone (contact_id)
  WHERE status = 'primary';

CREATE TABLE contact_email (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  email text NOT NULL,
  status contact_email_status NOT NULL DEFAULT 'alternative',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_contact_email ON contact_email (email)
  WHERE status NOT IN ('invalid','unsubscribed');
CREATE UNIQUE INDEX uq_contact_email_primary ON contact_email (contact_id)
  WHERE status = 'primary';

CREATE TABLE contact_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  kind text NOT NULL,
  value text NOT NULL,
  issuer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contact_document_contact ON contact_document (contact_id);

CREATE TABLE contact_tag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  tag text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  applied_by uuid REFERENCES user_account(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_contact_tag UNIQUE (contact_id, tag)
);

CREATE TABLE contact_custom_field (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES brand(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_contact_custom_field UNIQUE (contact_id, brand_id, key)
);

CREATE TABLE contact_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES user_account(id) ON DELETE RESTRICT,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contact_note_contact ON contact_note (contact_id, created_at DESC);

CREATE TABLE contact_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contact(id),
  from_status contact_status,
  to_status contact_status NOT NULL,
  from_classification contact_classification,
  to_classification contact_classification,
  changed_by uuid REFERENCES user_account(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contact_status_history_contact ON contact_status_history (contact_id, created_at DESC);
-- Trigger append-only (bloqueia UPDATE/DELETE) aplicado por helper padrão.
```

## 4. Relações (ASCII)

```
contact 1──* contact_phone
        1──* contact_email
        1──* contact_document
        1──* contact_tag
        1──* contact_custom_field
        1──* contact_note
        1──* contact_status_history
        0..1─> contact (merged_into_id)
        1──* timeline_event (read-only de MOD-TIMELINE)
        1──* contact_issue (read-only de MOD-MERGE)
```

## 5. Invariantes

- `INV-CONTACT-01`: no máximo 1 `contact_phone.status = 'primary'` por contato.
- `INV-CONTACT-02`: no máximo 1 `contact_email.status = 'primary'` por contato.
- `INV-CONTACT-03`: `contact.cpf`, quando preenchido, é único no universo de contatos vivos e não-mergeados (índice parcial).
- `INV-CONTACT-04`: `contact_phone.e164` é único entre registros não inválidos.
- `INV-CONTACT-05`: `contact_email.email` é único entre registros não `invalid`/`unsubscribed`.
- `INV-CONTACT-06`: contato com `merged_into_id IS NOT NULL` é imutável exceto pelos campos de auditoria (ver `BR-MERGE`).
- `INV-CONTACT-07`: mudança em `cpf`, `status` ou `classification` sempre gera linha em `contact_status_history` e evento de timeline correspondente.
- `INV-CONTACT-08`: todo `contact_phone.e164` é armazenado já normalizado em E.164; toda `contact_email.email` em lowercase/trim; toda `contact.cpf` com 11 dígitos numéricos sem máscara.

## 6. Estados e transições

### 6.1 `contact.status`

| Origem | Evento | Destino | Guard |
|---|---|---|---|
| `active` | admin/automação marca inválido | `invalid` | bounce definitivo, CPF inválido, telefone inexistente |
| `active` | admin bloqueia | `blocked` | emite `TE-CONTACT-BLACKLISTED` |
| `active` | admin desativa | `inactive` | nenhum entitlement ativo |
| `invalid`/`inactive` | admin reativa | `active` | exige justificativa |
| `blocked` | admin desbloqueia | `active` | exige papel admin |

Toda transição grava linha em `contact_status_history`.

### 6.2 `contact.classification`

Transições determinadas por `BR-CONTACT-CLASSIFICATION`. Emite `TE-CONTACT-CLASSIFICATION-CHANGED`.

## 7. Regras de negócio referenciadas

- [`BR-IDENTITY`](../50-business-rules/BR-IDENTITY.md) — resolução/criação de contato a partir de input externo.
- [`BR-CONTACT-CLASSIFICATION`](../50-business-rules/BR-CONTACT-CLASSIFICATION.md) — lead/cliente/aluno/lead pago.
- [`BR-MERGE`](../50-business-rules/BR-MERGE.md) — unificação não-destrutiva (módulo vizinho MOD-MERGE).
- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md) — contrato de emissão de eventos.
- [`BR-AUDIT`](../50-business-rules/BR-AUDIT.md) — registro de alterações sensíveis.

## 8. Eventos de timeline emitidos

| TE | Quando | Payload |
|---|---|---|
| `TE-CONTACT-CREATED` | após `INSERT` em `contact` bem-sucedido | `{ origin, source_ref? }` |
| `TE-CONTACT-UPDATED` | mudança em `full_name`, `cpf`, `primary phone/email`, `status` | `{ field, from, to }` |
| `TE-CONTACT-CLASSIFICATION-CHANGED` | `classification` muda | `{ from, to, reason }` |
| `TE-CONTACT-TAG-ADDED` | `contact_tag` inserida | `{ tag, source }` |
| `TE-CONTACT-TAG-REMOVED` | `contact_tag` removida | `{ tag }` |
| `TE-CONTACT-BLACKLISTED` | `status` → `blocked` | `{ reason }` |

`TE-CONTACT-ISSUE-OPENED`/`RESOLVED` e `TE-CONTACT-MERGED`/`UNMERGED` são emitidos por MOD-MERGE.

## 9. Fluxos relacionados

- `FLOW-INGEST-CHECKOUT` — webhook de checkout cria ou atualiza contato via `resolveContactIdentity`.
- `FLOW-INGEST-MESSAGE` — mensagem inbound cria contato mínimo (telefone/email).
- `FLOW-IDENTITY-RESOLUTION` — pendência aberta pela tabela de decisão.
- `FLOW-TAG-FROM-BENEFIT` — compra de oferta com benefício aplica tag.

## 10. Casos de teste obrigatórios

- `contact.create.normalizes-inputs` — telefone `(11) 98888-7777` persiste como `+5511988887777`; e-mail com maiúsculas vira lower.
- `contact.create.rejects-invalid-cpf` — CPF com 10 dígitos é rejeitado pelo CHECK.
- `contact.phone.primary.unique-per-contact` — promover um segundo telefone a `primary` viola o índice único parcial.
- `contact.email.primary.unique-per-contact` — idem para e-mail.
- `contact.cpf.unique-across-live-contacts` — segundo contato com mesmo CPF viola `uq_contact_cpf` (índice parcial ignora contatos mergeados/deletados).
- `contact.phone.e164.unique-when-active` — telefone idêntico em contatos diferentes só é permitido se algum deles estiver `invalid`.
- `contact.status.change.creates-history` — mudar para `blocked` cria linha em `contact_status_history` e `TE-CONTACT-BLACKLISTED`.
- `contact.tag.apply.idempotent` — reaplicar mesma tag respeita `uq_contact_tag` e não duplica.
- `contact.merged.immutable` — tentar atualizar contato com `merged_into_id` preenchido é recusado pela Server Action.

## 11. Open Questions

- `OQ-CONTACT-01` — `contact_custom_field` precisa de um catálogo normalizado (`custom_field_def`) para tipar e listar chaves? Fase 1 vai com jsonb livre.
- `OQ-CONTACT-02` — dados pessoais (birth_date, CPF) precisam de criptografia em repouso na Fase 1 ou basta o criptografado do Supabase?
- `OQ-CONTACT-03` — precisamos de `contact.brand_owner_id` para o caso de contato "nasceu em" uma marca? Hoje contato é global; marca entra só via transação/conversa.
