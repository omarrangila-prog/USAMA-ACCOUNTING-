/**
 * Sending a report PDF to someone on WhatsApp.
 *
 * IMPORTANT PLATFORM LIMIT: a WhatsApp link (wa.me / whatsapp://) can only
 * carry TEXT. There is no parameter that attaches a file — that is WhatsApp's
 * own restriction, not ours. The only way to hand a real PDF to WhatsApp from
 * a web app is the OS share sheet, navigator.share({ files }). So:
 *
 *   • Share sheet available (Android, iPhone, Chrome/Edge on Windows)
 *       → the PDF itself is shared. The user picks WhatsApp, then the contact.
 *         One tap, the file goes across. This is the good path.
 *   • Not available (the Electron .exe, Firefox, desktop Safari)
 *       → download the PDF and open the recipient's WhatsApp chat with the
 *         caption pre-filled, so the user only has to attach the file.
 */
import type jsPDF from 'jspdf';

/** Default dialling code used when a saved number has no country prefix. */
export const DEFAULT_COUNTRY_CODE = '92'; // Pakistan

/**
 * Turn a number as typed by a human ("0300-1234567", "+92 300 1234567",
 * "0092…") into the bare digits WhatsApp expects ("923001234567").
 * Returns '' when there is nothing usable.
 */
export function toWaNumber(raw: string | undefined, cc = DEFAULT_COUNTRY_CODE): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith(cc)) return d;
  if (d.startsWith('0')) return cc + d.slice(1);
  // A bare local number (no leading 0) still needs the country code.
  return d.length <= 10 ? cc + d : d;
}

/** wa.me chat link. Without a number WhatsApp shows its own contact picker. */
export function waChatUrl(phone: string | undefined, text: string): string {
  const n = toWaNumber(phone);
  const t = encodeURIComponent(text);
  return n ? `https://wa.me/${n}?text=${t}` : `https://wa.me/?text=${t}`;
}

/**
 * Can this device hand an actual PDF file to WhatsApp? Probes with a real File
 * because support for sharing *files* is narrower than navigator.share itself.
 */
export function canShareFiles(): boolean {
  try {
    if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
    const probe = new File(['probe'], 'probe.pdf', { type: 'application/pdf' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export interface WhatsAppJob {
  /** Builds the PDF to send. */
  makeDoc: () => jsPDF;
  /** File name the recipient sees, e.g. "bond-receivable-2026-07.pdf". */
  fileName: string;
  /** Caption / message text sent with the PDF. */
  message: string;
  /** Recipient, when known (a party). Only used by the fallback path. */
  toName?: string;
  toPhone?: string;
}

export type ShareOutcome =
  /** The PDF went to the OS share sheet and the share completed. */
  | 'shared'
  /** The user dismissed the share sheet. */
  | 'cancelled'
  /** No file sharing here — PDF downloaded and the WhatsApp chat opened. */
  | 'fallback';

/**
 * Share the report's PDF. MUST be called straight from a click handler: the
 * doc is built synchronously so the user-gesture is still live when
 * navigator.share() runs (Safari drops the gesture across an await).
 */
export async function shareReportPdf(job: WhatsAppJob): Promise<ShareOutcome> {
  const doc = job.makeDoc();

  if (canShareFiles()) {
    const blob = doc.output('blob') as Blob;
    const file = new File([blob], job.fileName, { type: 'application/pdf' });
    try {
      await navigator.share({ files: [file], text: job.message, title: job.message });
      return 'shared';
    } catch (err) {
      // AbortError = the user closed the sheet; anything else falls through to
      // the download + chat-link route so the send is still possible.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }

  doc.save(job.fileName);
  openWhatsAppChat(job.toPhone, job.message);
  return 'fallback';
}

/** Open a WhatsApp chat (app if installed, else web) with the caption filled. */
export function openWhatsAppChat(phone: string | undefined, text: string): void {
  const url = waChatUrl(phone, text);
  const w = window.open(url, '_blank', 'noopener');
  if (!w) window.location.href = url; // popup blocked → navigate instead
}
