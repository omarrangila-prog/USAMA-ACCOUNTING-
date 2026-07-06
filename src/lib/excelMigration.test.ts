import { describe, it, expect } from 'vitest';
import { parseNameAmountSheet, parseCashFigures } from './excelMigration';

/**
 * Regression tests for the three import bugs found in the client's 18-6-2026.xlsx:
 * 1. a party literally named "FILE" (with a balance) was silently dropped.
 * 2. cash ("CASH IN HAND") was not read.
 * 3. duplicate names must not merge — parseNameAmountSheet keeps every row.
 */
describe('parseNameAmountSheet — FILE-named party is NOT dropped', () => {
  it('keeps a genuine party named "FILE" that has an amount', () => {
    const grid = [
      ['PAYABLE', ''],
      ['SHAKEEL', 1500000],
      ['FILE ', 3541352],   // real party, previously skipped as a header word
      ['TOTAL', 5041352],   // summary row → skipped
    ];
    const rows = parseNameAmountSheet(grid);
    const names = rows.map((r) => r.name);
    expect(names).toContain('FILE');
    expect(rows.find((r) => r.name === 'FILE')!.amount).toBe(3541352);
    expect(names).not.toContain('TOTAL');           // total still skipped
    expect(rows.reduce((a, r) => a + r.amount, 0)).toBe(1500000 + 3541352);
  });

  it('still skips a bare header word "FILE" with no amount', () => {
    const grid = [['FILE', ''], ['ARIF', 19300]];
    const rows = parseNameAmountSheet(grid);
    expect(rows.map((r) => r.name)).toEqual(['ARIF']);
  });

  it('every row is returned separately (no merge of duplicate names)', () => {
    const grid = [
      ['SARFARAZ', 3293000],
      ['SARFARAZ', 4780500],
      ['MUSTAFA', 3321950],
      ['MUSTAFA', 800000],
    ];
    const rows = parseNameAmountSheet(grid);
    expect(rows.length).toBe(4);   // NOT merged into 2
    expect(rows.reduce((a, r) => a + r.amount, 0)).toBe(3293000 + 4780500 + 3321950 + 800000);
  });
});

describe('parseCashFigures — reads both cash candidates', () => {
  it('picks CASH IN HAND and reports TOTAL HAND CASH separately', () => {
    const grid = [
      ['', 'CASH IN HAND ', 7323580],
      ['', 'TOTAL HAND CASH', 118836],
    ];
    const c = parseCashFigures(grid);
    expect(c.cashInHand).toBe(7323580);
    expect(c.totalHandCash).toBe(118836);
  });

  it('returns null when no cash label present', () => {
    const c = parseCashFigures([['STOCK', 100]]);
    expect(c.cashInHand).toBeNull();
    expect(c.totalHandCash).toBeNull();
  });
});
