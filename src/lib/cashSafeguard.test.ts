import { describe, it, expect } from 'vitest';
import { previewCashEntry, statusOf } from './cashSafeguard';

/**
 * Cash-entry preview: pure before/after display, NO advance warnings.
 * Client rule — a receipt is just cash in, a payment is just cash out; we never
 * flip a party to the opposite side or block with a confirmation.
 * Balance sign: +receivable / −payable. received: balance − amount, paid: + amount.
 */
describe('previewCashEntry — before/after only, no advance warnings', () => {
  it('never creates an advance / never warns (received)', () => {
    for (const [before, amt] of [[300000, 400000], [0, 100000], [-50000, 100000]] as const) {
      const p = previewCashEntry(before, 'received', amt);
      expect(p.createsAdvance).toBe(false);
      expect(p.warning).toBe('');
    }
  });

  it('never creates an advance / never warns (paid)', () => {
    for (const [before, amt] of [[-300000, 400000], [0, 100000], [50000, 100000]] as const) {
      const p = previewCashEntry(before, 'paid', amt);
      expect(p.createsAdvance).toBe(false);
      expect(p.warning).toBe('');
    }
  });

  it('before/after math still correct: received subtracts', () => {
    const p = previewCashEntry(300000, 'received', 100000);
    expect(p.after).toBe(200000);
    expect(statusOf(p.after)).toBe('Receivable');
  });

  it('before/after math still correct: paid adds', () => {
    const p = previewCashEntry(-300000, 'paid', 100000);
    expect(p.after).toBe(-200000);
    expect(statusOf(p.after)).toBe('Payable');
  });

  it('before/after labels use plain rupee language', () => {
    const p = previewCashEntry(200000, 'received', 50000);
    expect(p.beforeLabel).toBe('Rs 200,000 Receivable');
    expect(p.afterLabel).toBe('Rs 150,000 Receivable');
  });
});
