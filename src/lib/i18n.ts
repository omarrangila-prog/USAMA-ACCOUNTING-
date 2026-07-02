/**
 * Lightweight English / Urdu (Roman + native) dictionary.
 * The toggle lives in the top bar; the choice is persisted in localStorage.
 * Keys are short identifiers; values are [English, Urdu].
 */
import { create } from 'zustand';

export type Lang = 'en' | 'ur';

type Dict = Record<string, [string, string]>;

// Urdu strings use native script; nav items keep the English word in brackets
// so a bilingual user is never lost.
const DICT: Dict = {
  // Nav
  'nav.dashboard': ['Dashboard', 'ڈیش بورڈ'],
  'nav.purchase': ['Purchase', 'خرید'],
  'nav.sale': ['Sale', 'فروخت'],
  'nav.expenses': ['Expenses', 'اخراجات'],
  'nav.stock': ['Stock', 'اسٹاک'],
  'nav.parties': ['Parties', 'پارٹیاں'],
  'nav.bondTypes': ['Bond Types', 'بانڈ اقسام'],
  'nav.receivable': ['Receivable', 'وصول طلب'],
  'nav.payable': ['Payable', 'قابل ادا'],
  'nav.ledger': ['Ledger', 'کھاتہ'],
  'nav.trialBalance': ['Trial Balance', 'ٹرائل بیلنس'],
  'nav.reports': ['Reports', 'رپورٹس'],
  'nav.settings': ['Settings', 'ترتیبات'],

  // Common fields / actions
  'f.party': ['Party', 'پارٹی'],
  'f.bond': ['Bond Type', 'بانڈ'],
  'f.quantity': ['Quantity', 'تعداد'],
  'f.rate': ['Rate', 'ریٹ'],
  'f.amount': ['Amount', 'رقم'],
  'f.date': ['Date', 'تاریخ'],
  'f.cash': ['Cash', 'نقد'],
  'f.credit': ['Credit', 'ادھار'],
  'f.save': ['Save', 'محفوظ کریں'],
  'f.category': ['Category', 'قسم'],
  'f.note': ['Note', 'تفصیل'],
  'f.type': ['Type', 'قسم'],
  'f.income': ['Income', 'آمدنی'],
  'f.expense': ['Expense', 'خرچہ'],

  // Dashboard cards
  'd.totalPurchase': ['Total Purchase', 'کل خرید'],
  'd.totalSale': ['Total Sale', 'کل فروخت'],
  'd.closingStock': ['Closing Stock', 'اختتامی اسٹاک'],
  'd.cashReceivable': ['Cash Receivable', 'وصول طلب'],
  'd.cashPayable': ['Cash Payable', 'قابل ادا'],
  'd.expenses': ['Expenses', 'اخراجات'],
  'd.netBalance': ['Net Balance', 'خالص بیلنس'],
  'd.profitLoss': ['Profit / Loss', 'نفع / نقصان'],
  'd.trialBalance': ['Trial Balance', 'ٹرائل بیلنس'],

  // Buttons
  'b.newPurchase': ['New Purchase', 'نئی خرید'],
  'b.newSale': ['New Sale', 'نئی فروخت'],
  'b.addPurchase': ['Save Purchase', 'خرید محفوظ کریں'],
  'b.addSale': ['Save Sale', 'فروخت محفوظ کریں'],

  // Page titles + subtitles
  'p.purchaseTitle': ['Purchase Entry', 'خرید کا اندراج'],
  'p.purchaseSub': ['Record bond purchases from parties', 'پارٹیوں سے بانڈ کی خرید درج کریں'],
  'p.saleTitle': ['Sale Entry', 'فروخت کا اندراج'],
  'p.saleSub': ['Record bond sales to parties', 'پارٹیوں کو بانڈ کی فروخت درج کریں'],
  'p.expensesTitle': ['Expenses & Income', 'اخراجات و آمدنی'],
  'p.stockTitle': ['Stock Report', 'اسٹاک رپورٹ'],
  'p.receivableTitle': ['Cash Receivable', 'وصول طلب رقم'],
  'p.payableTitle': ['Cash Payable', 'قابل ادا رقم'],
  'p.reportsTitle': ['Reports', 'رپورٹس'],
  'p.settingsTitle': ['Settings', 'ترتیبات'],

  // Form helpers
  'f.receipt': ['Receipt', 'وصولی'],
  'f.payment': ['Payment', 'ادائیگی'],
  'f.newEntry': ['New Entry', 'نیا اندراج'],
  'f.editEntry': ['Edit Entry', 'اندراج میں ترمیم'],
  'f.total': ['Total', 'کل'],
  'f.profit': ['Profit', 'نفع'],
  'f.mode': ['Mode', 'طریقہ'],
  'f.saveEntry': ['Save', 'محفوظ کریں'],
  'f.available': ['Available stock', 'دستیاب اسٹاک'],
  'f.monthClosed': ['This month is closed — entries stay editable.', 'یہ مہینہ بند ہے — اندراج قابلِ ترمیم ہیں۔'],
  'f.noEntries': ['No entries this month yet.', 'اس مہینے ابھی کوئی اندراج نہیں۔'],
  'f.entries': ['Entries', 'اندراجات'],
  'f.addExpense': ['Add Expense', 'خرچہ شامل کریں'],
  'f.addIncome': ['Add Income', 'آمدنی شامل کریں'],
  'f.totalExpense': ['Total Expense', 'کل خرچہ'],
  'f.totalIncome': ['Total Income', 'کل آمدنی'],
  'f.net': ['Net', 'خالص'],
  'f.cancel': ['Cancel', 'منسوخ'],
};

interface I18nStore {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('bondos-lang')) as Lang | null;

export const useI18n = create<I18nStore>((set, get) => ({
  lang: stored === 'ur' ? 'ur' : 'en',
  setLang: (l) => {
    localStorage.setItem('bondos-lang', l);
    document.documentElement.setAttribute('lang', l);
    set({ lang: l });
  },
  t: (key) => {
    const entry = DICT[key];
    if (!entry) return key;
    return get().lang === 'ur' ? entry[1] : entry[0];
  },
}));

/**
 * Convenience hook returning a translate function that re-renders on language
 * change. We subscribe to `lang` (not `t`, which is a stable reference) so
 * components using useT() actually update when the user switches language.
 */
export function useT() {
  const lang = useI18n((s) => s.lang);
  return (key: string): string => {
    const entry = DICT[key];
    if (!entry) return key;
    return lang === 'ur' ? entry[1] : entry[0];
  };
}
