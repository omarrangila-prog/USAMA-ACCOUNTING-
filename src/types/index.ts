/**
 * Bond Ledger OS — Domain types
 *
 * Every business record carries date/month/year + createdAt/updatedAt so the
 * app can filter by accounting period and previous months stay intact.
 */

export type ISODate = string; // "2026-07-01"
export type PaymentMode = 'cash' | 'credit';
export type CashDirection = 'received' | 'paid';

/** Base fields stamped onto every persisted record. */
export interface BaseRecord {
  id: string;
  date: ISODate;
  /** 1-12 */
  month: number;
  /** e.g. 2026 */
  year: number;
  createdAt: number;
  updatedAt: number;
  /** Set when the owning month has been closed/locked. */
  locked?: boolean;
  note?: string;
}

export interface Party {
  id: string;
  name: string;
  phone?: string;
  /** Opening balance: +ve => they owe us (receivable), -ve => we owe them (payable). */
  openingBalance: number;
  createdAt: number;
  updatedAt: number;
}

export interface BondType {
  id: string;
  /** Denomination label e.g. "100", "750", "1500", "40000". */
  name: string;
  /** Face value of a single bond, used for reference only. */
  faceValue: number;
  createdAt: number;
  updatedAt: number;
}

export interface Purchase extends BaseRecord {
  partyId: string;
  bondTypeId: string;
  quantity: number;
  rate: number;
  amount: number;
  payment: PaymentMode;
}

export interface Sale extends BaseRecord {
  partyId: string;
  bondTypeId: string;
  quantity: number;
  rate: number;
  amount: number;
  receipt: PaymentMode;
  /** Weighted-average cost of goods sold at time of sale (for P/L). */
  costOfGoods: number;
  /** amount - costOfGoods */
  profit: number;
}

export interface CashTransaction extends BaseRecord {
  partyId: string;
  direction: CashDirection;
  amount: number;
}

/** Double-entry-ish ledger line used to build party statements + trial balance. */
export interface LedgerEntry extends BaseRecord {
  partyId: string;
  refType: 'purchase' | 'sale' | 'cash' | 'opening' | 'closing';
  refId: string;
  description: string;
  /** Debit increases what the party owes us. */
  debit: number;
  /** Credit increases what we owe the party. */
  credit: number;
}

export interface MonthlyClosing {
  id: string; // `${year}-${month}`
  month: number;
  year: number;
  closedAt: number;
  closedBy: string;
  stockSnapshot: StockLine[];
  partyBalances: { partyId: string; balance: number }[];
  summary: MonthlySummary;
}

export interface MonthlySummary {
  totalPurchase: number;
  totalSale: number;
  closingStockQty: number;
  closingStockValue: number;
  cashReceivable: number;
  cashPayable: number;
  netBalance: number;
  profitLoss: number;
  trialBalanced: boolean;
}

export interface StockLine {
  bondTypeId: string;
  bondTypeName: string;
  openingQty: number;
  purchasedQty: number;
  soldQty: number;
  closingQty: number;
  /** Weighted average cost per unit. */
  avgCost: number;
  closingValue: number;
}

export interface Settings {
  businessName: string;
  ownerName: string;
  address?: string;
  phone?: string;
  currency: string; // "PKR"
  smartEntryEnabled: boolean;
  updatedAt: number;
}

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

/** Parsed intent from Smart Entry natural language. */
export interface SmartIntent {
  kind: 'purchase' | 'sale' | 'cash';
  partyName?: string;
  bondTypeName?: string;
  quantity?: number;
  rate?: number;
  amount?: number;
  mode?: PaymentMode; // for purchase/sale
  direction?: CashDirection; // for cash
  confidence: number; // 0..1
  raw: string;
}

export type Period = { month: number; year: number };

// ---------------------------------------------------------------------------
// Opening balances (from one-time Excel migration) + extended accounting model
// ---------------------------------------------------------------------------

/** Marks records created by the one-time old-Excel migration. */
export const MIGRATION_SOURCE = 'old_excel_migration';

/** A bank / "file" account with a running balance (from the FILE sheet). */
export interface FileAccount {
  id: string;
  name: string;
  balance: number;
  createdAt: number;
  updatedAt: number;
  source?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Manual stock change that isn't a purchase/sale — e.g. opening stock you
 * already owned, a physical-count correction, or damaged/lost bonds.
 * Affects stock quantity & value but NOT cash or any party balance.
 * quantity is positive to add stock, negative to remove it.
 */
export interface StockAdjustment extends BaseRecord {
  bondTypeId: string;
  quantity: number;    // +add / -remove
  unitCost: number;    // cost per bond (for stock value + weighted avg)
  reason: string;      // "Opening stock", "Physical count", "Damaged", …
}

export type ExpenseKind = 'expense' | 'income';

export interface Expense extends BaseRecord {
  /** "expense" reduces cash & profit; "income" increases both. */
  kind: ExpenseKind;
  /** Free-text category label (e.g. Rent, Salary, Commission). */
  category: string;
  amount: number;
  description?: string;
}

/**
 * A single opening-balance snapshot per workspace, created by migration.
 * Feeds the engine as "period zero" so the very first month's stock, party
 * balances and cash/file positions start from the imported figures.
 */
export interface OpeningBalances {
  id: 'opening'; // singleton
  /** Effective period the opening applies from (first working month). */
  asOf: Period;
  stock: OpeningStockLine[];
  /** Party opening: +ve receivable, -ve payable. */
  parties: { partyId: string; balance: number }[];
  files: { fileAccountId: string; balance: number }[];
  importedProfit: number;
  source: string;
  createdAt: number;
}

export interface OpeningStockLine {
  bondTypeId: string;
  bondTypeName: string;
  qty: number;
  avgCost: number;
  value: number;
  /** From the sheet's PROFIT row, kept for reference. */
  importedProfit?: number;
}
