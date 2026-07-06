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

const rs = (n: number) => `Rs ${Math.round(Math.abs(n)).toLocaleString('en-PK')}`;

/**
 * Compute the before/after balance and whether this cash entry needs a
 * "create advance" confirmation.
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
  const beforeStatus = statusOf(before);

  let warning = '';
  if (direction === 'received') {
    // Receiving reduces receivable; excess becomes payable/advance.
    if (beforeStatus === 'Receivable' && amount > before + 0.005) {
      const excess = amount - before;
      warning =
        `This receipt is more than the outstanding receivable.\n` +
        `Receivable: ${rs(before)}\n` +
        `Receipt: ${rs(amount)}\n` +
        `Extra ${rs(excess)} will become Customer Advance (Payable).\n` +
        `Do you want to continue?`;
    } else if (beforeStatus !== 'Receivable') {
      warning =
        `This party has no outstanding receivable.\n` +
        `Receiving ${rs(amount)} will create a Customer Advance (Payable).\n` +
        `Do you want to continue?`;
    }
  } else {
    // Paying reduces payable; excess becomes receivable/advance.
    if (beforeStatus === 'Payable' && amount > Math.abs(before) + 0.005) {
      const excess = amount - Math.abs(before);
      warning =
        `This payment is more than the outstanding payable.\n` +
        `Payable: ${rs(before)}\n` +
        `Payment: ${rs(amount)}\n` +
        `Extra ${rs(excess)} will become Advance Paid (Receivable).\n` +
        `Do you want to continue?`;
    } else if (beforeStatus !== 'Payable') {
      warning =
        `This party has no outstanding payable.\n` +
        `Paying ${rs(amount)} will create an Advance Paid (Receivable).\n` +
        `Do you want to continue?`;
    }
  }

  return {
    before,
    after,
    beforeLabel: balanceLabel(before),
    afterLabel: balanceLabel(after),
    createsAdvance: warning !== '',
    warning,
  };
}
