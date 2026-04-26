# BR-CONTACT-CLASSIFICATION: classificação comercial do contato

## Enunciado

O campo `contact.classification` **deve** refletir determinísticamente o estado comercial do contato derivado das transações aprovadas, segundo a hierarquia (alta → baixa):

```
mentorado > student > customer > lead
```

- `lead` — sem compra aprovada vigente.
- `customer` — tem ao menos uma compra aprovada vigente e **não** se qualifica como `student` ou `mentorado`.
- `student` — tem ao menos uma compra aprovada vigente de produto com `product_kind ∈ { course, training_online, training_in_person }`.
- `mentorado` — tem ao menos uma compra aprovada vigente de produto com `product_kind = 'mentoring'` (vence as demais classes).

"Vigente" = transação `status = 'approved'` e **não** estornada/chargeback para o produto considerado. Reembolso ou chargeback que remova a condição reverte automaticamente a classificação para o próximo nível aplicável na hierarquia.

> Histórico: o valor `paid_lead` (compra exclusiva de `ebook`/`bonus`/`other`) foi removido em 2026-04-26 (migration `20260427000002`) e colapsado em `customer`. Refinamento por tipo de produto (futuro) ficará em uma BR dedicada quando for criada.

## Motivação

A classificação é usada por funis, segmentações, automações e relatórios. Sem uma regra determinística calculada a partir das transações, há divergência entre operação e análise. Esta regra elimina o "status manual" como fonte. A classe `mentorado` foi adicionada para distinguir comercialmente alunos de mentorados (operação de alto contato vs entrega de conteúdo).

## Escopo

- Módulos afetados: `MOD-CONTACT` (persiste), `MOD-TRANSACTION` (gatilho), `MOD-REFUND` (gatilho reverso), `MOD-CATALOG` (fonte de `product_kind`).
- Entidades: `contact.classification`, `contact_status_history`, `transaction`, `transaction_snapshot`, `product`.

## Enforcement

- [x] Função de domínio pura (TS signature) — `classifyContact` em `lib/domain/contact/classify.ts`
- [ ] DB constraint
- [ ] DB trigger
- [x] Guard em Server Action — chamada obrigatoriamente ao fim da transação de venda / reembolso (`approveTransaction` passo 11; `approveRefund` passo 6)
- [ ] Guard em UI

## Contrato TS

```ts
export type ContactClassification = 'lead' | 'customer' | 'student' | 'mentorado';

export type ClassificationInputTransaction = {
  transactionId: string;
  status: 'approved' | 'refused' | 'refunded' | 'chargeback' | 'cancelled' | 'pending';
  productKinds: ProductKind[];   // product_kind de cada item principal do snapshot
};

export function classifyContact(
  current: ContactClassification,
  transactions: ClassificationInputTransaction[],
): ContactClassification;
```

Determinística, pura, sem I/O. A Server Action de venda/reembolso lê as transações do contato, chama `classifyContact`, compara com `contact.classification` e, se divergente, aplica `UPDATE` + grava `contact_status_history` + emite `TE-CONTACT-CLASSIFICATION-CHANGED`.

## DDL

Depende apenas das colunas de `contact` e `product` declaradas em seus módulos. Nenhuma constraint adicional.

## Tabela de decisão

Considerando apenas transações com `status = 'approved'` e **sem** reembolso/chargeback ativo para o produto:

| Tem venda de mentoring? | Tem venda de course/training? | Tem qualquer outra venda? | Resultado |
|---|---|---|---|
| sim | — | — | `mentorado` |
| não | sim | — | `student` |
| não | não | sim | `customer` |
| não | não | não | `lead` |

Reembolso/chargeback remove a transação do conjunto considerado para o produto estornado. Se após a remoção o contato deixa de atender a regra atual, a classificação é rebaixada automaticamente.

## Casos de teste (Given/When/Then)

1. **lead-to-mentorado-em-mentoring**
   Given: C1 é `lead`; compra aprovada de produto `mentoring`.
   When: Server Action de venda chama `classifyContact`.
   Then: `'mentorado'`; `TE-CONTACT-CLASSIFICATION-CHANGED { from: 'lead', to: 'mentorado', reason: 'first_approved_sale' }`.

2. **lead-to-customer-em-ebook**
   Given: C1 é `lead`; compra aprovada de `ebook`.
   When: reprocessa.
   Then: `'customer'` (não há mais `paid_lead` na hierarquia).

3. **customer-to-student-em-curso**
   Given: C1 é `customer` (apenas ebook); nova compra aprovada de `course`.
   When: reprocessa.
   Then: `'student'`; evento emitido com `reason: 'course_purchase'`.

4. **student-to-mentorado-em-mentoring** (mentorado vence student)
   Given: C1 é `student` com 1 curso aprovado; nova compra aprovada de `mentoring`.
   When: reprocessa.
   Then: `'mentorado'`.

5. **mentorado-refund-mentoring-com-curso-ativo-volta-para-student**
   Given: C1 é `mentorado` com 1 mentoria + 1 curso aprovados.
   When: mentoria reembolsada (`refunded`).
   Then: `'student'`; evento `{ from: 'mentorado', to: 'student', reason: 'mentoring_refund' }`.

6. **student-refund-curso-com-ebook-ativo-volta-para-customer**
   Given: C1 é `student` com 1 curso + 1 ebook aprovados.
   When: curso reembolsado.
   Then: `'customer'`.

7. **customer-refund-unica-venda-volta-para-lead**
   Given: C1 é `customer` com 1 ebook aprovado.
   When: ebook reembolsado.
   Then: `'lead'`.

8. **mentorado-refund-unica-mentoria-volta-para-lead**
   Given: C1 é `mentorado` com 1 mentoria aprovada.
   When: mentoria reembolsada.
   Then: `'lead'`.

9. **noop-se-ja-correto**
   Given: C1 já `student` e nova compra também é de curso.
   When: reprocessa.
   Then: resultado igual ao `current` — nenhum UPDATE, nenhum evento emitido.

## Rastreabilidade

- Teste esperado: `tests/unit/contact/classify-contact.test.ts` (tabela completa).
- Integração: `tests/integration/contact/classify.test.ts`, `tests/integration/transaction/sale-triggers-reclassification.test.ts`, `tests/integration/refund/refund-reverts-classification.test.ts`.
- Referenciada em:
  - `docs/20-domain/02-contact-identity.md`
  - `docs/50-business-rules/BR-REFUND.md`
  - `docs/30-contracts/03-timeline-event-catalog.md` (`TE-CONTACT-CLASSIFICATION-CHANGED`)
  - `docs/30-contracts/01-enums.md` (`contact_classification`, `product_kind`)

## Open Questions

- `OQ-CLASSIFY-02` — `product_kind = 'other'` precisa ter política explícita por marca (pode virar curso em algumas marcas)?
- `OQ-CLASSIFY-03` — chargeback em transação parcial de assinatura (apenas parcela) deve rebaixar classificação? Proposta: só se a transação original for marcada `chargeback`.
- `OQ-CLASSIFY-04` (futura) — refinamento de classes por tipo de produto: criar subclassificações (ex: `customer:ebook`, `customer:bonus`) para sucessão da extinta `paid_lead`. Decisão postergada até nova necessidade comercial.
