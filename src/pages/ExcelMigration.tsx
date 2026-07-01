import { useRef, useState } from 'react';
import { useData } from '@/store/dataStore';
import { Icon } from '@/components/ui/Icon';
import { Combo } from '@/components/ui/Combo';
import { ConfirmDialog } from '@/components/ui/Modal';
import {
  readWorkbook, buildExcelMigration, type MigrationBundle, type MigrationPreview,
} from '@/lib/excelMigration';
import { formatMoney, formatNumber, MONTHS } from '@/lib/utils';
import { toast } from '@/store/toast';

/**
 * Settings-only, one-time "Import Old Excel Data" migration for the client's
 * real workbook (BALANCE SHEET / REC / PAY / FILE / Sheet1). Shows a full
 * preview and requires an explicit Confirm before writing to Firestore.
 */
export function ExcelMigration() {
  const store = useData();
  const cur = store.settings.currency;
  const fileRef = useRef<HTMLInputElement>(null);

  const now = new Date();
  const [asOf, setAsOf] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [bundle, setBundle] = useState<MigrationBundle | null>(null);
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [fileName, setFileName] = useState('');

  const alreadyImported = !!store.opening;

  const onFile = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    try {
      const wb = await readWorkbook(file);
      const b = buildExcelMigration(wb, asOf);
      setBundle(b);
      setPreview(b.preview);
      const anything = b.preview.totals.bondCount + b.preview.totals.partyCount + b.preview.files.length;
      if (!anything) toast.error('Nothing recognizable found. Check the sheet names.');
      else toast.success('File read — review the preview below.');
    } catch (e) {
      console.error(e);
      toast.error('Could not read that Excel file.');
    }
  };

  const reparse = (period: { month: number; year: number }) => {
    setAsOf(period);
    if (bundle) {
      // Re-tag the opening period without re-reading the file.
      const updated: MigrationBundle = {
        ...bundle,
        opening: { ...bundle.opening, asOf: period },
        preview: { ...bundle.preview, asOf: period },
      };
      setBundle(updated);
      setPreview(updated.preview);
    }
  };

  const doImport = async () => {
    setConfirm(false);
    if (!bundle) return;
    const ok = await store.importOpeningMigration({
      parties: bundle.parties,
      bondTypes: bundle.bondTypes,
      files: bundle.files,
      opening: bundle.opening,
    });
    if (ok) { setBundle(null); setPreview(null); if (fileRef.current) fileRef.current.value = ''; }
  };

  const yearOptions = Array.from({ length: 7 }, (_, i) => now.getFullYear() - 4 + i)
    .map((y) => ({ id: String(y), label: String(y) }));

  return (
    <div className="card migration-card">
      <div className="section-title">
        <Icon name="excel" size={16} /> Import Old Excel Data
        <span className="badge badge-orange">One-time migration</span>
      </div>

      {alreadyImported ? (
        <div className="migrated-note">
          <Icon name="check" size={16} className="pos" />
          <div className="col" style={{ flex: 1 }}>
            <strong>Old data already imported</strong>
            <span className="faint" style={{ fontSize: 12.5 }}>
              Opening balances are set as of {MONTHS[store.opening!.asOf.month - 1]} {store.opening!.asOf.year}.
              Future work happens inside the software only.
            </span>
          </div>
          <button className="btn btn-sm btn-danger" onClick={() => store.clearOpeningMigration()}>
            <Icon name="refresh" size={14} /> Reset & Re-import
          </button>
        </div>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Reads your workbook's <strong>BALANCE SHEET</strong> (bond stock, avg rate, profit),
            <strong> REC</strong> (receivables), <strong>PAY</strong> (payables) and <strong>FILE</strong> (bank accounts),
            and sets them as opening balances. Preview first, then confirm.
          </p>

          <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <div className="field" style={{ width: 150 }}>
              <label>Opening applies from</label>
              <select className="select" value={asOf.month} onChange={(e) => reparse({ ...asOf, month: Number(e.target.value) })}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="field" style={{ width: 110 }}>
              <label>Year</label>
              <Combo value={String(asOf.year)} options={yearOptions} onChange={(v) => reparse({ ...asOf, year: Number(v) })} />
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
              <Icon name="excel" size={16} /> {fileName ? 'Choose Different File' : 'Choose Excel File'}
            </button>
            {fileName && <span className="badge badge-gray">{fileName}</span>}
          </div>

          {preview && (
            <div className="migration-preview animate-in">
              <div className="mig-totals">
                <MigStat label="Bond Types" value={String(preview.totals.bondCount)} icon="stock" />
                <MigStat label="Stock Value" value={formatMoney(preview.totals.stockValue, cur)} icon="stock" />
                <MigStat label="Receivable" value={formatMoney(preview.totals.receivable, cur)} icon="receivable" accent="pos" />
                <MigStat label="Payable" value={formatMoney(preview.totals.payable, cur)} icon="payable" accent="neg" />
                <MigStat label="Bank / Files" value={formatMoney(preview.totals.fileBalance, cur)} icon="wallet" />
                <MigStat label="Imported Profit" value={formatMoney(preview.totals.profit, cur)} icon="trial" accent={preview.totals.profit >= 0 ? 'pos' : 'neg'} />
              </div>

              <div className="faint" style={{ fontSize: 12, margin: '6px 0 10px' }}>
                Sheets found: {preview.sheetsFound.join(', ')}
              </div>

              {/* Opening stock table */}
              {preview.bonds.length > 0 && (
                <PreviewTable
                  title="Opening Stock (from BALANCE SHEET)"
                  head={['Bond', 'Purchased', 'Sold', 'Closing Qty', 'Avg Cost', 'Stock Value', 'Profit']}
                  rows={preview.bonds.map((b) => [
                    b.name, formatNumber(b.purchaseQty), formatNumber(b.saleQty),
                    formatNumber(b.closingQty), formatNumber(b.avgCost),
                    formatMoney(b.stockValue, cur), formatMoney(b.profit, cur),
                  ])}
                  numeric={[1, 2, 3, 4, 5, 6]}
                />
              )}

              <div className="grid-2" style={{ marginTop: 12 }}>
                {preview.receivables.length > 0 && (
                  <PreviewTable title={`Receivables (REC) · ${preview.receivables.length}`}
                    head={['Party', 'Amount']}
                    rows={preview.receivables.slice(0, 50).map((r) => [r.name, formatMoney(Math.abs(r.amount), cur)])}
                    numeric={[1]} />
                )}
                {preview.payables.length > 0 && (
                  <PreviewTable title={`Payables (PAY) · ${preview.payables.length}`}
                    head={['Party', 'Amount']}
                    rows={preview.payables.slice(0, 50).map((r) => [r.name, formatMoney(Math.abs(r.amount), cur)])}
                    numeric={[1]} />
                )}
              </div>

              {preview.files.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <PreviewTable title={`Bank / File Accounts (FILE) · ${preview.files.length}`}
                    head={['Account', 'Balance']}
                    rows={preview.files.map((r) => [r.name, formatMoney(r.amount, cur)])}
                    numeric={[1]} />
                </div>
              )}

              {preview.warnings.length > 0 && (
                <div className="warn-box" style={{ marginTop: 12 }}>
                  <Icon name="warning" size={14} />
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {preview.warnings.map((w, i) => <li key={i} style={{ fontSize: 12 }}>{w}</li>)}
                  </ul>
                </div>
              )}

              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn btn-green" onClick={() => setConfirm(true)}>
                  <Icon name="check" size={16} /> Confirm Import
                </button>
                <button className="btn" onClick={() => { setBundle(null); setPreview(null); }}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirm}
        title="Confirm one-time import?"
        message={`This saves the imported figures as opening balances (as of ${MONTHS[asOf.month - 1]} ${asOf.year}) and marks them source: old_excel_migration. It runs only once. Continue?`}
        confirmLabel="Import Now"
        onConfirm={doImport}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}

function MigStat({ label, value, icon, accent }: { label: string; value: string; icon: any; accent?: 'pos' | 'neg' }) {
  return (
    <div className="mig-stat">
      <span className="mig-stat-icon"><Icon name={icon} size={15} /></span>
      <div className="col">
        <span className={`mono ${accent ?? ''}`} style={{ fontSize: 15, fontWeight: 700 }}>{value}</span>
        <span className="faint" style={{ fontSize: 11.5 }}>{label}</span>
      </div>
    </div>
  );
}

function PreviewTable({ title, head, rows, numeric = [] }: {
  title: string; head: string[]; rows: (string | number)[][]; numeric?: number[];
}) {
  return (
    <div>
      <div className="faint" style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>{title}</div>
      <div className="table-wrap mig-table">
        <table className="grid">
          <thead><tr>{head.map((h, i) => <th key={h} className={numeric.includes(i) ? 'num' : ''}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci} className={numeric.includes(ci) ? 'num mono' : ''}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
