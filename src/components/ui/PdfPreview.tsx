import { useEffect, useRef, useState } from 'react';
import type jsPDF from 'jspdf';
import { Icon } from './Icon';
import { usePrintConfirm } from './PrintConfirm';
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
/** Zoom steps offered in the preview toolbar (percent; 0 = fit to page width). */
const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300];

export function PdfPreview({ makeDoc, title, fileName, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  // null = "Fit" (let the viewer fit the page); a number = explicit zoom %.
  const [zoom, setZoom] = useState<number | null>(null);
  const docRef = useRef<jsPDF | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const printConfirm = usePrintConfirm();

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

  // Mobile browsers (iOS Safari, most Android) do NOT render a PDF inside an
  // <iframe src="blob:…"> — it shows a blank box. Detect small / touch screens
  // and offer an "Open PDF" action that opens the blob in a new tab instead,
  // which mobile browsers DO render.
  const isMobile =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(max-width: 640px)').matches ||
      window.matchMedia?.('(pointer: coarse)').matches);

  const download = () => docRef.current?.save(fileName);
  const openInTab = () => { if (url) { const w = window.open(url, '_blank'); if (!w) window.location.href = url; } };

  // Zoom: the built-in PDF viewer honours a "#zoom=" fragment. Changing the
  // fragment (and remounting the frame via its key) re-renders at that zoom.
  // "Fit" uses page-width so the whole report is visible.
  const zoomSrc = url ? `${url}#toolbar=1&view=FitH&zoom=${zoom ?? 'page-width'}` : '';
  const stepZoom = (dir: 1 | -1) => {
    setZoom((z) => {
      const cur = z ?? 100;
      const idx = ZOOM_STEPS.findIndex((s) => s >= cur);
      const at = idx < 0 ? ZOOM_STEPS.length - 1 : idx;
      const next = at + dir;
      if (next < 0) return ZOOM_STEPS[0];
      if (next >= ZOOM_STEPS.length) return ZOOM_STEPS[ZOOM_STEPS.length - 1];
      return ZOOM_STEPS[next];
    });
  };

  /**
   * Print straight from the preview — no download required. Routes through the
   * shared print helper, which opens the native print dialog on a jsPDF doc
   * (matching the PDF exactly: page size, margins, header/footer, page numbers)
   * and then shows the honest "did it print?" confirmation with Print Again /
   * Download PDF fallbacks.
   */
  const print = () => {
    if (!makeDoc) return;
    printConfirm.print({ makeDoc, fileName });
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
            {!isMobile && (
              <div className="pdfpv-zoom" role="group" aria-label="Zoom">
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => stepZoom(-1)} title="Zoom out" aria-label="Zoom out">−</button>
                <span className="zoom-level">{zoom ? `${zoom}%` : 'Fit'}</span>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => stepZoom(1)} title="Zoom in" aria-label="Zoom in">+</button>
                {zoom !== null && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setZoom(null)} title="Fit to page width">
                    Reset
                  </button>
                )}
              </div>
            )}
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
          {!url ? (
            <div className="empty">Generating preview…</div>
          ) : isMobile ? (
            // On mobile the in-frame PDF viewer is unreliable — offer clear
            // actions that DO work on phones.
            <div className="pdfpv-mobile">
              <Icon name="pdf" size={40} />
              <div className="pdfpv-mobile-title">{title}</div>
              <div className="faint" style={{ fontSize: 13, textAlign: 'center', maxWidth: 260 }}>
                Your report is ready. Open it in a new tab to view, or download it.
              </div>
              <button className="btn btn-primary" onClick={openInTab}>
                <Icon name="search" size={16} /> Open PDF
              </button>
              <button className="btn" onClick={download}>
                <Icon name="pdf" size={16} /> Download PDF
              </button>
            </div>
          ) : (
            /* `key` includes the zoom so changing it remounts the frame and
               the viewer re-renders at the new zoom level. */
            <iframe key={zoom ?? 'fit'} ref={iframeRef} src={zoomSrc} title={title} className="pdfpv-frame" />
          )}
        </div>
        <div className="pdfpv-foot faint">
          Use the zoom controls above (or the viewer's own toolbar) to inspect the
          report · Esc closes
        </div>
      </div>
      {printConfirm.dialog}
    </div>
  );
}
