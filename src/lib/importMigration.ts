/**
 * One-time old-data migration: convert parsed Excel sheets into an ImportPayload.
 * Party & bond names are resolved/created; ids are stable within one import.
 */
import type { ImportPayload } from '@/store/dataStore';
import type { Party, BondType, Purchase, Sale, CashTransaction } from '@/types';
import { uid, now, periodOf, round2 } from './utils';

type Rows = Record<string, any>[];

function normDate(v: any): string {
  if (typeof v === 'number') {
    // Excel serial date -> ISO
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function num(v: any): number {
  return Number(String(v).replace(/,/g, '')) || 0;
}

export interface MigrationResult {
  payload: ImportPayload;
  counts: Record<string, number>;
  warnings: string[];
}

export function buildMigration(sheets: Record<string, Rows>): MigrationResult {
  const t = now();
  const warnings: string[] = [];

  const partyByName = new Map<string, Party>();
  const bondByName = new Map<string, BondType>();

  const ensureParty = (name: string, opening = 0, phone?: string): Party => {
    const key = name.trim().toLowerCase();
    let p = partyByName.get(key);
    if (!p) {
      p = { id: uid(), name: name.trim(), phone, openingBalance: opening, createdAt: t, updatedAt: t };
      partyByName.set(key, p);
    }
    return p;
  };
  const ensureBond = (name: string, face = 0): BondType => {
    const key = String(name).trim().toLowerCase();
    let b = bondByName.get(key);
    if (!b) {
      const nm = String(name).trim();
      b = { id: uid(), name: nm, faceValue: face || num(nm), createdAt: t, updatedAt: t };
      bondByName.set(key, b);
    }
    return b;
  };

  // Find sheets case-insensitively.
  const find = (want: string): Rows =>
    sheets[Object.keys(sheets).find((k) => k.toLowerCase() === want.toLowerCase()) ?? ''] ?? [];

  const key = (row: Rows[number], ...names: string[]): any => {
    for (const n of names) {
      const k = Object.keys(row).find((kk) => kk.toLowerCase().trim() === n.toLowerCase());
      if (k !== undefined) return row[k];
    }
    return undefined;
  };

  // Parties sheet (optional — parties also auto-created from transactions).
  find('parties').forEach((r) => {
    const name = key(r, 'name', 'party');
    if (name) ensureParty(String(name), num(key(r, 'openingBalance', 'opening', 'balance')), key(r, 'phone') ? String(key(r, 'phone')) : undefined);
  });
  find('bondtypes').forEach((r) => {
    const name = key(r, 'name', 'bond', 'bondType');
    if (name) ensureBond(String(name), num(key(r, 'faceValue', 'face')));
  });

  const purchases: Purchase[] = [];
  find('purchases').forEach((r, i) => {
    const partyN = key(r, 'party', 'name');
    const bondN = key(r, 'bondType', 'bond', 'type');
    if (!partyN || !bondN) { warnings.push(`Purchases row ${i + 2}: missing party or bond, skipped.`); return; }
    const date = normDate(key(r, 'date'));
    const p = periodOf(date);
    const qty = num(key(r, 'quantity', 'qty'));
    const rate = num(key(r, 'rate', 'price'));
    purchases.push({
      id: uid(), date, month: p.month, year: p.year,
      partyId: ensureParty(String(partyN)).id, bondTypeId: ensureBond(String(bondN)).id,
      quantity: qty, rate, amount: round2(qty * rate),
      payment: String(key(r, 'payment', 'mode') ?? 'cash').toLowerCase().includes('cred') ? 'credit' : 'cash',
      createdAt: t, updatedAt: t,
    });
  });

  const sales: Sale[] = [];
  find('sales').forEach((r, i) => {
    const partyN = key(r, 'party', 'name');
    const bondN = key(r, 'bondType', 'bond', 'type');
    if (!partyN || !bondN) { warnings.push(`Sales row ${i + 2}: missing party or bond, skipped.`); return; }
    const date = normDate(key(r, 'date'));
    const p = periodOf(date);
    const qty = num(key(r, 'quantity', 'qty'));
    const rate = num(key(r, 'rate', 'price'));
    const amount = round2(qty * rate);
    const cog = num(key(r, 'cost', 'costOfGoods'));
    sales.push({
      id: uid(), date, month: p.month, year: p.year,
      partyId: ensureParty(String(partyN)).id, bondTypeId: ensureBond(String(bondN)).id,
      quantity: qty, rate, amount,
      receipt: String(key(r, 'receipt', 'mode') ?? 'cash').toLowerCase().includes('cred') ? 'credit' : 'cash',
      costOfGoods: cog, profit: round2(amount - cog),
      createdAt: t, updatedAt: t,
    });
  });

  const cash: CashTransaction[] = [];
  find('cash').forEach((r, i) => {
    const partyN = key(r, 'party', 'name');
    if (!partyN) { warnings.push(`Cash row ${i + 2}: missing party, skipped.`); return; }
    const date = normDate(key(r, 'date'));
    const p = periodOf(date);
    cash.push({
      id: uid(), date, month: p.month, year: p.year,
      partyId: ensureParty(String(partyN)).id,
      direction: String(key(r, 'direction', 'type') ?? 'received').toLowerCase().includes('paid') ? 'paid' : 'received',
      amount: num(key(r, 'amount')),
      createdAt: t, updatedAt: t,
    });
  });

  const payload: ImportPayload = {
    parties: [...partyByName.values()],
    bondTypes: [...bondByName.values()],
    purchases, sales, cash,
  };

  return {
    payload,
    counts: {
      Parties: payload.parties!.length,
      Bonds: payload.bondTypes!.length,
      Purchases: purchases.length,
      Sales: sales.length,
      Cash: cash.length,
    },
    warnings,
  };
}
