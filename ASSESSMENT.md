# Bond Ledger OS — Honest Assessment

**Question:** Is this software good for someone who has run their bond business on Excel for 8 years?

Short answer: **Yes — with a few honest caveats.** Below is a straight evaluation, not marketing.

---

## Who this is for

A prize-bond trader who currently keeps everything in Excel sheets (like the
"BALANCE SHEET / REC / PAY / FILE" workbook), does manual totals, and wants to
stop doing math by hand — but still thinks in terms of **party khata, bond
stock, cash, and a running statement** (exactly the Easy Khata style).

---

## Where it clearly beats Excel

| Excel today | Bond Ledger OS |
|---|---|
| Manual formulas; one wrong cell breaks totals | Every total (stock, profit, balance, trial balance) is **calculated automatically** and can't drift |
| You re-type party/bond names each row | Type a name **once**; it's remembered and reused |
| No stock control — you can "sell" bonds you don't have | **Oversell is blocked** with a live stock check |
| Profit is guesswork | Profit computed with **weighted-average cost** per sale |
| Reports = copy/paste into a new sheet | **One-click PDF/Excel** statements in the exact Easy-Khata layout |
| Balances carried forward by hand each month | **Monthly closing** carries stock & balances automatically |
| Excel on one PC | **Works on phone + desktop**, syncs live, works **offline** |
| Typing formulas | **Full keyboard entry** (Party → Bond → Qty → Rate → Save with Enter) |
| — | **Smart Entry**: type "Sold 100 bond 5 qty at 17800 to Khan credit" |

**The migration matters:** it reads your *real* existing workbook and imports
8 years of opening stock, receivables, payables and bank balances in one step —
so you don't start from zero.

---

## Honest weaknesses / things to know

1. **It's not a spreadsheet.** You can't type a custom formula in a random cell.
   It does bond-trading accounting *well*, but it's opinionated — if your Excel
   has bespoke calculations, those become fixed features, not free-form cells.

2. **Costing method is fixed (weighted-average).** That's the correct and common
   choice for bonds, but if you mentally track cost differently (FIFO, per-lot),
   the profit figure may differ from your habit. It's consistent and auditable,
   just not configurable yet.

3. **No multi-user roles / audit log yet.** Login was removed per request, so it's
   a single shared workspace. Anyone with the link can edit. Fine for one owner
   or a trusted desk; **not** yet suitable for staff with restricted access.

4. **Historical day-book (Sheet1) is imported as reference, not as live entries.**
   Opening balances are authoritative; old per-line history isn't fully replayed.

5. **Depends on Firebase.** Data lives in your Google/Firebase project. That's
   reliable and free at this scale, but you should keep the periodic **Excel
   backup** (built into monthly closing) so you always own an offline copy.

6. **Edits recalculate everything.** Editing/deleting an old entry re-derives
   stock and balances — powerful, but it means a locked (closed) month can't be
   edited without re-opening it. This is deliberate (protects closed books).

---

## Learning curve for an Excel veteran

- **Day 1:** Add parties/bonds (or import the old file), record purchases/sales
  like filling a row. Familiar.
- **Week 1:** Keyboard flow + Smart Entry make it *faster* than Excel.
- **Ongoing:** Reports and month-closing remove the boring manual work.

The mental model is the same as their khata: **party owes / I owe / stock in hand
/ cash / profit.** Nothing new to "learn" conceptually.

---

## Verdict

**8/10 for this specific user.**

- If the goal is *"stop doing manual bond accounting in Excel, keep the same
  khata thinking, get clean statements and correct stock/profit"* — this is a
  strong fit and a clear upgrade.
- The 2 points held back: no free-form formulas, and no multi-user controls yet.
  Neither blocks a single owner running their bond desk.

**Recommendation:** Import the old workbook, run one month in parallel with Excel
to build trust, then switch fully. Keep the monthly Excel backup for peace of mind.

---

*Reports and on-screen statements use the Easy-Khata layout (Total Debit /
Total Credit / Net Balance, then Date · Tafseel · Debit(-) · Credit(+) ·
Balance). Business/report name is set to **USAMA RAZA** in Settings and can be
changed anytime.*
