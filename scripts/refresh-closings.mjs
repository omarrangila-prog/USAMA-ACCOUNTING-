/**
 * Rebuild the stored party balances inside monthly closing snapshots.
 *
 * A closed month stores a snapshot of every party balance, and the NEXT month's
 * opening is read from it. Anything written from outside the app — a script, a
 * deleted party, a direct Firestore edit — doesn't re-run the app's resync, so
 * the snapshot keeps showing the OLD figure and the app keeps displaying it
 * even though the records say otherwise.
 *
 * This recomputes each snapshot row from the live records and rewrites only the
 * rows that disagree. Nothing else in the closing is touched: no sale, purchase,
 * cash entry or adjustment is created, changed or deleted, and Cash in Hand is
 * not affected.
 *
 *   node scripts/refresh-closings.mjs            # dry run — lists what is stale
 *   node scripts/refresh-closings.mjs --apply    # rewrite the stale rows
 *
 * Equivalent to opening each closed month in the app and pressing
 * Reports → Monthly Closing → "Refresh Summary", for the party balances.
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
const apply = process.argv.includes('--apply');

const db = getFirestore(initializeApp(cfg));
const read = async (n) => (await getDocs(collection(db, 'users', WORKSPACE, n))).docs.map((d) => ({ id: d.id, ...d.data() }));

const [parties, cash, adjustments, closings] = await Promise.all(
  ['parties', 'cashTransactions', 'partyAdjustments', 'monthlyClosings'].map(read)
);
const key = (r) => r.year * 12 + r.month;
const nameOf = (id) => parties.find((p) => p.id === id)?.name ?? '(deleted party)';

/** A party's balance as at `upToKey`, straight from the records. */
const balanceAt = (partyId, upToKey) =>
  (parties.find((p) => p.id === partyId)?.openingBalance ?? 0)
  + cash.filter((c) => c.partyId === partyId && key(c) <= upToKey)
      .reduce((a, c) => a + (c.direction === 'received' ? c.amount : -c.amount), 0)
  + adjustments.filter((a) => a.partyId === partyId && key(a) <= upToKey)
      .reduce((a, x) => a + x.amount, 0);

console.log(`Workspace : ${WORKSPACE}`);
console.log(`Closings  : ${closings.length}\n`);

let totalStale = 0;
for (const c of closings.sort((a, b) => key(a) - key(b))) {
  const k = key(c);
  const rows = c.partyBalances ?? [];
  const fixed = rows.map((b) => ({ ...b, balance: balanceAt(b.partyId, k) }));
  const stale = rows
    .map((b, i) => ({ b, live: fixed[i].balance }))
    .filter((x) => Math.abs(x.live - x.b.balance) > 0.005);

  console.log(`${c.id}  closed ${new Date(c.closedAt).toISOString().slice(0, 16)}  rows=${rows.length}  stale=${stale.length}`);
  stale.forEach((x) =>
    console.log(`    ${nameOf(x.b.partyId).padEnd(24)} snapshot ${x.b.balance.toFixed(2).padStart(14)}  ->  live ${x.live.toFixed(2)}`));
  totalStale += stale.length;

  if (stale.length && apply) {
    await setDoc(doc(db, 'users', WORKSPACE, 'monthlyClosings', c.id), { ...c, partyBalances: fixed });
    console.log(`    rewritten.`);
  }
}

if (!totalStale) {
  console.log('\nEvery snapshot already matches the records. Nothing to do.');
} else if (!apply) {
  console.log(`\n${totalStale} stale row(s). DRY RUN — re-run with --apply to rewrite them.`);
} else {
  // Prove it: re-read and re-check.
  const after = await read('monthlyClosings');
  const left = after.reduce((n, c) =>
    n + (c.partyBalances ?? []).filter((b) => Math.abs(balanceAt(b.partyId, key(c)) - b.balance) > 0.005).length, 0);
  console.log(`\nDONE. Stale rows remaining: ${left}`);
}
process.exit(0);
