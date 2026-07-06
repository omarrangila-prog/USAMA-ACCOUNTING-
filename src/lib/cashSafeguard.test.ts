import { describe, it, expect } from 'vitest';
import { previewCashEntry, statusOf } from './cashSafeguard';

/**
 * Cash-entry safeguard acceptance tests (spec scenarios 1–6). Balance sign:
 * +receivable / −payable. received: balance − amount, paid: balance + amount.
 */
describe('previewCashEntry — advance warnings + before/after', () => {
  it('1. Receivable 300k + Receive 100k → Receivable 200k, NO warning', () => {
    const p = previewCashEntry(300000, 'received', 100000);
    expect(p.after).toBe(200000);
    expect(statusOf(p.after)).toBe('Receivable');
    expect(p.createsAdvance).toBe(false);
  });

  it('2. Receivable 300k + Receive 400k → warning; after = Payable 100k', () => {
    const p = previewCashEntry(300000, 'received', 400000);
    expect(p.createsAdvance).toBe(true);
    expect(p.warning).toContain('more than the outstanding receivable');
    expect(p.after).toBe(-100000);
    expect(statusOf(p.after)).toBe('Payable');
  });

  it('3. Settled party + Receive 100k → warning; after = Payable 100k', () => {
    const p = previewCashEntry(0, 'received', 100000);
    expect(p.createsAdvance).toBe(true);
    expect(p.warning).toContain('no outstanding receivable');
    expect(p.after).toBe(-100000);
    expect(statusOf(p.after)).toBe('Payable');
  });

  it('4. Payable 300k + Pay 100k → Payable 200k, NO warning', () => {
    const p = previewCashEntry(-300000, 'paid', 100000);
    expect(p.after).toBe(-200000);
    expect(statusOf(p.after)).toBe('Payable');
    expect(p.createsAdvance).toBe(false);
  });

  it('5. Payable 300k + Pay 400k → warning; after = Receivable 100k', () => {
    const p = previewCashEntry(-300000, 'paid', 400000);
    expect(p.createsAdvance).toBe(true);
    expect(p.warning).toContain('more than the outstanding payable');
    expect(p.after).toBe(100000);
    expect(statusOf(p.after)).toBe('Receivable');
  });

  it('6. Settled party + Pay 100k → warning; after = Receivable 100k', () => {
    const p = previewCashEntry(0, 'paid', 100000);
    expect(p.createsAdvance).toBe(true);
    expect(p.warning).toContain('no outstanding payable');
    expect(p.after).toBe(100000);
    expect(statusOf(p.after)).toBe('Receivable');
  });

  it('exact-settle does NOT warn (Receivable 300k + Receive 300k = 0)', () => {
    const p = previewCashEntry(300000, 'received', 300000);
    expect(p.after).toBe(0);
    expect(statusOf(p.after)).toBe('Settled');
    expect(p.createsAdvance).toBe(false);
  });

  it('receiving while payable warns (no receivable to reduce)', () => {
    const p = previewCashEntry(-50000, 'received', 100000);
    expect(p.createsAdvance).toBe(true);
    expect(p.after).toBe(-150000); // deeper payable
  });

  it('before/after labels use plain rupee language', () => {
    const p = previewCashEntry(200000, 'received', 50000);
    expect(p.beforeLabel).toBe('Rs 200,000 Receivable');
    expect(p.afterLabel).toBe('Rs 150,000 Receivable');
  });
});
