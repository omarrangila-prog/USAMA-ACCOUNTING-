import { useEffect, useRef, useState } from 'react';
import type jsPDF from 'jspdf';
import { Icon } from './Icon';
import './pdfpreview.css';

interface Props {
  /** Factory that builds the jsPDF doc on demand (so it regenerates when opened). */
  makeDoc: (() => jsPDF) | null;
  title: string;
  fileName: string;
  onClose: () => void;
}

/**
 * In-app PDF preview. Renders the jsPDF in an iframe (the browser's built-in
 * viewer provides zoom + page navigation + scroll). Adds Download, Print and
 * Close. Nothing downloads until the user chooses to.
 */
export function PdfPreview({ makeDoc, title, fileName, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const docRef = useRef<jsPDF | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!makeDoc) { setUrl(null); return; }
    const doc = makeDoc();
    docRef.current = doc;
    const blobUrl = doc.output('bloburl') as unknown as string;
    setUrl(blobUrl);
    return () => { try { URL.revokeObjectURL(blobUrl); } catch { /* noop */ } };
  }, [makeDoc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!makeDoc) return null;

  const download = () => docRef.current?.save(fileName);
  const print = () => {
    // Print the PDF via its iframe (native print dialog).
    try {
      iframeRef.current?.contentWindow?.focus();
      iframeRef.current?.contentWindow?.print();
    } catch {
      // Fallback: open print window from the doc.
      docRef.current?.autoPrint();
      window.open(url ?? '', '_blank');
    }
  };

  return (
    <div className="pdfpv-backdrop no-print" onMouseDown={onClose}>
      <div className="pdfpv glass" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="pdfpv-head">
          <div className="row" style={{ gap: 8 }}>
            <Icon name="pdf" size={18} />
            <strong>{title}</strong>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm" onClick={print} title="Print">
              <Icon name="print" size={15} /> Print
            </button>
            <button className="btn btn-sm btn-primary" onClick={download} title="Download PDF">
              <Icon name="pdf" size={15} /> Download
            </button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>
        <div className="pdfpv-body">
          {url ? (
            <iframe ref={iframeRef} src={url} title={title} className="pdfpv-frame" />
          ) : (
            <div className="empty">Generating preview…</div>
          )}
        </div>
        <div className="pdfpv-foot faint">
          Zoom &amp; page controls are in the viewer toolbar above the document.
        </div>
      </div>
    </div>
  );
}
