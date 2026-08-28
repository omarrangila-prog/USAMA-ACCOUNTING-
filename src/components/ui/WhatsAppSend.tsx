import { useCallback, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { useData } from '@/store/dataStore';
import { toast } from '@/store/toast';
import {
  canShareFiles, shareReportPdf, openWhatsAppChat, toWaNumber,
  type WhatsAppJob,
} from '@/lib/whatsappShare';

/**
 * "Send on WhatsApp" for any report PDF.
 *
 * On a phone (and on Chrome/Edge for Windows) the PDF goes straight into the
 * OS share sheet — tap WhatsApp, pick the contact, sent. Nothing to fill in,
 * so no dialog is shown at all.
 *
 * Where the browser can't share files (the desktop .exe, Firefox), WhatsApp
 * itself offers no way to attach a file from a link, so this opens a small
 * dialog: pick who it's going to, then the PDF downloads and their chat opens
 * with the caption ready — the user attaches the downloaded file.
 *
 * Mirrors usePrintConfirm(): returns { send, dialog }.
 */
export function useWhatsAppSend() {
  const [job, setJob] = useState<WhatsAppJob | null>(null);

  const send = useCallback((next: WhatsAppJob) => {
    if (canShareFiles()) {
      // Straight to the share sheet — keep the click gesture alive, no await.
      shareReportPdf(next)
        .then((r) => { if (r === 'shared') toast.success('Sent to WhatsApp'); })
        .catch(() => toast.error('Could not open the share sheet'));
      return;
    }
    setJob(next); // this device needs the pick-a-contact + attach route
  }, []);

  const close = useCallback(() => setJob(null), []);

  return {
    send,
    // Mounted only while sending: the dialog reads the party list from the
    // store, and there's no reason to subscribe to it the rest of the time.
    dialog: job ? <WhatsAppSendDialog job={job} onClose={close} /> : null,
  };
}

interface DialogProps {
  job: WhatsAppJob;
  onClose: () => void;
}

function WhatsAppSendDialog({ job, onClose }: DialogProps) {
  const { dataset } = useData();
  const parties = dataset().parties;

  // Parties we can message directly — a saved phone number is what makes
  // "send it to Najeeb" a single click instead of hunting in WhatsApp.
  const contacts = useMemo(
    () => parties
      .filter((p) => toWaNumber(p.phone))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [parties]
  );

  // '' = let WhatsApp show its own contact picker. 'other' = typed number.
  const [pick, setPick] = useState('');
  const [manual, setManual] = useState('');

  const chosen = contacts.find((c) => c.id === pick);
  const phone = pick === 'other' ? manual : chosen?.phone;
  const ready = pick !== 'other' || toWaNumber(manual).length > 0;

  const go = () => {
    job.makeDoc().save(job.fileName);
    openWhatsAppChat(phone, job.message);
    toast.info('PDF downloaded — attach it in WhatsApp');
    onClose();
  };

  return (
    <Modal
      open
      title="Send on WhatsApp"
      subtitle={job.message}
      width={460}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={go} disabled={!ready}>
            <Icon name="whatsapp" size={15} /> Download &amp; open WhatsApp
          </button>
        </>
      }
    >
      <div className="field">
        <label>Send to</label>
        <select className="select" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Choose the contact in WhatsApp</option>
          {contacts.length > 0 && (
            <optgroup label="Saved party numbers">
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>
              ))}
            </optgroup>
          )}
          <option value="other">Another number…</option>
        </select>
      </div>

      {pick === 'other' && (
        <div className="field" style={{ marginTop: 10 }}>
          <label>WhatsApp number</label>
          <input
            className="input"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="0300 1234567"
            inputMode="tel"
            autoFocus
          />
        </div>
      )}

      <p className="muted" style={{ fontSize: 12.5, marginBottom: 0, marginTop: 12 }}>
        WhatsApp doesn't let a link carry a file, and this app can't reach the
        Windows share sheet. So the PDF downloads and{' '}
        {chosen ? <strong>{chosen.name}'s</strong> : 'the'} chat opens with the
        message ready — attach the downloaded file there. On your phone the same
        button sends the PDF in one step.
      </p>
    </Modal>
  );
}
