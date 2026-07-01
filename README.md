# Bond Ledger OS

**A premium, single-page Prize Bond / Bond Trading accounting application.**
Built for a non-technical bond business owner who wants to run everything inside
one beautiful app — no Excel after setup.

React + TypeScript + Firebase (Auth · Firestore · Hosting), offline-first with
automatic sync, macOS-inspired glass UI.

---

## ✨ Features

- **Purchase Entry** — Date, Party, Bond Type, Qty, Rate, Cash/Credit. Amount auto-calculates; stock, ledger, payable/cash and dashboard update instantly.
- **Sale Entry** — Same fields with Cash/Credit receipt. **Sales are blocked when stock is insufficient.** Profit/loss (weighted-average cost) computed automatically.
- **Cash Entry** — Received / Paid against any party; ledger and balances update live.
- **Reports** — Pick month/year and generate: Balance Check, Stock, Purchase, Sale, Cash Receivable, Cash Payable, Trial Balance, Ledger, Monthly Summary. Professional PDF + Excel export.
- **Monthly Closing** — One click locks the month, carries stock & party balances forward, and stores a monthly summary.
- **Smart Entry Mode** — Type plain sentences:
  - `Bought 100 bond 10 qty at 17500 from Ali cash`
  - `Sold 100 bond 5 qty at 17800 to Khan credit`
  - `Received 50000 from Ali`
  - `Paid 30000 to Khan`
- **Offline-first** — Firestore IndexedDB persistence; changes queue offline and sync when the internet returns.
- **Excel migration** — One-time old-data import lives **only in Settings** (never on the dashboard).
- **Keyboard-friendly** — F2 Purchase, F3 Sale, F4 Cash Received, F5 Cash Paid, F6 Ledger, F7 Reports, ⌘/Ctrl+K Search, ⌘/Ctrl+S Save, ⌘/Ctrl+P Print.

---

## 🚀 Quick start (Demo mode — no Firebase needed)

```bash
npm install
npm run dev
```

Open the printed URL. Because no Firebase keys are set, the app runs in **local
demo mode** (data persisted to your browser's `localStorage`). On the login
screen just click **Sign In** — credentials are pre-filled.

Then go to **Settings → Load Sample Data** to populate parties, bonds and
transactions for the current month.

---

## 🔥 Connect real Firebase (production)

1. Create a project at <https://console.firebase.google.com>.
2. **Authentication → Sign-in method → Email/Password → Enable.**
3. **Firestore Database → Create database** (Production mode).
4. **Project Settings → General → Your apps → Web app** → copy the config.
5. Copy `.env.example` to `.env` and fill in the values:

   ```bash
   cp .env.example .env
   ```

   ```env
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_USE_MOCK=false
   ```

6. Restart `npm run dev`. The app now uses real Auth + Firestore with offline persistence.

> To force demo mode even with keys present, set `VITE_USE_MOCK=true`.

### Deploy security rules & indexes

```bash
npm i -g firebase-tools
firebase login
firebase use --add            # select your project
firebase deploy --only firestore:rules,firestore:indexes
```

Rules (`firestore.rules`) scope every business record under
`users/{uid}/…`, so one Firebase project can safely serve many independent
bond businesses.

---

## 🌐 Deploy to Firebase Hosting

```bash
npm run build
firebase deploy --only hosting
```

`firebase.json` is preconfigured to serve `dist/` as an SPA.

---

## 🗂️ Data model (Firestore)

All under `users/{uid}/`:

| Collection        | Purpose                                   |
|-------------------|-------------------------------------------|
| `parties`         | Customers / suppliers + opening balance   |
| `bondTypes`       | Bond denominations (100, 750, 1500, …)    |
| `purchases`       | Purchase entries                          |
| `sales`           | Sale entries (with COGS + profit)         |
| `cashTransactions`| Cash received / paid                      |
| `monthlyClosings` | Locked month snapshots (carry-forward)    |
| `settings`        | Business profile & preferences            |

Ledger entries, receivables, payables, stock and trial balance are **derived**
from these on the fly by the pure accounting engine (`src/lib/accounting.ts`),
so they always stay consistent. Every record stores `date`, `month`, `year`,
`createdAt`, `updatedAt`; changing the month/year selector re-scopes the whole
app, and previous months stay saved.

---

## 📥 One-time Excel migration format

**Settings → Import Old Excel Data.** Download the template there, or use a
workbook with these sheets (extra columns are ignored, headers are
case-insensitive):

- **Parties**: `name`, `phone`, `openingBalance`
- **BondTypes**: `name`, `faceValue`
- **Purchases**: `date`, `party`, `bondType`, `quantity`, `rate`, `payment` (`cash`/`credit`)
- **Sales**: `date`, `party`, `bondType`, `quantity`, `rate`, `receipt` (`cash`/`credit`)
- **Cash**: `date`, `party`, `direction` (`received`/`paid`), `amount`

Parties and bond types referenced in transactions are auto-created if missing.

---

## ⌨️ Keyboard shortcuts

| Key         | Action           |
|-------------|------------------|
| `F2`        | New Purchase     |
| `F3`        | New Sale         |
| `F4`        | Cash Received    |
| `F5`        | Cash Paid        |
| `F6`        | Ledger           |
| `F7`        | Reports          |
| `⌘/Ctrl+K`  | Search palette   |
| `⌘/Ctrl+S`  | Save entry       |
| `⌘/Ctrl+P`  | Print            |

---

## 🧱 Project structure

```
src/
  components/
    layout/     Sidebar, Topbar, AppShell
    ui/         Icon, Modal, StatCard, Combo, Toasts, PageHeader
    SmartEntry.tsx, CommandPalette.tsx
  firebase/     config, dataAccess, authService, mock (offline demo)
  hooks/        useShortcuts
  lib/          accounting (engine), smartEntry (NLP), reportBuilder,
                exportPdf, exportExcel, importMigration, seed, utils
  pages/        Dashboard, Purchase, Sale, Stock, Balances, Ledger,
                TrialBalance, Reports, Settings, Login
  store/        authStore, dataStore, toast (Zustand)
  styles/       global.css (macOS glass theme)
```

---

## 🛠️ Scripts

| Command           | Description                             |
|-------------------|-----------------------------------------|
| `npm run dev`     | Start dev server                        |
| `npm run build`   | Type-check + production build           |
| `npm run preview` | Preview the production build            |
| `npm run seed`    | Seed a real Firebase project (Admin SDK)|

---

## 📝 Notes on accounting

- **Costing:** weighted-average per bond type. Sale profit = revenue − avg-cost COGS.
- **Party balance sign:** positive = receivable (they owe you); negative = payable (you owe them).
- **Trial balance:** assets (cash, receivables, closing stock) as debits; payables + profit as credits. Shows *Balanced ✓* when debits = credits.
- **Monthly closing** carries each bond's closing qty & avg cost and each party's
  balance into the next month's opening.

---

Built with ❤️ for bond traders. No Excel required.
