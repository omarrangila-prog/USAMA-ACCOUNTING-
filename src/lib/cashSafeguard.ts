import type { CashDirection } from '@/types';

/**
 * Cash-entry safeguards for the Pakistani-market UX.
 *
 * The accounting engine is unchanged. This is a UI-only helper that, given a
 * party's CURRENT net balance (+receivable / -payable) and a cash amount,
 * computes the RESULTING balance and — when a cash entry would flip a party from
 * receivable→payable or payable→receivable (i.e. create an advance) — produces a
 * plain-language confirmation so the user is never surprised.
 *
 * Sign convention (matches computePartyBalances):
 *   balance > 0  => Receivable (they owe us)
 *   balance < 0  => Payable    (we owe them)
 *   Cash received: balance -= amount.  Cash paid: balance += amount.
 */

export type BalanceStatus = 'Receivable' | 'Payable' | 'Settled';

export function statusOf(balance: number): BalanceStatus {
  if (balance > 0.005) return 'Receivable';
  if (balance < -0.005) return 'Payable';
  return 'Settled';
}

/** Human label like "Rs 200,000 Receivable" / "Rs 0 Settled". */
export function balanceLabel(balance: number): string {
  const s = statusOf(balance);
  const abs = Math.round(Math.abs(balance)).toLocaleString('en-PK');
  return s === 'Settled' ? 'Rs 0 Settled' : `Rs ${abs} ${s}`;
}

export interface CashPreview {
  before: number;          // current net balance
  after: number;           // net balance after this entry
  beforeLabel: string;
  afterLabel: string;
  /** True when the entry flips receivable↔payable (creates an advance). */
  createsAdvance: boolean;
  /** Confirmation message to show BEFORE saving (empty when no advance). */
  warning: string;
}

/**
 * Compute the before/after balance for display. No advance/confirmation logic —
 * cash receipts and payments just move Cash in Hand.
 *
 * @param before   current party net balance (+receivable / -payable)
 * @param direction 'received' | 'paid'
 * @param amount   positive cash amount
 */
export function previewCashEntry(
  before: number,
  direction: CashDirection,
  amount: number
): CashPreview {
  const after = direction === 'received' ? before - amount : before + amount;

  // Cash Received / Paid simply moves Cash in Hand. We DO NOT treat an unmatched
  // receipt/payment as a "customer advance" that flips the party to the opposite
  // side, and we never block the entry with a confirmation. (Client preference:
  // a receipt is just cash in, a payment is just cash out.)
  return {
    before,
    after,
    beforeLabel: balanceLabel(before),
    afterLabel: balanceLabel(after),
    createsAdvance: false,
    warning: '',
  };
}
