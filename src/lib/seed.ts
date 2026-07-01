/** Sample seed data so a new user immediately sees a working dashboard. */
import type { ImportPayload } from '@/store/dataStore';
import type { Party, BondType, Purchase, Sale, CashTransaction } from '@/types';
import { uid, now, periodOf, round2 } from './utils';

export function buildSeed(): ImportPayload & { settings?: any } {
  const t = now();
  const parties: Party[] = [
    { id: uid(), name: 'Ali Traders', phone: '0300-1234567', openingBalance: 0, createdAt: t, updatedAt: t },
    { id: uid(), name: 'Khan & Sons', phone: '0301-7654321', openingBalance: 25000, createdAt: t, updatedAt: t },
    { id: uid(), name: 'Bilal Bond House', phone: '0333-9988776', openingBalance: -15000, createdAt: t, updatedAt: t },
    { id: uid(), name: 'Sana Investments', phone: '0345-1122334', openingBalance: 0, createdAt: t, updatedAt: t },
  ];
  const bonds: BondType[] = [
    { id: uid(), name: '100', faceValue: 100, createdAt: t, updatedAt: t },
    { id: uid(), name: '750', faceValue: 750, createdAt: t, updatedAt: t },
    { id: uid(), name: '1500', faceValue: 1500, createdAt: t, updatedAt: t },
    { id: uid(), name: '40000', faceValue: 40000, createdAt: t, updatedAt: t },
  ];

  // Current month so the dashboard lights up immediately.
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const day = (n: number) => `${d.getFullYear()}-${mm}-${String(Math.min(n, 28)).padStart(2, '0')}`;

  const mkPurchase = (
    date: string, partyId: string, bondTypeId: string, quantity: number, rate: number, payment: 'cash' | 'credit'
  ): Purchase => {
    const p = periodOf(date);
    return { id: uid(), date, month: p.month, year: p.year, partyId, bondTypeId, quantity, rate,
      amount: round2(quantity * rate), payment, createdAt: t, updatedAt: t };
  };

  const purchases: Purchase[] = [
    mkPurchase(day(2), parties[0].id, bonds[0].id, 20, 17400, 'cash'),
    mkPurchase(day(3), parties[1].id, bonds[1].id, 15, 51000, 'credit'),
    mkPurchase(day(5), parties[0].id, bonds[2].id, 10, 96500, 'cash'),
    mkPurchase(day(7), parties[3].id, bonds[0].id, 30, 17450, 'credit'),
  ];

  // Sales priced with a small margin; cost handled by engine at read time, but
  // seed sets a reasonable costOfGoods/profit so P/L shows before recompute.
  const mkSale = (
    date: string, partyId: string, bondTypeId: string, quantity: number, rate: number,
    unitCost: number, receipt: 'cash' | 'credit'
  ): Sale => {
    const p = periodOf(date);
    const amount = round2(quantity * rate);
    const cog = round2(unitCost * quantity);
    return { id: uid(), date, month: p.month, year: p.year, partyId, bondTypeId, quantity, rate,
      amount, receipt, costOfGoods: cog, profit: round2(amount - cog), createdAt: t, updatedAt: t };
  };

  const sales: Sale[] = [
    mkSale(day(6), parties[1].id, bonds[0].id, 12, 17800, 17417, 'credit'),
    mkSale(day(8), parties[2].id, bonds[1].id, 8, 51600, 51000, 'cash'),
    mkSale(day(10), parties[3].id, bonds[2].id, 5, 97200, 96500, 'credit'),
  ];

  const mkCash = (date: string, partyId: string, direction: 'received' | 'paid', amount: number): CashTransaction => {
    const p = periodOf(date);
    return { id: uid(), date, month: p.month, year: p.year, partyId, direction, amount, createdAt: t, updatedAt: t };
  };

  const cash: CashTransaction[] = [
    mkCash(day(9), parties[1].id, 'received', 100000),
    mkCash(day(11), parties[0].id, 'paid', 50000),
  ];

  return { parties, bondTypes: bonds, purchases, sales, cash };
}
