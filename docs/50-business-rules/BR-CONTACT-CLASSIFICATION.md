# BR-CONTACT-CLASSIFICATION: classificação comercial do contato

## Enunciado

O campo `contact.classification` **deve** refletir determinísticamente o estado comercial do contato derivado das transações aprovadas, segundo:

- `lead` — sem compra aprovada vigente.
- `paid_lead` — tem ao menos uma compra aprovada vigente exclusivamente de produtos `product_kind ∈ { ebook, bonus, other }`.
- `customer` — tem ao menos uma compra aprovada vigente (qualquer `product_kind`) **e** não se qualifica como `student`.
- `student` — tem ao menos uma compra aprovada vigente de produto com `product_kind ∈ { course, training_online, training_in_person }`.

"Vigente" = transação `status = 'approved'` e **não** estornada/chargeback para o produto considerado. Reembolso ou chargeback que remova a condição reverte automaticamente a classificação para o próximo nível aplicável na hierarquia `student > customer > paid_lead > lead`.

## Motivação

A classificação é usada por funis, segmentações, automações e relatórios. Sem uma regra determinística calculada a partir das transações, há divergência entre operação e análise. Esta regra elimina o "status manual" como fonte.

## Escopo

- Módulos afetados: `MOD-CONTACT` (persiste), `MOD-TRANSACTION` (gatilho), `MOD-REFUND` (gatilho reverso), `MOD-CATALOG` (fonte de `product_kind`).
- Entidades: `contact.classification`, `contact_status_history`, `transaction`, `transaction_snapshot`, `product`.

## Enforcement

- [x] Função de domínio pura (TS signature) — `classifyContact`
- [ ] DB constraint
- [ ] DB trigger
- [x] Guard em Server Action — chamada obrigatoriamente ao fim da transação de venda / reembolso
- [ ] Guard em UI

## Contrato TS

```ts
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

Considerando apenas transações com `status = 'approved'` e **sem** reembolso/chargeback ativo:

| Tem venda de course/training? | Tem venda de qualquer outro produto? | Resultado |
|---|---|---|
| sim | — | `student` |
| não | sim, incluindo `ebook`/`bonus`/`other` **e** qualquer outro (`mentoring`, etc.) | `customer` |
| não | sim, **exclusivamente** `ebook`/`bonus`/`other` | `paid_lead` |
| não | não | `lead` |

Reembolso/chargeback remove a transação do conjunto considerado para o produto estornado. Se após a remoção o contato deixa de atender a regra atual, a classificação é rebaixada automaticamente.

## Casos de teste (Given/When/Then)

1. **lead-to-customer-first-approved**
   Given: C1 é `lead`; compra aprovada de produto `mentoring` (`product_kind = 'mentoring'`).
   When: Server Action de venda chama `classifyContact`.
   Then: resultado `'customer'`; `contact.classification` atualizado; `TE-CONTACT-CLASSIFICATION-CHANGED { from: 'lead', to: 'customer', reason: 'first_approved_sale' }`.

2. **lead-to-paid_lead-com-ebook**
   Given: C1 é `lead`; compra aprovada apenas de ebook.
   When: classificação reprocessada.
   Then: `'paid_lead'`.

3. **paid_lead-to-student-em-compra-de-curso**
   Given: C1 é `paid_lead` com ebook; nova compra aprovada de produto `course`.
   When: reprocessa.
   Then: `'student'`; evento emitido com `reason: 'course_purchase'`.

4. **customer-to-student-em-training**
   Given: C1 é `customer` (mentoria paga, sem curso).
   When: compra aprovada de `training_in_person`.
   Then: `'student'`.

5. **student-refund-reverte-para-customer**
   Given: C1 é `student` com 1 curso aprovado + 1 mentoria aprovada.
   When: curso é reembolsado (`transaction.status = 'refunded'`).
   Then: `classifyContact` recalcula → `'customer'`; evento `CLASSIFICATION-CHANGED { from: 'student', to: 'customer', reason: 'course_refund' }`.

6. **customer-refund-sem-outras-vendas-volta-para-lead**
   Given: C1 é `customer` com 1 mentoria aprovada.
   When: mentoria reembolsada.
   Then: `'lead'`.

7. **paid_lead-refund-volta-para-lead**
   Given: C1 é `paid_lead` com 1 ebook.
   When: ebook reembolsado.
   Then: `'lead'`.

8. **noop-se-ja-correto**
   Given: C1 já `student` e nova compra também é de curso.
   When: reprocessa.
   Then: resultado igual ao `current` — nenhum UPDATE, nenhum evento emitido.

## Rastreabilidade

- Teste esperado: `tests/unit/contact/classify-contact.test.ts` (tabela completa).
- Integração: `tests/integration/transaction/sale-triggers-reclassification.test.ts`, `tests/integration/refund/refund-reverts-classification.test.ts`.
- Referenciada em:
  - `docs/20-domain/02-contact-identity.md`
  - `docs/50-business-rules/BR-REFUND.md`
  - `docs/30-contracts/03-timeline-event-catalog.md` (`TE-CONTACT-CLASSIFICATION-CHANGED`)
  - `docs/30-contracts/01-enums.md` (`contact_classification`, `product_kind`)

## Open Questions

- `OQ-CLASSIFY-01` — ordem bônus (`product_kind = 'bonus'`) entregues sem compra (ex.: pós-evento) devem contar como `paid_lead`? Proposta: não, pois `paid_lead` pressupõe `transaction.status = 'approved'` real.
- `OQ-CLASSIFY-02` — `product_kind = 'other'` precisa ter política explícita por marca (pode virar curso em algumas marcas)?
- `OQ-CLASSIFY-03` — chargeback em transação parcial de assinatura (apenas parcela) deve rebaixar classificação? Proposta: só se a transação original for marcada `chargeback`.
