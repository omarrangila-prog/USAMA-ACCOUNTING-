/**
 * Settle a party's outstanding balance to ZERO.
 *
 * Writes ONE partyAdjustment marked `settlement: true` — exactly what the app's
 * Balances → Receive/Pay button writes — and then refreshes any monthly closing
 * snapshot from that month onwards, which the app would otherwise keep reading
 * as the next month's opening balance. It clears the party balance and does
 * NOT touch Cash in Hand (the cash was already counted when the original entry
 * was made). Reversible: delete that one document.
 *
 *   node scripts/settle-party.mjs "Exp"              # dry run, shows what it would do
 *   node scripts/settle-party.mjs "Exp" --apply      # actually writes it
 *   node scripts/settle-party.mjs "Exp" --apply --date 2026-08-31
 *
 * The date matters. Party balances carry forward, so settling on 31 Aug zeroes
 * August AND every month after it. Settling in September would leave August
 * still showing the balance. Default is the last day of the month the balance
 * actually arose in.
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';

const cfg = {
  apiKey: 'AIzaSyBDsR-tJotkYb_RCVL7KLQD9STHS4S7X7Q',
  authDomain: 'osama-accounting.firebaseapp.com',
  projectId: 'osama-accounting',
  storageBucket: 'osama-accounting.firebasestorage.app',
  messagingSenderId: '13784767386',
  appId: '1:13784767386:web:d365278f0669bd86e9f823',
};
const WORKSPACE = process.env.WORKSPACE || 'bond-workspace';

const args = process.argv.slice(2);
const name = args.filter((a) => !a.startsWith('--'))
  .find((a, i, all) => all.indexOf(a) === i && args[args.indexOf(a) - 1] !== '--date');
const apply = args.includes('--apply');
const dateIdx = args.indexOf('--date');
const dateArg = dateIdx >= 0 ? args[dateIdx + 1] : undefined;   // absent → indexOf is -1, which would grab the party name
if (!name) {
  console.error('Usage: node scripts/settle-party.mjs "<party name>" [--apply] [--date YYYY-MM-DD]');
  process.exit(1);
}

const db = getFirestore(initializeApp(cfg));
const read = async (n) => (await getDocs(collection(db, 'users', WORKSPACE, n))).docs.map((d) => ({ id: d.id, ...d.data() }));

const parties = await read('parties');
const cash = await read('cashTransactions');
const adjustments = await read('partyAdjustments');

const matches = parties.filter((p) => (p.name ?? '').toLowerCase() === name.toLowerCase());
if (matches.length !== 1) {
  console.error(matches.length ? `Ambiguous name "${name}":` : `No party named "${name}".`);
  parties.filter((p) => (p.name ?? '').toLowerCase().includes(name.toLowerCase()))
    .forEach((p) => console.error(`   - "${p.name}" (${p.id})`));
  process.exit(1);
}
const party = matches[0];

const rows = [
  ...cash.filter((c) => c.partyId === party.id).map((c) => ({ ...c, delta: c.direction === 'received' ? c.amount : -c.amount })),
  ...adjustments.filter((a) => a.partyId === party.id).map((a) => ({ ...a, delta: a.amount })),
];
const balance = (party.openingBalance ?? 0) + rows.reduce((a, r) => a + r.delta, 0);

console.log(`Workspace : ${WORKSPACE}`);
console.log(`Party     : "${party.name}" (${party.id})`);
console.log(`Rows      : ${cash.filter((c) => c.partyId === party.id).length} cash, ${adjustments.filter((a) => a.partyId === party.id).length} adjustments`);
console.log(`Balance   : ${balance.toFixed(2)}  → ${balance < 0 ? `PAYABLE ${Math.abs(balance).toFixed(2)}` : `RECEIVABLE ${balance.toFixed(2)}`}`);

if (Math.abs(balance) < 0.005) { console.log('\nAlready zero — nothing to do.'); process.exit(0); }
if (adjustments.some((a) => a.partyId === party.id && a.settlement)) {
  console.log('\nA settlement already exists for this party. Refusing to add a second.');
  console.log('Delete the existing one first if you meant to redo it.');
  process.exit(1);
}

// Latest month any movement landed in — settle there so earlier months clear too.
const last = rows.reduce((m, r) => Math.max(m, r.year * 12 + r.month), 0);
const year = Math.floor((last - 1) / 12), month = last - year * 12;
const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
const date = dateArg || `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
const [dy, dm] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))];

// Payable (negative) → paying reduces what we owe → POSITIVE adjustment, and vice versa.
const rec = {
  id: `settle-${party.id}-${Date.now().toString(36)}`,
  partyId: party.id,
  amount: -balance,
  reason: balance < 0 ? 'Paid (settled)' : 'Received (settled)',
  settlement: true,
  date, month: dm, year: dy,
  createdAt: Date.now(), updatedAt: Date.now(),
};

console.log(`\nWould write partyAdjustments/${rec.id}`);
console.log(`  amount ${rec.amount.toFixed(2)}   date ${rec.date}   settlement true`);
console.log(`  → balance becomes 0.00 for ${date.slice(0, 7)} and every month after it`);
console.log('  → Cash in Hand is NOT changed');

if (!apply) { console.log('\nDRY RUN. Re-run with --apply to write it.'); process.exit(0); }

await setDoc(doc(db, 'users', WORKSPACE, 'partyAdjustments', rec.id), rec);
const after = await read('partyAdjustments');
const balanceAt = (upToKey) => (party.openingBalance ?? 0)
  + cash.filter((c) => c.partyId === party.id && c.year * 12 + c.month <= upToKey)
      .reduce((a, c) => a + (c.direction === 'received' ? c.amount : -c.amount), 0)
  + after.filter((a) => a.partyId === party.id && a.year * 12 + a.month <= upToKey)
      .reduce((a, x) => a + x.amount, 0);
console.log(`\nWRITTEN. Balance now ${balanceAt(9e9).toFixed(2)}`);

// A closed month stores a snapshot of every party balance, and the NEXT month's
// opening is read from it. Writing an adjustment from outside the app doesn't
// re-run its resync, so any snapshot from this month onwards would still show
// the OLD balance and the app would keep displaying it. Patch them.
const closings = await read('monthlyClosings');
const settleKey = rec.year * 12 + rec.month;
const stale = closings.filter((c) => c.year * 12 + c.month >= settleKey);
if (stale.length) {
  for (const c of stale) {
    const k = c.year * 12 + c.month;
    const fresh = balanceAt(k);
    const rows = (c.partyBalances ?? []).map((b) =>
      b.partyId === party.id ? { ...b, balance: fresh } : b);
    if (!rows.some((b) => b.partyId === party.id)) rows.push({ partyId: party.id, balance: fresh });
    await setDoc(doc(db, 'users', WORKSPACE, 'monthlyClosings', c.id), { ...c, partyBalances: rows });
    console.log(`  refreshed closing ${c.id}: "${party.name}" -> ${fresh.toFixed(2)}`);
  }
} else {
  console.log('  no closed months from this date onwards — nothing to refresh.');
}

console.log(`\nUndo: delete users/${WORKSPACE}/partyAdjustments/${rec.id}`);
console.log('      then Reports -> that month -> Refresh Summary');
process.exit(0);
