import { useCallback, useState } from 'react';
import type jsPDF from 'jspdf';
import { Modal } from './Modal';
import { Icon } from './Icon';

/**
 * Direct-print helper with an honest post-print confirmation.
 *
 * The browser exposes NO way to know whether a printer is connected or whether
 * a job actually printed — window.print()/autoPrint() are fire-and-forget. So
 * instead of claiming "sent to printer", we open the native print dialog and
 * then ask the user how it went, offering Print Again and a Download PDF
 * fallback for the "no printer" case.
 */

export interface PrintJob {
  /** Builds a fresh jsPDF doc to print/download. */
  makeDoc: () => jsPDF;
  /** File name used if the user chooses Download PDF instead. */
  fileName: string;
}

/** Fire the native print dialog directly on a jsPDF doc (no download first). */
function openPrintDialog(doc: jsPDF) {
  doc.autoPrint();
  const url = doc.output('bloburl') as unknown as string;
  const w = window.open(url, '_blank');
  if (!w) window.location.href = url; // popup blocked → navigate to the PDF
}

export function usePrintConfirm() {
  const [job, setJob] = useState<PrintJob | null>(null);

  const print = useCallback((next: PrintJob) => {
    openPrintDialog(next.makeDoc());
    setJob(next); // show the "did it print?" prompt
  }, []);

  const close = useCallback(() => setJob(null), []);

  const dialog = (
    <PrintConfirmDialog
      job={job}
      onPrintAgain={() => job && openPrintDialog(job.makeDoc())}
      onDownload={() => { job?.makeDoc().save(job.fileName); setJob(null); }}
      onClose={close}
    />
  );

  return { print, dialog };
}

interface DialogProps {
  job: PrintJob | null;
  onPrintAgain: () => void;
  onDownload: () => void;
  onClose: () => void;
}

function PrintConfirmDialog({ job, onPrintAgain, onDownload, onClose }: DialogProps) {
  return (
    <Modal
      open={!!job}
      title="Print dialog opened"
      subtitle="Did the document print correctly?"
      width={440}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onDownload} title="Download the PDF instead">
            <Icon name="pdf" size={15} /> Download PDF
          </button>
          <button className="btn" onClick={onPrintAgain} title="Open the print dialog again">
            <Icon name="print" size={15} /> Print Again
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            <Icon name="check" size={15} /> Done
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        Your report was sent to the browser’s print dialog. If nothing appeared or no
        printer is connected, you can print again or download the PDF instead.
      </p>
    </Modal>
  );
}
