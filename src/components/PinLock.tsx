import { useEffect, useRef, useState } from 'react';
import './pinlock.css';

/** The 4-digit access PIN. */
const PIN = '4444';
const SESSION_KEY = 'bond.unlocked';

/** Whether the app is already unlocked for this browser session. */
export function isUnlocked(): boolean {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}

/**
 * 4-digit PIN gate shown before the app. On the correct PIN it unlocks for the
 * rest of the browser session (sessionStorage), so a refresh re-locks only when
 * the tab/window is closed.
 */
export function PinLock({ onUnlock }: { onUnlock: () => void }) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { inputs.current[0]?.focus(); }, []);

  const submit = (code: string) => {
    if (code === PIN) {
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
      onUnlock();
    } else {
      setError(true);
      setDigits(['', '', '', '']);
      setTimeout(() => { setError(false); inputs.current[0]?.focus(); }, 600);
    }
  };

  const setAt = (i: number, val: string) => {
    const d = val.replace(/\D/g, '').slice(-1); // keep last typed digit only
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < 3) inputs.current[i + 1]?.focus();
    if (next.every((x) => x !== '')) submit(next.join(''));
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === 'Enter' && digits.every((x) => x !== '')) submit(digits.join(''));
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (text.length === 4) { e.preventDefault(); setDigits(text.split('')); submit(text); }
  };

  return (
    <div className="pinlock">
      <div className="pinlock-card">
        <div className="brand-mark" style={{ width: 52, height: 52, fontSize: 24 }}>B</div>
        <h2 className="pinlock-title">Enter PIN</h2>
        <p className="pinlock-sub">Enter your 4-digit PIN to continue</p>
        <div className={`pinlock-boxes${error ? ' shake' : ''}`} onPaste={onPaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (inputs.current[i] = el)}
              className={`pinlock-box${error ? ' err' : ''}`}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              aria-label={`PIN digit ${i + 1}`}
            />
          ))}
        </div>
        {error && <div className="pinlock-error">Incorrect PIN — try again</div>}
      </div>
    </div>
  );
}
