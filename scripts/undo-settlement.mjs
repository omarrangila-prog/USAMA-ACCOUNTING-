/**
 * Delete a settlement adjustment, restoring the balance it cancelled.
 *
 * A settlement is the single record written by Balances → Receive/Pay (and by
 * settle-party.mjs). Removing it puts the party's balance back exactly as it
 * was before — nothing else is touched, and Cash in Hand is unaffected either
 * way, since settlements never move cash.
 *
 *   node scripts/undo-settlement.mjs "HELP A/C"           # dry run
 *   node scripts/undo-settlement.mjs "HELP A/C" --apply   # delete it
 *
 * Also refreshes any closing snapshot from that month onwards, so the app's
 * stored month-end copy agrees with the records afterwards.
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, deleteDoc, setDoc } from 'firebase/firestore';

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
const name = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--apply');
if (!name) { console.error('Usage: node scripts/undo-settlement.mjs "<party name>" [--apply]'); process.exit(1); }

const db = getFirestore(initializeApp(cfg));
const read = async (n) => (await getDocs(collection(db, 'users', WORKSPACE, n))).docs.map((d) => ({ id: d.id, ...d.data() }));
const [parties, cash, adjustments, closings] = await Promise.all(
  ['parties', 'cashTransactions', 'partyAdjustments', 'monthlyClosings'].map(read));

const party = parties.find((p) => (p.name ?? '').toLowerCase() === name.toLowerCase());
if (!party) { console.error(`No party named "${name}".`); process.exit(1); }

const key = (r) => r.year * 12 + r.month;
const settlements = adjustments.filter((a) => a.partyId === party.id && a.settlement);
const balanceAt = (k, excludeIds = []) => (party.openingBalance ?? 0)
  + cash.filter((c) => c.partyId === party.id && key(c) <= k)
      .reduce((a, c) => a + (c.direction === 'received' ? c.amount : -c.amount), 0)
  + adjustments.filter((a) => a.partyId === party.id && key(a) <= k && !excludeIds.includes(a.id))
      .reduce((a, x) => a + x.amount, 0);

console.log(`Party     : "${party.name}"`);
console.log(`Settlements found: ${settlements.length}\n`);
if (!settlements.length) { console.log('Nothing to undo.'); process.exit(0); }

const ids = settlements.map((s) => s.id);
settlements.forEach((s) => console.log(`  ${s.date}  +${s.amount.toFixed(2)}  "${s.reason}"  id=${s.id}`));

const K = 2026 * 12 + 12;
console.log(`\n  balance now            : ${balanceAt(K).toFixed(2)}`);
console.log(`  balance after deleting : ${balanceAt(K, ids).toFixed(2)}`);
console.log('  Cash in Hand: unchanged (settlements never move cash)');

if (!apply) { console.log('\nDRY RUN. Re-run with --apply to delete.'); process.exit(0); }

for (const s of settlements) {
  await deleteDoc(doc(db, 'users', WORKSPACE, 'partyAdjustments', s.id));
  console.log(`  deleted ${s.id}`);
}

// Keep stored month-end snapshots in step with the records.
const fresh = await read('partyAdjustments');
const liveAt = (k) => (party.openingBalance ?? 0)
  + cash.filter((c) => c.partyId === party.id && key(c) <= k)
      .reduce((a, c) => a + (c.direction === 'received' ? c.amount : -c.amount), 0)
  + fresh.filter((a) => a.partyId === party.id && key(a) <= k).reduce((a, x) => a + x.amount, 0);
for (const c of closings) {
  const rows = c.partyBalances ?? [];
  const i = rows.findIndex((b) => b.partyId === party.id);
  if (i < 0) continue;
  const want = liveAt(key(c));
  if (Math.abs(rows[i].balance - want) > 0.005) {
    const next = rows.map((b, j) => (j === i ? { ...b, balance: want } : b));
    await setDoc(doc(db, 'users', WORKSPACE, 'monthlyClosings', c.id), { ...c, partyBalances: next });
    console.log(`  refreshed closing ${c.id}: ${rows[i].balance.toFixed(2)} -> ${want.toFixed(2)}`);
  }
}
console.log(`\nDONE. Balance now ${liveAt(K).toFixed(2)}`);
process.exit(0);
