import { describe, it, expect } from 'vitest';
import { toWaNumber, waChatUrl } from './whatsappShare';

/**
 * WhatsApp only accepts a bare international number — no +, spaces or dashes,
 * and never a leading 0. Numbers in Masters are typed the local way
 * ("0300-1234567"), so the conversion has to be exact or the chat opens on the
 * wrong person (or not at all).
 */
describe('toWaNumber — local phone → WhatsApp number', () => {
  it('local Pakistani format gets the country code, losing the leading 0', () => {
    expect(toWaNumber('0300-1234567')).toBe('923001234567');
    expect(toWaNumber('0300 1234567')).toBe('923001234567');
    expect(toWaNumber('03001234567')).toBe('923001234567');
  });

  it('already-international numbers are left alone', () => {
    expect(toWaNumber('+92 300 1234567')).toBe('923001234567');
    expect(toWaNumber('923001234567')).toBe('923001234567');
    expect(toWaNumber('0092 300 1234567')).toBe('923001234567');
  });

  it('a bare local number without the 0 still gets the country code', () => {
    expect(toWaNumber('3001234567')).toBe('923001234567');
  });

  it('a foreign number keeps its own country code', () => {
    expect(toWaNumber('+44 7911 123456')).toBe('447911123456');
  });

  it('nothing usable → empty, so the caller falls back to the contact picker', () => {
    expect(toWaNumber(undefined)).toBe('');
    expect(toWaNumber('')).toBe('');
    expect(toWaNumber('n/a')).toBe('');
  });

  it('honours a different country code', () => {
    expect(toWaNumber('0300-1234567', '971')).toBe('9713001234567');
  });
});

describe('waChatUrl', () => {
  it('opens the chat on a specific person when the number is known', () => {
    expect(waChatUrl('0300-1234567', 'Ledger')).toBe('https://wa.me/923001234567?text=Ledger');
  });

  it('falls back to WhatsApp own contact picker with no number', () => {
    expect(waChatUrl(undefined, 'Ledger')).toBe('https://wa.me/?text=Ledger');
    expect(waChatUrl('', 'Ledger')).toBe('https://wa.me/?text=Ledger');
  });

  it('encodes the caption, including the newline before the business name', () => {
    const url = waChatUrl('03001234567', 'Cash Receivable — July 2026\nUSAMA RAZA');
    expect(url).toContain('%0A');            // newline survived
    expect(url).toContain('Cash%20Receivable');
    expect(url).not.toContain(' ');
  });
});
