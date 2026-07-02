/**
 * Financial Engine tests — the single source of truth for cash / receivable /
 * payable totals. Run with:  node src/lib/financials.test.mjs
 *
 * Uses esbuild (already a dependency) to bundle the TS engine, then asserts the
 * netting rules from the spec. No test framework required.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { tmpdir } from 'os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = resolve(tmpdir(), 'bond-financials.bundle.mjs');

await build({
  entryPoints: [resolve(HERE, 'accounting.ts')],
  bundle: true, format: 'esm', platform: 'node',
  outfile: OUT, logLevel: 'error',
  alias: { '@': resolve(ROOT, 'src') },
});
const eng = await import('file://' + OUT);
const { computeFinancials, computeDashboard, computeBusinessSummary, computePartyBalances } = eng;

// ---- tiny assert harness --------------------------------------------------
let pass = 0, fail = 0;
function eq(label, got, want) {
  if (got === want) { pass++; console.log(`  ok   ${label}: ${got}`); }
  else { fail++; console.log(`  FAIL ${label}: got ${got}, want ${want}`); }
}

const now = Date.now();
const P = { month: 7, year: 2026 };
const base = { month: 7, year: 2026, createdAt: now, updatedAt: now };
const cashSale = (amount) => ({ id: 'cs' + Math.random(), partyId: '', bondTypeId: 'b1', quantity: 1, rate: amount, amount, receipt: 'cash', costOfGoods: 0, profit: 0, date: '2026-07-01', ...base });
const adj = (id, partyId, amount) => ({ id, partyId, amount, reason: amount > 0 ? 'Receivable' : 'Payable', date: '2026-07-02', ...base });
const mkData = (parties, partyAdjustments, sales = []) => ({
  parties: parties.map((p) => ({ openingBalance: 0, createdAt: now, updatedAt: now, ...p })),
  bondTypes: [{ id: 'b1', name: '100', faceValue: 100 }],
  purchases: [], sales, cash: [], partyAdjustments, expenses: [], closings: [], opening: null,
});

// ---- Test 1: same party, receivable 300k + payable 300k => both 0, hidden ---
console.log('Test 1 — same party 300k rec + 300k pay → net 0');
{
  const data = mkData([{ id: 'A', name: 'Ali' }], [adj('r', 'A', 300000), adj('p', 'A', -300000)]);
  const fin = computeFinancials(data, P);
  eq('netReceivable', fin.netReceivable, 0);
  eq('netPayable', fin.netPayable, 0);
  const shown = computePartyBalances(data, P).filter((b) => Math.abs(b.balance) > 0.005);
  eq('parties shown', shown.length, 0);
}

// ---- Test 2: same party, receivable 500k + payable 1,000k => pay 500k --------
console.log('Test 2 — same party 500k rec + 1,000k pay → payable 500k');
{
  const data = mkData([{ id: 'A', name: 'Ali' }], [adj('r', 'A', 500000), adj('p', 'A', -1000000)]);
  const fin = computeFinancials(data, P);
  eq('netReceivable', fin.netReceivable, 0);
  eq('netPayable', fin.netPayable, 500000);
}

// ---- Test 3: different parties + cash 400k => cash in hand -100k -------------
console.log('Test 3 — Ali rec 500k, Ahmed pay 1,000k, cash 400k → CIH -100k');
{
  const data = mkData(
    [{ id: 'A', name: 'Ali' }, { id: 'B', name: 'Ahmed' }],
    [adj('r', 'A', 500000), adj('p', 'B', -1000000)],
    [cashSale(400000)]
  );
  const fin = computeFinancials(data, P);
  eq('rawCash', fin.rawCash, 400000);
  eq('netReceivable', fin.netReceivable, 500000);   // different parties → both show
  eq('netPayable', fin.netPayable, 1000000);
  eq('cashInHand', fin.cashInHand, -100000);
  // dashboard + business summary must agree with the engine
  const d = computeDashboard(data, P);
  eq('dashboard.cashInHand', d.cashInHand, -100000);
  eq('dashboard.cashReceivable', d.cashReceivable, 500000);
  eq('dashboard.cashPayable', d.cashPayable, 1000000);
  const bs = computeBusinessSummary(data, P);
  eq('summary.cashInHand', bs.cashInHand, -100000);
  eq('summary.netReceivable', bs.netReceivable, 500000);
  eq('summary.netPayable', bs.netPayable, 1000000);
}

// ---- Test 4: delete a payable → totals update -------------------------------
console.log('Test 4 — delete payable txn → recompute');
{
  const parties = [{ id: 'A', name: 'Ali' }, { id: 'B', name: 'Ahmed' }];
  const withPay = mkData(parties, [adj('r', 'A', 500000), adj('p', 'B', -1000000)], [cashSale(400000)]);
  const afterDelete = mkData(parties, [adj('r', 'A', 500000)], [cashSale(400000)]); // payable removed
  const before = computeFinancials(withPay, P);
  const after = computeFinancials(afterDelete, P);
  eq('before.netPayable', before.netPayable, 1000000);
  eq('after.netPayable', after.netPayable, 0);
  eq('after.cashInHand', after.cashInHand, 900000); // 400k cash + 500k receivable
}

// ---- Test 5: edit a receivable amount → old reversed, new applied ------------
console.log('Test 5 — edit receivable 500k → 200k');
{
  const parties = [{ id: 'A', name: 'Ali' }];
  const old = mkData(parties, [adj('r', 'A', 500000)]);
  const edited = mkData(parties, [adj('r', 'A', 200000)]); // same id, new amount
  eq('old.netReceivable', computeFinancials(old, P).netReceivable, 500000);
  eq('edited.netReceivable', computeFinancials(edited, P).netReceivable, 200000);
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
