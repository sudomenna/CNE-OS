# BR-IDENTITY: resolução de identidade de contato

## Enunciado

Dado um input externo contendo opcionalmente CPF, telefone e e-mail, o sistema **deve** resolver se o input se refere a um contato existente (e qual), se deve criar um novo contato, ou se deve abrir **pendência** para decisão manual, aplicando a regra hierárquica: **CPF é chave absoluta; na ausência de CPF, telefone prevalece sobre e-mail.**

Esta regra substitui integralmente a §9.2.2 do PRD arquivado, que estava ambígua.

## Motivação

Ingestão multi-fonte (checkout, mensagens, importação, integrações) gera o mesmo contato com dados parciais ou divergentes. Sem uma regra determinística, o sistema acumula duplicatas ou sobrescreve dados confiáveis. Esta regra estabiliza a chave de identidade e preserva auditabilidade via pendências.

## Escopo

- Módulos afetados: `MOD-CONTACT` (consome), `MOD-MERGE` (abre pendência quando a regra delega), `MOD-TRANSACTION` e `MOD-INBOX` (consumidores indiretos via ingest).
- Entidades: `contact`, `contact_phone`, `contact_email`, `contact_issue`.

## Enforcement

- [x] Função de domínio pura (TS signature) — autoridade
- [x] DB constraint (SQL) — suporta (unique parciais em CPF/telefone/e-mail)
- [ ] DB trigger
- [x] Guard em Server Action — toda ingestão passa pelo resolver
- [ ] Guard em UI

## Contrato TS

```ts
export type IdentityInput = {
  fullName?: string;
  cpf?: string | null;           // normalizado: 11 dígitos, sem máscara
  phoneE164?: string | null;     // E.164, ex.: '+5511988887777'
  email?: string | null;         // lower, trim
  origin: 'checkout' | 'message' | 'import' | 'manual' | 'integration';
  sourceRef?: string;            // id externo do evento/payload
};

export type IdentityResolution =
  | { action: 'create';   contactId: string; issues: ContactIssueDraft[] }
  | { action: 'update';   contactId: string; applied: AppliedChange[]; issues: ContactIssueDraft[] }
  | { action: 'noop';     contactId: string; issues: ContactIssueDraft[] };

export type ContactIssueDraft = {
  kind: 'email_duplicate' | 'phone_conflict' | 'document_mismatch' | 'source_divergence' | 'other';
  detail: string;
  payload: Record<string, unknown>;
  relatedContactId?: string;
};

export type AppliedChange =
  | { field: 'add_alternative_email'; value: string }
  | { field: 'promote_new_primary_phone'; newPhoneId: string; archivedPhoneId: string }
  | { field: 'set_cpf'; value: string }
  | { field: 'update_full_name'; from: string; to: string };

export function resolveContactIdentity(input: IdentityInput): Promise<IdentityResolution>;
```

Implementação em `lib/domain/contact/resolve-identity.ts`. A Server Action chama o resolver em transação com isolamento `SERIALIZABLE` para evitar corrida entre dois webhooks criando duplicatas.

## DDL / constraint SQL

As unicidades parciais dão suporte à regra e são declaradas em MOD-CONTACT:

```sql
-- CPF único por contato vivo e não-mergeado
CREATE UNIQUE INDEX uq_contact_cpf ON contact (cpf)
  WHERE cpf IS NOT NULL AND deleted_at IS NULL AND merged_into_id IS NULL;

-- Telefone E.164 único entre ativos
CREATE UNIQUE INDEX uq_contact_phone_e164 ON contact_phone (e164)
  WHERE status <> 'invalid';

-- E-mail único entre ativos
CREATE UNIQUE INDEX uq_contact_email ON contact_email (email)
  WHERE status NOT IN ('invalid','unsubscribed');
```

## Tabela de decisão

Matching semantics: "match" = existe **algum** contato vivo ligado àquele dado; "diferente" = o dado bate com um contato distinto do que o telefone/e-mail também bate.

| # | CPF input | Telefone input | E-mail input | Ação | Abre pendência? | Justificativa |
|---|---|---|---|---|---|---|
| 1 | novo (sem match) | qualquer | qualquer | `create` | não | CPF novo = contato novo; CPF é chave absoluta |
| 2 | match em C1 | match em C1 | match em C1 | `noop` | não | tudo bate — só atualiza dados não conflitantes |
| 3 | match em C1 | match em C1 | diferente de C1 | `update` C1 (adiciona e-mail como `alternative`) | **sim** — `email_duplicate` se o e-mail pertence a outro C2; `source_divergence` caso contrário | CPF + telefone confirmam; e-mail vira alternativo, conflito marcado |
| 4 | match em C1 | diferente de C1 | match em C1 | `update` C1 (arquiva telefone antigo ou promove novo a `primary`) | **sim** — `phone_conflict` | CPF + e-mail confirmam; novo telefone registrado, disputa de `primary` sinalizada |
| 5 | match em C1 | diferente de C1 | diferente de C1 | `update` C1 (adiciona telefone e e-mail) | **sim** — `document_mismatch` | CPF é rei, mas tel/e-mail destoam — revisão de fraude/homônimo |
| 6 | ausente | match em C1 | match em C1 | `noop` | não | telefone + e-mail casam, nada a fazer |
| 7 | ausente | match em C1 | diferente de C1 ou ausente | `update` C1 (adiciona e-mail como `alternative`) | não, exceto se o e-mail bate com C2 (`email_duplicate`) | telefone prevalece sobre e-mail |
| 8 | ausente | diferente de C1 | match em C1 | `create` **novo contato** com o novo telefone + o e-mail; NÃO adiciona o telefone novo ao C1 | **sim** — `email_duplicate` apontando para C1 | sem CPF, e-mail sozinho não identifica; pendência decide merge manual |
| 9 | ausente | diferente (sem match) | diferente (sem match) ou ausente | `create` | não | nada bate — contato novo |

Casos adicionais:

- **CPF ausente, telefone ausente, apenas e-mail match em C1:** `update` C1 (registra `origin`/`sourceRef`), pendência `source_divergence` se C1 está `invalid`/`blocked`.
- **CPF ausente, telefone batendo em C1 e em C2 ao mesmo tempo:** impossível pelo índice único; se acontecer por bug, resolver lança exceção e o webhook vai para DLQ.
- **CPF match em C1, nome muito diferente:** caso #5 (`document_mismatch`). Fase 1 aceita o update e abre pendência; não bloqueia.

Quando a regra determina adicionar e-mail/telefone alternativo, o item é inserido com `status = 'alternative'`/`'secondary'` e nunca é promovido a `primary` automaticamente, exceto no caso #4 em que a fonte é `checkout` (prioridade de confiança máxima).

## Casos de teste (Given/When/Then)

1. **create-por-cpf-novo**
   Given: nenhum contato existe com CPF `11111111111`.
   When: `resolveContactIdentity({ cpf: '11111111111', phoneE164: '+5511900000001', email: 'a@x.com', origin: 'checkout' })`.
   Then: retorna `{ action: 'create', contactId: <novo>, issues: [] }`; `contact` persistido com `cpf`, um `contact_phone` `primary`, um `contact_email` `primary`.

2. **noop-tudo-bate** (caso #2)
   Given: C1 com cpf `22222222222`, telefone `+5511900000002`, e-mail `b@x.com`.
   When: `resolveContactIdentity({ cpf: '22222222222', phoneE164: '+5511900000002', email: 'b@x.com', origin: 'checkout' })`.
   Then: `{ action: 'noop', contactId: C1.id, issues: [] }`.

3. **update-email-alternativo-sem-colisao** (caso #3)
   Given: C1 bate por CPF + telefone; `novo@x.com` não pertence a ninguém.
   When: input com `novo@x.com`.
   Then: `{ action: 'update', applied: [{ field: 'add_alternative_email', value: 'novo@x.com' }], issues: [{ kind: 'source_divergence' }] }`; `contact_email.novo@x.com.status = 'alternative'`.

4. **update-email-duplicado-colisao** (caso #3 com colisão)
   Given: C1 bate por CPF+telefone; `novo@x.com` já é de C2.
   When: resolver processa.
   Then: `issues[0].kind === 'email_duplicate'` com `relatedContactId === C2.id`; `TE-CONTACT-ISSUE-OPENED` emitido.

5. **update-telefone-conflict** (caso #4)
   Given: C1 bate por CPF+e-mail; telefone diferente do cadastrado e livre no sistema.
   When: input com `origin: 'checkout'`.
   Then: novo telefone inserido como `primary`, o antigo rebaixado para `secondary`; pendência `phone_conflict` aberta.

6. **novo-contato-sem-cpf-email-duplicado** (caso #8 — cenário crítico)
   Given: C1 tem `email: 'c@x.com'` e telefone `+5511900000003`; input traz telefone `+5511900000099` + e-mail `c@x.com`, sem CPF.
   When: resolver processa.
   Then: `{ action: 'create', contactId: C2.id, issues: [{ kind: 'email_duplicate', relatedContactId: C1.id }] }`. C2 é novo com o novo telefone e o e-mail. Não há merge automático.

7. **novo-sem-nada-bate** (caso #9)
   Given: telefone `+5511900000050` e e-mail `z@x.com` não existem.
   When: resolver sem CPF.
   Then: `{ action: 'create', contactId: <novo>, issues: [] }`.

8. **rejeita-cpf-invalido**
   Given: input com `cpf: '123'`.
   When: resolver chamado.
   Then: lança `InvalidCpfError` antes de qualquer query (falha fast).

## Rastreabilidade

- Teste esperado: `tests/unit/contact/resolve-identity.*.test.ts` (8 casos acima).
- Integração: `tests/integration/contact/resolve-identity.race.test.ts` — duas chamadas concorrentes com mesmo CPF não criam duas linhas.
- Referenciada em:
  - `docs/20-domain/02-contact-identity.md`
  - `docs/20-domain/03-contact-merge-issues.md`
  - `docs/60-flows/FLOW-INGEST-CHECKOUT.md`
  - `docs/60-flows/FLOW-IDENTITY-RESOLUTION.md`
  - ADR-06 (CPF como chave absoluta)

## Open Questions

- `OQ-IDENTITY-01` — ingestão `origin: 'import'` em batch deve ter política mais tolerante (deduplicar em lote) ou idêntica à de checkout?
- `OQ-IDENTITY-02` — nome "muito diferente" (caso #5) precisa de threshold fuzzy (Levenshtein) para decidir `document_mismatch` vs `source_divergence`?
- `OQ-IDENTITY-03` — input sem CPF, sem telefone e sem e-mail (só nome) deve ser aceito? Proposta: rejeitar com `InsufficientIdentityError`.
