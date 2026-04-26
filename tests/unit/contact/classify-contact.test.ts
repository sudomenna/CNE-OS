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

describe('BR-CONTACT-CLASSIFICATION (hierarquia mentorado > student > customer > lead)', () => {
  it('given lead when mentoring approved then returns mentorado', () => {
    const current: ContactClassification = 'lead';
    const txs: TransactionForClassification[] = [approved('tx-1', 'mentoring')];
    expect(classifyContact(current, txs)).toBe('mentorado');
  });

  it('given lead when ebook approved then returns customer', () => {
    // paid_lead removido — qualquer compra aprovada vira customer salvo regras superiores
    const current: ContactClassification = 'lead';
    const txs: TransactionForClassification[] = [approved('tx-1', 'ebook')];
    expect(classifyContact(current, txs)).toBe('customer');
  });

  it('given customer with ebook when course approved then returns student', () => {
    const current: ContactClassification = 'customer';
    const txs: TransactionForClassification[] = [
      approved('tx-1', 'ebook'),
      approved('tx-2', 'course'),
    ];
    expect(classifyContact(current, txs)).toBe('student');
  });

  it('given customer with course when mentoring approved then returns mentorado (mentorado > student)', () => {
    // hierarquia: mentorado prevalece mesmo com curso
    const current: ContactClassification = 'customer';
    const txs: TransactionForClassification[] = [
      approved('tx-1', 'course'),
      approved('tx-2', 'mentoring'),
    ];
    expect(classifyContact(current, txs)).toBe('mentorado');
  });

  it('given mentorado with refunded mentoring and approved course then returns student', () => {
    // mentoria reembolsada → cai para student (curso ainda ativo)
    const current: ContactClassification = 'mentorado';
    const txs: TransactionForClassification[] = [
      refunded('tx-1', 'mentoring'),
      approved('tx-2', 'course'),
    ];
    expect(classifyContact(current, txs)).toBe('student');
  });

  it('given student with refunded course and approved ebook then returns customer', () => {
    const current: ContactClassification = 'student';
    const txs: TransactionForClassification[] = [
      refunded('tx-1', 'course'),
      approved('tx-2', 'ebook'),
    ];
    expect(classifyContact(current, txs)).toBe('customer');
  });

  it('given customer with only refunded ebook then returns lead', () => {
    const current: ContactClassification = 'customer';
    const txs: TransactionForClassification[] = [refunded('tx-1', 'ebook')];
    expect(classifyContact(current, txs)).toBe('lead');
  });

  it('given mentorado with only refunded mentoring then returns lead', () => {
    const current: ContactClassification = 'mentorado';
    const txs: TransactionForClassification[] = [refunded('tx-1', 'mentoring')];
    expect(classifyContact(current, txs)).toBe('lead');
  });

  it('given student with multiple approved courses then returns student unchanged', () => {
    // noop-se-ja-correto
    const current: ContactClassification = 'student';
    const txs: TransactionForClassification[] = [
      approved('tx-1', 'course'),
      approved('tx-2', 'course'),
    ];
    expect(classifyContact(current, txs)).toBe('student');
  });

  it('given lead when only bonus approved then returns customer', () => {
    const current: ContactClassification = 'lead';
    const txs: TransactionForClassification[] = [approved('tx-1', 'bonus')];
    expect(classifyContact(current, txs)).toBe('customer');
  });

  it('given lead when only other approved then returns customer', () => {
    const current: ContactClassification = 'lead';
    const txs: TransactionForClassification[] = [approved('tx-1', 'other')];
    expect(classifyContact(current, txs)).toBe('customer');
  });

  it('given lead when ebook and mentoring approved then returns mentorado', () => {
    const current: ContactClassification = 'lead';
    const txs: TransactionForClassification[] = [
      approved('tx-1', 'ebook'),
      approved('tx-2', 'mentoring'),
    ];
    expect(classifyContact(current, txs)).toBe('mentorado');
  });

  // Status ignorados — sempre lead
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

  it('given lead when training_in_person approved then returns student', () => {
    const current: ContactClassification = 'lead';
    const txs: TransactionForClassification[] = [approved('tx-1', 'training_in_person')];
    expect(classifyContact(current, txs)).toBe('student');
  });

  it('given lead when ebook and bonus and other approved then returns customer', () => {
    // sem paid_lead — vira customer
    const current: ContactClassification = 'lead';
    const txs: TransactionForClassification[] = [
      approved('tx-1', 'ebook', 'bonus'),
      approved('tx-2', 'other'),
    ];
    expect(classifyContact(current, txs)).toBe('customer');
  });
});
