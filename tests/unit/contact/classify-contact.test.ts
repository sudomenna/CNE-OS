import { describe, it, expect } from 'vitest';
import {
  classifyContact,
  type ContactClassification,
  type TransactionForClassification,
} from '../../../lib/domain/contact/classify';

// Helpers para montar transações sem repetição
function approved(
  id: string,
  ...kinds: TransactionForClassification['productKinds']
): TransactionForClassification {
  return { transactionId: id, status: 'approved', productKinds: kinds };
}

function refunded(
  id: string,
  ...kinds: TransactionForClassification['productKinds']
): TransactionForClassification {
  return { transactionId: id, status: 'refunded', productKinds: kinds };
}

describe('BR-CONTACT-CLASSIFICATION', () => {
  it('given lead when mentoring approved then returns customer', () => {
    // lead-to-customer-first-approved
    const current: ContactClassification = 'lead';
    const txs: TransactionForClassification[] = [approved('tx-1', 'mentoring')];
    expect(classifyContact(current, txs)).toBe('customer');
  });

  it('given lead when ebook approved then returns paid_lead', () => {
    // lead-to-paid_lead-com-ebook
    const current: ContactClassification = 'lead';
    const txs: TransactionForClassification[] = [approved('tx-1', 'ebook')];
    expect(classifyContact(current, txs)).toBe('paid_lead');
  });

  it('given paid_lead with ebook when course approved then returns student', () => {
    // paid_lead-to-student-em-compra-de-curso
    const current: ContactClassification = 'paid_lead';
    const txs: TransactionForClassification[] = [
      approved('tx-1', 'ebook'),
      approved('tx-2', 'course'),
    ];
    expect(classifyContact(current, txs)).toBe('student');
  });

  it('given customer with mentoring when training_in_person approved then returns student', () => {
    // customer-to-student-em-training
    const current: ContactClassification = 'customer';
    const txs: TransactionForClassification[] = [
      approved('tx-1', 'mentoring'),
      approved('tx-2', 'training_in_person'),
    ];
    expect(classifyContact(current, txs)).toBe('student');
  });

  it('given student with refunded course and approved mentoring then returns customer', () => {
    // student-refund-reverte-para-customer
    const current: ContactClassification = 'student';
    const txs: TransactionForClassification[] = [
      refunded('tx-1', 'course'),
      approved('tx-2', 'mentoring'),
    ];
    expect(classifyContact(current, txs)).toBe('customer');
  });

  it('given customer with only refunded mentoring then returns lead', () => {
    // customer-refund-sem-outras-vendas-volta-para-lead
    const current: ContactClassification = 'customer';
    const txs: TransactionForClassification[] = [refunded('tx-1', 'mentoring')];
    expect(classifyContact(current, txs)).toBe('lead');
  });

  it('given paid_lead with only refunded ebook then returns lead', () => {
    // paid_lead-refund-volta-para-lead
    const current: ContactClassification = 'paid_lead';
    const txs: TransactionForClassification[] = [refunded('tx-1', 'ebook')];
    expect(classifyContact(current, txs)).toBe('lead');
  });

  it('given student with approved course then returns student unchanged', () => {
    // noop-se-ja-correto
    const current: ContactClassification = 'student';
    const txs: TransactionForClassification[] = [approved('tx-1', 'course')];
    expect(classifyContact(current, txs)).toBe('student');
  });

  it('given lead when only bonus approved then returns paid_lead', () => {
    // bonus-alone-is-paid_lead
    const current: ContactClassification = 'lead';
    const txs: TransactionForClassification[] = [approved('tx-1', 'bonus')];
    expect(classifyContact(current, txs)).toBe('paid_lead');
  });

  it('given lead when only other approved then returns paid_lead', () => {
    // other-alone-is-paid_lead
    const current: ContactClassification = 'lead';
    const txs: TransactionForClassification[] = [approved('tx-1', 'other')];
    expect(classifyContact(current, txs)).toBe('paid_lead');
  });

  it('given lead when ebook and mentoring approved then returns customer', () => {
    // mixed-ebook-mentoring-is-customer: não é exclusivamente paid_lead kinds
    const current: ContactClassification = 'lead';
    const txs: TransactionForClassification[] = [
      approved('tx-1', 'ebook'),
      approved('tx-2', 'mentoring'),
    ];
    expect(classifyContact(current, txs)).toBe('customer');
  });

  // Casos adicionais para cobrir todos os ramos de status ignorados
  it('given contact when all transactions are refused then returns lead', () => {
    const current: ContactClassification = 'customer';
    const txs: TransactionForClassification[] = [
      { transactionId: 'tx-1', status: 'refused', productKinds: ['course'] },
    ];
    expect(classifyContact(current, txs)).toBe('lead');
  });

  it('given contact when all transactions are pending then returns lead', () => {
    const current: ContactClassification = 'customer';
    const txs: TransactionForClassification[] = [
      { transactionId: 'tx-1', status: 'pending', productKinds: ['mentoring'] },
    ];
    expect(classifyContact(current, txs)).toBe('lead');
  });

  it('given contact when all transactions are cancelled then returns lead', () => {
    const current: ContactClassification = 'customer';
    const txs: TransactionForClassification[] = [
      { transactionId: 'tx-1', status: 'cancelled', productKinds: ['ebook'] },
    ];
    expect(classifyContact(current, txs)).toBe('lead');
  });

  it('given contact when all transactions are chargeback then returns lead', () => {
    const current: ContactClassification = 'customer';
    const txs: TransactionForClassification[] = [
      { transactionId: 'tx-1', status: 'chargeback', productKinds: ['course'] },
    ];
    expect(classifyContact(current, txs)).toBe('lead');
  });

  it('given contact with no transactions then returns lead', () => {
    const current: ContactClassification = 'customer';
    expect(classifyContact(current, [])).toBe('lead');
  });

  it('given lead when training_online approved then returns student', () => {
    const current: ContactClassification = 'lead';
    const txs: TransactionForClassification[] = [approved('tx-1', 'training_online')];
    expect(classifyContact(current, txs)).toBe('student');
  });

  it('given lead when ebook and bonus and other approved then returns paid_lead', () => {
    // exclusivamente paid_lead kinds combinados
    const current: ContactClassification = 'lead';
    const txs: TransactionForClassification[] = [
      approved('tx-1', 'ebook', 'bonus'),
      approved('tx-2', 'other'),
    ];
    expect(classifyContact(current, txs)).toBe('paid_lead');
  });
});
