#!/usr/bin/env node
/**
 * Optional standalone seed for a REAL Firebase project (Admin SDK).
 *
 * In the app itself you can load the same sample data with one click:
 *   Settings → "Load Sample Data".
 *
 * To use this script against live Firestore:
 *   1. npm i -D firebase-admin
 *   2. Download a service account key from Firebase Console
 *      (Project Settings → Service accounts → Generate new private key)
 *      and save it as scripts/serviceAccount.json
 *   3. UID=<the-auth-uid> node scripts/seed.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keyPath = path.join(__dirname, 'serviceAccount.json');
const UID = process.env.UID;

if (!existsSync(keyPath)) {
  console.error('Missing scripts/serviceAccount.json. See the header of this file for setup.');
  process.exit(1);
}
if (!UID) {
  console.error('Set UID=<auth-uid> so data is written under users/<uid>/…');
  process.exit(1);
}

const admin = await import('firebase-admin').catch(() => {
  console.error('Run: npm i -D firebase-admin');
  process.exit(1);
});

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
admin.default.initializeApp({ credential: admin.default.credential.cert(serviceAccount) });
const db = admin.default.firestore();

const now = Date.now();
const id = () => (now + Math.random()).toString(36).replace('.', '').toUpperCase();

const parties = [
  { id: id(), name: 'Ali Traders', phone: '0300-1234567', openingBalance: 0, createdAt: now, updatedAt: now },
  { id: id(), name: 'Khan & Sons', phone: '0301-7654321', openingBalance: 25000, createdAt: now, updatedAt: now },
];
const bondTypes = [
  { id: id(), name: '100', faceValue: 100, createdAt: now, updatedAt: now },
  { id: id(), name: '750', faceValue: 750, createdAt: now, updatedAt: now },
];

async function writeAll(coll, rows) {
  const batch = db.batch();
  rows.forEach((r) => batch.set(db.doc(`users/${UID}/${coll}/${r.id}`), r));
  await batch.commit();
  console.log(`  ✓ ${coll}: ${rows.length}`);
}

console.log(`Seeding sample masters for uid=${UID}…`);
await writeAll('parties', parties);
await writeAll('bondTypes', bondTypes);
console.log('Done. Add purchases/sales inside the app, or extend this script.');
process.exit(0);
