/**
 * Move dated records from one month into another.
 *
 * Changes ONLY the date/month/year on each record. Nothing is created or
 * deleted, no amount, party, direction or note is altered — so every figure the
 * records produce stays identical, it just lands in a different month.
 *
 *   node scripts/move-entries.mjs --from 2026-10 --to 2026-09-30
 *   node scripts/move-entries.mjs --from 2026-10 --to 2026-09-30 --apply
 *
 * Refuses to touch a record marked `locked`. Prints every record before and
 * after, and re-reads to confirm. To undo, run it the other way with the
 * original date.
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
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const from = argOf('--from');          // YYYY-MM  (source month)
const to = argOf('--to');              // YYYY-MM-DD (target date)
const apply = args.includes('--apply');

if (!/^\d{4}-\d{2}$/.test(from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? '')) {
  console.error('Usage: node scripts/move-entries.mjs --from YYYY-MM --to YYYY-MM-DD [--apply]');
  process.exit(1);
}
const [fy, fm] = from.split('-').map(Number);
const [ty, tm] = [Number(to.slice(0, 4)), Number(to.slice(5, 7))];

const db = getFirestore(initializeApp(cfg));
const COLLECTIONS = ['sales', 'purchases', 'cashTransactions', 'partyAdjustments', 'expenses', 'stockAdjustments'];
const read = async (n) => (await getDocs(collection(db, 'users', WORKSPACE, n))).docs.map((d) => ({ id: d.id, ...d.data() }));

const parties = await read('parties');
const nameOf = (id) => parties.find((p) => p.id === id)?.name ?? '(no party)';

const found = [];
for (const name of COLLECTIONS) {
  for (const r of await read(name)) {
    if (r.month === fm && r.year === fy) found.push({ ...r, coll: name });
  }
}

console.log(`Workspace : ${WORKSPACE}`);
console.log(`Move      : ${from}  ->  ${to}  (month ${tm}, year ${ty})`);
console.log(`Found     : ${found.length} record(s)\n`);

const locked = found.filter((r) => r.locked);
if (locked.length) {
  console.log(`REFUSING: ${locked.length} record(s) are locked. Unlock them in the app first.`);
  locked.forEach((r) => console.log(`   ${r.coll}/${r.id}  ${r.date}`));
  process.exit(1);
}
if (!found.length) { console.log('Nothing to move.'); process.exit(0); }

found.forEach((r) => console.log(
  `  ${r.coll.padEnd(18)} ${r.date} -> ${to}   ${(r.direction ?? '').padEnd(8)} ${(r.amount ?? 0).toFixed(2).padStart(13)}  ${nameOf(r.partyId)}`));

if (!apply) { console.log('\nDRY RUN. Re-run with --apply to move them.'); process.exit(0); }

for (const r of found) {
  const { coll, ...rec } = r;
  await setDoc(doc(db, 'users', WORKSPACE, coll, r.id),
    { ...rec, date: to, month: tm, year: ty, updatedAt: Date.now() });
  console.log(`  moved ${coll}/${r.id}`);
}

// Confirm by re-reading.
let leftBehind = 0, arrived = 0;
for (const name of COLLECTIONS) {
  for (const r of await read(name)) {
    if (r.month === fm && r.year === fy) leftBehind++;
    if (found.some((f) => f.id === r.id) && r.month === tm && r.year === ty) arrived++;
  }
}
console.log(`\nDONE. In ${to.slice(0, 7)}: ${arrived}/${found.length}. Still in ${from}: ${leftBehind}.`);
console.log(`Undo: node scripts/move-entries.mjs --from ${to.slice(0, 7)} --to ${found[0].date} --apply  (moves that whole month back)`);
process.exit(0);
