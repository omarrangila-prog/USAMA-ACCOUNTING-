import { create } from 'zustand';
import type {
  Party,
  BondType,
  Purchase,
  Sale,
  CashTransaction,
  MonthlyClosing,
  Settings,
  Period,
  PaymentMode,
  CashDirection,
  FileAccount,
  OpeningBalances,
  Expense,
  ExpenseCategory,
} from '@/types';
import {
  subscribeCollection,
  upsertDoc,
  removeDoc,
  bulkUpsert,
} from '@/firebase/dataAccess';
import {
  type DataSet,
  computeStock,
  computePartyBalances,
  availableStock,
  avgCostFor,
  computeProfitLoss,
} from '@/lib/accounting';
import { uid, now, periodOf, todayISO, round2, monthName, normalizeDenomination, normalizeName, shiftDateToPeriod } from '@/lib/utils';
import { toast } from './toast';

const DEFAULT_SETTINGS: Settings = {
  businessName: 'USAMA RAZA',
  ownerName: 'Usama Raza',
  currency: 'Rs',
  smartEntryEnabled: true,
  updatedAt: now(),
};

interface DataStore {
  uidRef: string | null;
  ready: boolean;
  online: boolean;

  parties: Party[];
  bondTypes: BondType[];
  purchases: Purchase[];
  sales: Sale[];
  cash: CashTransaction[];
  closings: MonthlyClosing[];
  fileAccounts: FileAccount[];
  expenses: Expense[];
  opening: OpeningBalances | null;
  settings: Settings;

  period: Period;

  // lifecycle
  bind: (userUid: string) => void;
  unbind: () => void;
  setPeriod: (p: Period) => void;
  setOnline: (v: boolean) => void;

  // derived
  dataset: () => DataSet;
  isMonthLocked: (p?: Period) => boolean;
  isMonthClosed: (p?: Period) => boolean;

  // masters
  addParty: (p: Omit<Party, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Party>;
  ensureParty: (name: string) => Promise<Party>;
  updateParty: (id: string, patch: Partial<Party>) => Promise<void>;
  deleteParty: (id: string) => Promise<void>;
  addBondType: (b: Omit<BondType, 'id' | 'createdAt' | 'updatedAt'>) => Promise<BondType>;
  ensureBondType: (name: string, faceValue?: number) => Promise<BondType>;
  updateBondType: (id: string, patch: Partial<BondType>) => Promise<void>;
  deleteBondType: (id: string) => Promise<void>;
  updateSettings: (s: Partial<Settings>) => Promise<void>;

  // transactions
  addPurchase: (input: PurchaseInput) => Promise<boolean>;
  addSale: (input: SaleInput) => Promise<boolean>;
  addCash: (input: CashInput) => Promise<boolean>;
  updatePurchase: (id: string, input: PurchaseInput) => Promise<boolean>;
  updateSale: (id: string, input: SaleInput) => Promise<boolean>;
  updateCash: (id: string, input: CashInput) => Promise<boolean>;
  addExpense: (input: ExpenseInput) => Promise<boolean>;
  updateExpense: (id: string, input: ExpenseInput) => Promise<boolean>;
  deleteExpense: (id: string) => Promise<void>;
  deleteRecord: (
    kind: 'purchases' | 'sales' | 'cashTransactions',
    id: string
  ) => Promise<void>;

  // closing
  closeMonth: (p: Period, closedBy: string) => Promise<MonthlyClosing | null>;
  /** If the given month was closed, silently refresh its snapshot after an edit. */
  resyncClosing: (p: Period) => Promise<void>;

  /** Count records in a period (for the Move Month preview). */
  countInPeriod: (p: Period) => { purchases: number; sales: number; cash: number; expenses: number; total: number };
  /** Move ALL records (purchases/sales/cash/expenses) from one month to another. */
  moveMonth: (from: Period, to: Period) => Promise<number>;

  // migration
  importBulk: (payload: ImportPayload) => Promise<void>;
  importOpeningMigration: (bundle: MigrationImport) => Promise<boolean>;
  clearOpeningMigration: () => Promise<void>;
}

export interface MigrationImport {
  parties: Party[];
  bondTypes: BondType[];
  files: FileAccount[];
  opening: OpeningBalances;
}

export interface PurchaseInput {
  date: string;
  partyId: string;
  bondTypeId: string;
  quantity: number;
  rate: number;
  payment: PaymentMode;
  note?: string;
}
export interface SaleInput {
  date: string;
  partyId: string;
  bondTypeId: string;
  quantity: number;
  rate: number;
  receipt: PaymentMode;
  note?: string;
}
export interface CashInput {
  date: string;
  partyId: string;
  direction: CashDirection;
  amount: number;
  note?: string;
}
export interface ExpenseInput {
  date: string;
  kind: 'expense' | 'income';
  category: string;
  amount: number;
  description?: string;
}

export interface ImportPayload {
  parties?: Party[];
  bondTypes?: BondType[];
  purchases?: Purchase[];
  sales?: Sale[];
  cash?: CashTransaction[];
}

let unsubs: Array<() => void> = [];

export const useData = create<DataStore>((set, get) => ({
  uidRef: null,
  ready: false,
  online: navigator.onLine,

  parties: [],
  bondTypes: [],
  purchases: [],
  sales: [],
  cash: [],
  closings: [],
  fileAccounts: [],
  expenses: [],
  opening: null,
  settings: DEFAULT_SETTINGS,

  period: (() => {
    const d = new Date();
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  })(),

  bind: (userUid) => {
    get().unbind();
    set({ uidRef: userUid, ready: false });

    const sub = <T,>(name: any, key: keyof DataStore) =>
      subscribeCollection<T>(userUid, name, (rows) => {
        set({ [key]: rows } as any);
      });

    unsubs = [
      sub<Party>('parties', 'parties'),
      sub<BondType>('bondTypes', 'bondTypes'),
      sub<Purchase>('purchases', 'purchases'),
      sub<Sale>('sales', 'sales'),
      sub<CashTransaction>('cashTransactions', 'cash'),
      sub<MonthlyClosing>('monthlyClosings', 'closings'),
      sub<FileAccount>('fileAccounts', 'fileAccounts'),
      sub<Expense>('expenses', 'expenses'),
      subscribeCollection<Settings & { id: string }>(userUid, 'settings', (rows) => {
        const s = rows.find((r) => r.id === 'app');
        if (s) set({ settings: { ...DEFAULT_SETTINGS, ...s } });
      }),
      subscribeCollection<OpeningBalances>(userUid, 'openingBalances', (rows) => {
        set({ opening: rows.find((r) => r.id === 'opening') ?? null });
      }),
    ];

    // Mark ready shortly after binding (snapshots arrive synchronously in mock).
    setTimeout(() => set({ ready: true }), 60);
  },

  unbind: () => {
    unsubs.forEach((u) => u());
    unsubs = [];
    set({ ready: false });
  },

  setPeriod: (p) => set({ period: p }),
  setOnline: (v) => set({ online: v }),

  dataset: () => {
    const s = get();
    return {
      parties: s.parties,
      bondTypes: s.bondTypes,
      purchases: s.purchases,
      sales: s.sales,
      cash: s.cash,
      closings: s.closings,
      opening: s.opening,
      expenses: s.expenses,
    };
  },

  // Months are NEVER locked — every record stays editable in any month,
  // including closed ones. Closing only creates a summary snapshot + carries
  // balances forward; it does not prevent add/edit/delete. Use isMonthClosed()
  // for informational UI only.
  isMonthLocked: () => false,

  isMonthClosed: (p) => {
    const period = p ?? get().period;
    return get().closings.some(
      (c) => c.month === period.month && c.year === period.year
    );
  },

  addParty: async (p) => {
    const u = get().uidRef;
    if (!u) { toast.error('Not ready yet — try again in a moment.'); throw new Error('no workspace'); }
    const target = normalizeName(p.name);
    const dup = get().parties.find((x) => normalizeName(x.name) === target);
    if (dup) return dup;
    const party: Party = { id: uid(), createdAt: now(), updatedAt: now(), ...p, name: p.name.trim() };
    await upsertDoc(u, 'parties', party);
    toast.success(`Party ${party.name} created.`);
    return party;
  },

  ensureParty: async (name) => {
    const target = normalizeName(name);
    const existing = get().parties.find((p) => normalizeName(p.name) === target);
    if (existing) return existing;
    return get().addParty({ name: name.trim(), openingBalance: 0 });
  },

  updateParty: async (id, patch) => {
    const u = get().uidRef!;
    const cur = get().parties.find((p) => p.id === id);
    if (!cur) return;
    await upsertDoc(u, 'parties', { ...cur, ...patch, updatedAt: now() });
    toast.success('Party updated.');
  },

  deleteParty: async (id) => {
    const u = get().uidRef!;
    const s = get();
    const inUse =
      s.purchases.some((p) => p.partyId === id) ||
      s.sales.some((x) => x.partyId === id) ||
      s.cash.some((c) => c.partyId === id);
    if (inUse) {
      toast.error('Party has transactions — cannot delete.');
      return;
    }
    await removeDoc(u, 'parties', id);
    toast.info('Party deleted.');
  },

  addBondType: async (b) => {
    const u = get().uidRef;
    if (!u) { toast.error('Not ready yet — try again in a moment.'); throw new Error('no workspace'); }
    // Prevent duplicate denominations (1,500 == 1500 == "1500").
    const target = normalizeDenomination(b.name);
    const dup = get().bondTypes.find((x) => normalizeDenomination(x.name) === target);
    if (dup) { toast.info(`Bond ${dup.name} already exists.`); return dup; }
    const bond: BondType = { id: uid(), createdAt: now(), updatedAt: now(), ...b, name: b.name.trim() };
    await upsertDoc(u, 'bondTypes', bond);
    toast.success(`Bond type ${bond.name} created.`);
    return bond;
  },

  ensureBondType: async (name, faceValue) => {
    const target = normalizeDenomination(name);
    const existing = get().bondTypes.find((b) => normalizeDenomination(b.name) === target);
    if (existing) return existing;
    const fv = faceValue ?? (Number(name.replace(/,/g, '')) || 0);
    return get().addBondType({ name: name.trim(), faceValue: fv });
  },

  updateBondType: async (id, patch) => {
    const u = get().uidRef!;
    const cur = get().bondTypes.find((b) => b.id === id);
    if (!cur) return;
    await upsertDoc(u, 'bondTypes', { ...cur, ...patch, updatedAt: now() });
    toast.success('Bond type updated.');
  },

  deleteBondType: async (id) => {
    const u = get().uidRef!;
    const s = get();
    const inUse = s.purchases.some((p) => p.bondTypeId === id) || s.sales.some((x) => x.bondTypeId === id);
    if (inUse) {
      toast.error('Bond type has transactions — cannot delete.');
      return;
    }
    await removeDoc(u, 'bondTypes', id);
    toast.info('Bond type deleted.');
  },

  updateSettings: async (s) => {
    const u = get().uidRef!;
    const merged = { ...get().settings, ...s, updatedAt: now() };
    await upsertDoc(u, 'settings', { id: 'app', ...merged } as any);
    set({ settings: merged });
  },

  addPurchase: async (input) => {
    const u = get().uidRef!;
    const { month, year } = periodOf(input.date);
    if (get().isMonthLocked({ month, year })) {
      toast.error(`${monthName(month)} ${year} is closed and locked.`);
      return false;
    }
    if (input.quantity <= 0 || input.rate <= 0) {
      toast.error('Quantity and rate must be positive.');
      return false;
    }
    const amount = round2(input.quantity * input.rate);
    const rec: Purchase = {
      id: uid(),
      date: input.date,
      month,
      year,
      partyId: input.partyId,
      bondTypeId: input.bondTypeId,
      quantity: input.quantity,
      rate: input.rate,
      amount,
      payment: input.payment,
      note: input.note,
      createdAt: now(),
      updatedAt: now(),
    };
    await upsertDoc(u, 'purchases', rec);
    await get().resyncClosing({ month: rec.month, year: rec.year });
    toast.success(`Purchase saved · ${amount.toLocaleString()}`);
    return true;
  },

  addSale: async (input) => {
    const u = get().uidRef!;
    const { month, year } = periodOf(input.date);
    const period = { month, year };
    if (get().isMonthLocked(period)) {
      toast.error(`${monthName(month)} ${year} is closed and locked.`);
      return false;
    }
    if (input.quantity <= 0 || input.rate <= 0) {
      toast.error('Quantity and rate must be positive.');
      return false;
    }
    // Oversell prevention against live stock in that period.
    const stock = availableStock(get().dataset(), input.bondTypeId, period);
    if (input.quantity > stock) {
      toast.error(`Insufficient stock. Available: ${stock}, requested: ${input.quantity}.`);
      return false;
    }
    const amount = round2(input.quantity * input.rate);
    const unitCost = avgCostFor(get().dataset(), input.bondTypeId, period);
    const costOfGoods = round2(unitCost * input.quantity);
    const rec: Sale = {
      id: uid(),
      date: input.date,
      month,
      year,
      partyId: input.partyId,
      bondTypeId: input.bondTypeId,
      quantity: input.quantity,
      rate: input.rate,
      amount,
      receipt: input.receipt,
      costOfGoods,
      profit: round2(amount - costOfGoods),
      note: input.note,
      createdAt: now(),
      updatedAt: now(),
    };
    await upsertDoc(u, 'sales', rec);
    await get().resyncClosing({ month: rec.month, year: rec.year });
    toast.success(`Sale saved · profit ${rec.profit.toLocaleString()}`);
    return true;
  },

  addCash: async (input) => {
    const u = get().uidRef!;
    const { month, year } = periodOf(input.date);
    if (get().isMonthLocked({ month, year })) {
      toast.error(`${monthName(month)} ${year} is closed and locked.`);
      return false;
    }
    if (input.amount <= 0) {
      toast.error('Amount must be positive.');
      return false;
    }
    const rec: CashTransaction = {
      id: uid(),
      date: input.date,
      month,
      year,
      partyId: input.partyId,
      direction: input.direction,
      amount: round2(input.amount),
      note: input.note,
      createdAt: now(),
      updatedAt: now(),
    };
    await upsertDoc(u, 'cashTransactions', rec);
    await get().resyncClosing({ month: rec.month, year: rec.year });
    toast.success(
      `Cash ${input.direction} · ${rec.amount.toLocaleString()}`
    );
    return true;
  },

  updatePurchase: async (id, input) => {
    const u = get().uidRef!;
    const cur = get().purchases.find((p) => p.id === id);
    if (!cur) return false;
    const { month, year } = periodOf(input.date);
    if (get().isMonthLocked({ month, year })) { toast.error('Month is locked.'); return false; }
    if (input.quantity <= 0 || input.rate <= 0) { toast.error('Quantity and rate must be positive.'); return false; }
    const amount = round2(input.quantity * input.rate);
    const rec: Purchase = {
      ...cur, date: input.date, month, year, partyId: input.partyId, bondTypeId: input.bondTypeId,
      quantity: input.quantity, rate: input.rate, amount, payment: input.payment, note: input.note, updatedAt: now(),
    };
    await upsertDoc(u, 'purchases', rec);
    await get().resyncClosing({ month: rec.month, year: rec.year });
    toast.success('Purchase updated.');
    return true;
  },

  updateSale: async (id, input) => {
    const u = get().uidRef!;
    const cur = get().sales.find((s) => s.id === id);
    if (!cur) return false;
    const { month, year } = periodOf(input.date);
    const period = { month, year };
    if (get().isMonthLocked(period)) { toast.error('Month is locked.'); return false; }
    if (input.quantity <= 0 || input.rate <= 0) { toast.error('Quantity and rate must be positive.'); return false; }
    // Oversell check against stock EXCLUDING this sale's current quantity.
    const stockNow = availableStock(get().dataset(), input.bondTypeId, period);
    const sameBond = cur.bondTypeId === input.bondTypeId;
    const allowance = stockNow + (sameBond ? cur.quantity : 0);
    if (input.quantity > allowance) {
      toast.error(`Insufficient stock. Max sellable: ${allowance}.`);
      return false;
    }
    const amount = round2(input.quantity * input.rate);
    const unitCost = avgCostFor(get().dataset(), input.bondTypeId, period);
    const costOfGoods = round2(unitCost * input.quantity);
    const rec: Sale = {
      ...cur, date: input.date, month, year, partyId: input.partyId, bondTypeId: input.bondTypeId,
      quantity: input.quantity, rate: input.rate, amount, receipt: input.receipt,
      costOfGoods, profit: round2(amount - costOfGoods), note: input.note, updatedAt: now(),
    };
    await upsertDoc(u, 'sales', rec);
    await get().resyncClosing({ month: rec.month, year: rec.year });
    toast.success('Sale updated.');
    return true;
  },

  updateCash: async (id, input) => {
    const u = get().uidRef!;
    const cur = get().cash.find((c) => c.id === id);
    if (!cur) return false;
    const { month, year } = periodOf(input.date);
    if (get().isMonthLocked({ month, year })) { toast.error('Month is locked.'); return false; }
    if (input.amount <= 0) { toast.error('Amount must be positive.'); return false; }
    const rec: CashTransaction = {
      ...cur, date: input.date, month, year, partyId: input.partyId,
      direction: input.direction, amount: round2(input.amount), note: input.note, updatedAt: now(),
    };
    await upsertDoc(u, 'cashTransactions', rec);
    await get().resyncClosing({ month: rec.month, year: rec.year });
    toast.success('Cash entry updated.');
    return true;
  },

  addExpense: async (input) => {
    const u = get().uidRef;
    if (!u) { toast.error('Not ready yet.'); return false; }
    const { month, year } = periodOf(input.date);
    if (get().isMonthLocked({ month, year })) { toast.error(`${monthName(month)} ${year} is locked.`); return false; }
    if (input.amount <= 0) { toast.error('Amount must be positive.'); return false; }
    if (!input.category.trim()) { toast.error('Enter a category.'); return false; }
    const rec: Expense = {
      id: uid(), date: input.date, month, year, kind: input.kind,
      category: input.category.trim(), amount: round2(input.amount),
      description: input.description, createdAt: now(), updatedAt: now(),
    };
    await upsertDoc(u, 'expenses', rec);
    await get().resyncClosing({ month: rec.month, year: rec.year });
    toast.success(`${input.kind === 'income' ? 'Income' : 'Expense'} saved · ${rec.amount.toLocaleString()}`);
    return true;
  },

  updateExpense: async (id, input) => {
    const u = get().uidRef!;
    const cur = get().expenses.find((e) => e.id === id);
    if (!cur) return false;
    const { month, year } = periodOf(input.date);
    if (get().isMonthLocked({ month, year })) { toast.error('Month is locked.'); return false; }
    if (input.amount <= 0) { toast.error('Amount must be positive.'); return false; }
    const rec: Expense = {
      ...cur, date: input.date, month, year, kind: input.kind,
      category: input.category.trim(), amount: round2(input.amount),
      description: input.description, updatedAt: now(),
    };
    await upsertDoc(u, 'expenses', rec);
    await get().resyncClosing({ month: rec.month, year: rec.year });
    toast.success('Entry updated.');
    return true;
  },

  deleteExpense: async (id) => {
    const u = get().uidRef!;
    const rec = get().expenses.find((e) => e.id === id);
    await removeDoc(u, 'expenses', id);
    if (rec) await get().resyncClosing({ month: rec.month, year: rec.year });
    toast.info('Entry deleted.');
  },

  deleteRecord: async (kind, id) => {
    const u = get().uidRef!;
    // Find the record's period before removing, to refresh a closed month.
    const all = kind === 'purchases' ? get().purchases : kind === 'sales' ? get().sales : get().cash;
    const rec = all.find((r) => r.id === id);
    await removeDoc(u, kind, id);
    if (rec) await get().resyncClosing({ month: rec.month, year: rec.year });
    toast.info('Record deleted.');
  },

  closeMonth: async (p, closedBy) => {
    const u = get().uidRef!;
    // Re-closing is allowed and simply refreshes the summary/snapshot — useful
    // after editing records in an already-closed month.
    const reclosing = get().isMonthClosed(p);
    const data = get().dataset();
    const stock = computeStock(data, p);
    const balances = computePartyBalances(data, p);

    const totalPurchase = data.purchases
      .filter((r) => r.month === p.month && r.year === p.year)
      .reduce((a, r) => a + r.amount, 0);
    const totalSale = data.sales
      .filter((r) => r.month === p.month && r.year === p.year)
      .reduce((a, r) => a + r.amount, 0);
    // Profit including expenses & income for this period.
    const profit = computeProfitLoss(data, p);
    const receivable = balances.filter((b) => b.balance > 0).reduce((a, b) => a + b.balance, 0);
    const payable = balances.filter((b) => b.balance < 0).reduce((a, b) => a + Math.abs(b.balance), 0);
    const closingStockValue = stock.reduce((a, s) => a + s.closingValue, 0);
    const closingStockQty = stock.reduce((a, s) => a + s.closingQty, 0);

    const closing: MonthlyClosing = {
      id: `${p.year}-${String(p.month).padStart(2, '0')}`,
      month: p.month,
      year: p.year,
      closedAt: now(),
      closedBy,
      stockSnapshot: stock,
      partyBalances: balances.map((b) => ({ partyId: b.partyId, balance: b.balance })),
      summary: {
        totalPurchase: round2(totalPurchase),
        totalSale: round2(totalSale),
        closingStockQty,
        closingStockValue: round2(closingStockValue),
        cashReceivable: round2(receivable),
        cashPayable: round2(payable),
        netBalance: round2(receivable - payable + closingStockValue),
        profitLoss: round2(profit),
        trialBalanced: true,
      },
    };
    await upsertDoc(u, 'monthlyClosings', closing as any);
    toast.success(
      reclosing
        ? `${monthName(p.month)} ${p.year} summary refreshed.`
        : `${monthName(p.month)} ${p.year} closed. Balances carried forward.`
    );
    return closing;
  },

  resyncClosing: async (p) => {
    const u = get().uidRef;
    if (!u || !get().isMonthClosed(p)) return;
    const data = get().dataset();
    const stock = computeStock(data, p);
    const balances = computePartyBalances(data, p);
    const inP = (r: { month: number; year: number }) => r.month === p.month && r.year === p.year;
    const totalPurchase = data.purchases.filter(inP).reduce((a, r) => a + r.amount, 0);
    const totalSale = data.sales.filter(inP).reduce((a, r) => a + r.amount, 0);
    const receivable = balances.filter((b) => b.balance > 0).reduce((a, b) => a + b.balance, 0);
    const payable = balances.filter((b) => b.balance < 0).reduce((a, b) => a + Math.abs(b.balance), 0);
    const closingStockValue = stock.reduce((a, s) => a + s.closingValue, 0);
    const existing = get().closings.find((c) => c.month === p.month && c.year === p.year)!;
    const closing: MonthlyClosing = {
      ...existing,
      stockSnapshot: stock,
      partyBalances: balances.map((b) => ({ partyId: b.partyId, balance: b.balance })),
      summary: {
        totalPurchase: round2(totalPurchase),
        totalSale: round2(totalSale),
        closingStockQty: stock.reduce((a, s) => a + s.closingQty, 0),
        closingStockValue: round2(closingStockValue),
        cashReceivable: round2(receivable),
        cashPayable: round2(payable),
        netBalance: round2(receivable - payable + closingStockValue),
        profitLoss: computeProfitLoss(data, p),
        trialBalanced: true,
      },
    };
    await upsertDoc(u, 'monthlyClosings', closing as any);
  },

  countInPeriod: (p) => {
    const s = get();
    const inP = (r: { month: number; year: number }) => r.month === p.month && r.year === p.year;
    const purchases = s.purchases.filter(inP).length;
    const sales = s.sales.filter(inP).length;
    const cash = s.cash.filter(inP).length;
    const expenses = s.expenses.filter(inP).length;
    return { purchases, sales, cash, expenses, total: purchases + sales + cash + expenses };
  },

  /**
   * Move every record from one month to another by re-dating it (day kept,
   * month/year changed). Purchases, sales, cash and expenses all move. Closing
   * snapshots for both months are refreshed so carry-forward stays correct.
   */
  moveMonth: async (from, to) => {
    const u = get().uidRef;
    if (!u) { toast.error('Not ready yet.'); return 0; }
    const s = get();
    const inFrom = (r: { month: number; year: number }) => r.month === from.month && r.year === from.year;
    let moved = 0;

    const reDate = async <T extends { id: string; date: string; month: number; year: number; updatedAt: number }>(
      rows: T[], coll: any
    ) => {
      for (const r of rows.filter(inFrom)) {
        const date = shiftDateToPeriod(r.date, to);
        await upsertDoc(u, coll, { ...r, date, month: to.month, year: to.year, updatedAt: now() });
        moved++;
      }
    };

    await reDate(s.purchases, 'purchases');
    await reDate(s.sales, 'sales');
    await reDate(s.cash, 'cashTransactions');
    await reDate(s.expenses, 'expenses');

    // Refresh closings for both months (source is now emptier, target fuller).
    await get().resyncClosing(from);
    await get().resyncClosing(to);

    if (moved > 0) {
      toast.success(`Moved ${moved} record${moved === 1 ? '' : 's'} from ${monthName(from.month)} ${from.year} to ${monthName(to.month)} ${to.year}.`);
      // Jump the view to the target month so the user sees the result.
      set({ period: to });
    } else {
      toast.info(`No records found in ${monthName(from.month)} ${from.year}.`);
    }
    return moved;
  },

  importBulk: async (payload) => {
    const u = get().uidRef!;
    if (payload.parties?.length) await bulkUpsert(u, 'parties', payload.parties);
    if (payload.bondTypes?.length) await bulkUpsert(u, 'bondTypes', payload.bondTypes);
    if (payload.purchases?.length) await bulkUpsert(u, 'purchases', payload.purchases);
    if (payload.sales?.length) await bulkUpsert(u, 'sales', payload.sales);
    if (payload.cash?.length) await bulkUpsert(u, 'cashTransactions', payload.cash);
    toast.success('Old data imported successfully.');
  },

  /**
   * One-time old-Excel migration. Creates parties, bond types, file accounts
   * and a singleton opening-balances doc. Refuses to run twice (duplicate
   * guard) — the opening doc's presence is the lock.
   */
  importOpeningMigration: async (bundle) => {
    const u = get().uidRef!;
    if (get().opening) {
      toast.error('Old data was already imported. Reset it first to re-import.');
      return false;
    }
    if (bundle.parties.length) await bulkUpsert(u, 'parties', bundle.parties);
    if (bundle.bondTypes.length) await bulkUpsert(u, 'bondTypes', bundle.bondTypes);
    if (bundle.files.length) await bulkUpsert(u, 'fileAccounts', bundle.files);
    await upsertDoc(u, 'openingBalances', bundle.opening as any);
    // Jump the app to the opening period so the imported figures are visible.
    set({ period: bundle.opening.asOf });
    toast.success('Old Excel data imported as opening balances.');
    return true;
  },

  clearOpeningMigration: async () => {
    const u = get().uidRef!;
    const op = get().opening;
    if (!op) return;
    // Remove the opening doc + the migration-tagged file accounts.
    await removeDoc(u, 'openingBalances', 'opening');
    for (const f of get().fileAccounts.filter((f) => f.source === 'old_excel_migration')) {
      await removeDoc(u, 'fileAccounts', f.id);
    }
    set({ opening: null });
    toast.info('Old-data import reset. You can import again.');
  },
}));

// Expose the store on window in dev so automated QA can drive real actions.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as any).__bondStore = useData;
}

// Track connectivity for the offline banner + auto-sync UX.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useData.getState().setOnline(true);
    toast.success('Back online — syncing…');
  });
  window.addEventListener('offline', () => {
    useData.getState().setOnline(false);
    toast.warning('Offline — changes saved locally and will sync.');
  });
}

export { todayISO };
