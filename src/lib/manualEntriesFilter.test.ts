import { describe, it, expect } from 'vitest';
import type { PartyAdjustment } from '@/types';

/**
 * The Balances "Manual Entries" log filter (src/pages/Balances.tsx). Reproduces
 * the bug where a receive-settlement (negative) leaked onto the Payable page.
 *
 * Rule: show a row only if it is a GENUINE manual entry (not a settlement) whose
 * sign matches the page side (receivable = +, payable = −).
 */
const now = Date.now();
const meta = { month: 7, year: 2026, createdAt: now, updatedAt: now };
const mk = (id: string, amount: number, settlement = false): PartyAdjustment =>
  ({ id, partyId: 'A', amount, reason: 'x', settlement, date: '2026-07-05', ...meta });

// Mirror of the component predicate.
const showsOn = (a: PartyAdjustment, isRec: boolean) =>
  !a.settlement && (isRec ? a.amount > 0 : a.amount < 0);

describe('Manual Entries log — receivable vs payable page', () => {
  const manualReceivable = mk('r', 300000);           // + genuine receivable
  const manualPayable = mk('p', -100000);             // − genuine payable
  const receiveSettlement = mk('rs', -300000, true);  // − auto settle of a receivable
  const paySettlement = mk('ps', 100000, true);       // + auto settle of a payable

  it('Receivable page shows only genuine receivables', () => {
    expect(showsOn(manualReceivable, true)).toBe(true);
    expect(showsOn(manualPayable, true)).toBe(false);
    expect(showsOn(receiveSettlement, true)).toBe(false); // settlement excluded
    expect(showsOn(paySettlement, true)).toBe(false);     // settlement excluded
  });

  it('Payable page shows only genuine payables — NOT the receive settlement', () => {
    expect(showsOn(manualPayable, false)).toBe(true);
    expect(showsOn(manualReceivable, false)).toBe(false);
    // THE BUG: this negative receive-settlement used to appear here.
    expect(showsOn(receiveSettlement, false)).toBe(false);
    expect(showsOn(paySettlement, false)).toBe(false);
  });
});
