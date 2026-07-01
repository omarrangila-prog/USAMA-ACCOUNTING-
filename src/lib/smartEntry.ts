/**
 * Smart Entry — parse plain typed sentences into structured intents.
 *
 * Examples handled:
 *   "Bought 100 bond 10 qty at 17500 from Ali cash"
 *   "Sold 100 bond 5 qty at 17800 to Khan credit"
 *   "Received 50000 from Ali"
 *   "Paid 30000 to Khan"
 */
import type { SmartIntent, Party, BondType, PaymentMode } from '@/types';
import { fuzzyIncludes } from './utils';

const PURCHASE_WORDS = ['bought', 'buy', 'purchase', 'purchased'];
const SALE_WORDS = ['sold', 'sell', 'sale', 'sale to'];
const RECEIVE_WORDS = ['received', 'receive', 'got', 'collection'];
const PAID_WORDS = ['paid', 'pay', 'payment', 'gave'];

function firstNumberAfter(tokens: string[], idx: number): number | undefined {
  for (let i = idx; i < tokens.length; i++) {
    const n = Number(tokens[i].replace(/,/g, ''));
    if (Number.isFinite(n) && tokens[i].match(/^[\d,]+(\.\d+)?$/)) return n;
  }
  return undefined;
}

function extractParty(text: string, parties: Party[]): string | undefined {
  // Prefer the token after "from"/"to".
  const m = text.match(/\b(?:from|to)\s+([a-z][a-z\s.]*?)(?:\s+(?:cash|credit)\b|$)/i);
  const guess = m?.[1]?.trim();
  if (guess) {
    const matched = parties.find((p) => fuzzyIncludes(p.name, guess) || fuzzyIncludes(guess, p.name));
    return matched?.name ?? guess;
  }
  // Fallback: any known party mentioned.
  const found = parties.find((p) => fuzzyIncludes(text, p.name));
  return found?.name;
}

function extractMode(text: string): PaymentMode | undefined {
  if (/\bcredit\b|\budhaar\b|\budhar\b/i.test(text)) return 'credit';
  if (/\bcash\b/i.test(text)) return 'cash';
  return undefined;
}

function extractBond(text: string, bondTypes: BondType[]): string | undefined {
  // Look for "<denomination> bond" or a known bond name.
  const m = text.match(/(\d[\d,]*)\s*(?:rs\.?\s*)?bond/i);
  if (m) {
    const denom = m[1].replace(/,/g, '');
    const match = bondTypes.find((b) => b.name.replace(/,/g, '') === denom);
    if (match) return match.name;
    return denom; // caller can create/select
  }
  const named = bondTypes.find((b) => fuzzyIncludes(text, b.name));
  return named?.name;
}

/**
 * Parse a sentence. Numbers: for purchase/sale we expect a quantity
 * (marked by "qty"/"x"/"pcs") and a rate (marked by "at"/"@"/"rate").
 */
export function parseSmartEntry(
  raw: string,
  parties: Party[],
  bondTypes: BondType[]
): SmartIntent | null {
  const text = raw.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const tokens = lower.split(/\s+/);

  const isPurchase = PURCHASE_WORDS.some((w) => lower.includes(w));
  const isSale = SALE_WORDS.some((w) => lower.startsWith(w) || lower.includes(' ' + w));
  const isReceive = RECEIVE_WORDS.some((w) => lower.startsWith(w));
  const isPaid = PAID_WORDS.some((w) => lower.startsWith(w));

  // --- Cash intents ---
  if ((isReceive || isPaid) && !isPurchase && !isSale) {
    const amount = firstNumberAfter(tokens, 0);
    const partyName = extractParty(text, parties);
    if (amount) {
      return {
        kind: 'cash',
        direction: isReceive ? 'received' : 'paid',
        amount,
        partyName,
        confidence: partyName ? 0.9 : 0.6,
        raw,
      };
    }
  }

  // --- Purchase / Sale intents ---
  if (isPurchase || isSale) {
    const kind = isSale ? 'sale' : 'purchase';
    const bondTypeName = extractBond(text, bondTypes);

    // Quantity: number immediately before "qty"/"pcs"/"x"; else the smaller-ish number.
    let quantity: number | undefined;
    const qtyMatch = lower.match(/(\d[\d,]*)\s*(?:qty|pcs|pieces|nos|x)\b/);
    if (qtyMatch) quantity = Number(qtyMatch[1].replace(/,/g, ''));

    // Rate: number after "at"/"@"/"rate".
    let rate: number | undefined;
    const rateMatch = lower.match(/(?:at|@|rate)\s*(\d[\d,]*(?:\.\d+)?)/);
    if (rateMatch) rate = Number(rateMatch[1].replace(/,/g, ''));

    const mode = extractMode(text) ?? 'cash';
    const partyName = extractParty(text, parties);

    // Confidence based on how much we resolved.
    let confidence = 0.4;
    if (quantity) confidence += 0.2;
    if (rate) confidence += 0.2;
    if (partyName) confidence += 0.1;
    if (bondTypeName) confidence += 0.1;

    return {
      kind,
      bondTypeName,
      quantity,
      rate,
      mode,
      partyName,
      confidence: Math.min(confidence, 0.99),
      raw,
    };
  }

  return null;
}
