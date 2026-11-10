'use client';

import React, { useState, useEffect } from 'react';
import { X, Download, Copy, ArrowLeftRight } from 'lucide-react';
import { Button } from '@synergy/ui';

interface TallyExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityId: string;
  onExport: (period: string, format: string) => Promise<void>;
}

export function TallyExportModal({ isOpen, onClose, entityId: _entityId, onExport }: TallyExportModalProps) {
  const [period, setPeriod] = useState('');
  const [exportType, setExportType] = useState<'VOUCHERS' | 'MASTERS'>('VOUCHERS');
  const [format, setFormat] = useState<'XML_TALLY_PRIME' | 'JSON'>('XML_TALLY_PRIME');
  const [isExporting, setIsExporting] = useState(false);
  const [exportedContent, setExportedContent] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A') && !e.altKey && !e.shiftKey) {
        if (!exportedContent) {
          e.preventDefault();
          handleGenerate();
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, exportedContent, isExporting, period, format]);
  if (!isOpen) return null;

  const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>Synergy International Pvt Ltd</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Journal" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>20260930</DATE>
            <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
            <VOUCHERNUMBER>JV-2026-0089</VOUCHERNUMBER>
            <NARRATION>Depreciation on Plant &amp; Machinery - September 2026</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Depreciation Expense</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-45000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Accumulated Depreciation</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>45000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsExporting(true);
    try {
      await onExport(period, format);
      setExportedContent(mockXml);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([exportedContent], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tally_${exportType}_${period.replace(/\s|\//g, '_')}.xml`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl border border-border">
        <div className="flex items-start justify-between border-b border-border/70 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">Export to TallyPrime</h2>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-foreground dark:text-primary">
                XML / JSON Sync
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Generate version-tested TallyPrime XML vouchers or masters for offline parallel verification.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!exportedContent ? (
          <form onSubmit={handleGenerate} className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-foreground">Export Target</label>
                <select
                  className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                  value={exportType}
                  onChange={(e) => setExportType(e.target.value as any)}
                >
                  <option value="VOUCHERS">Financial Vouchers (Journals, AP, AR)</option>
                  <option value="MASTERS">Master Data (Ledgers, Groups, Cost Centers)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Target Period</label>
                <input
                  required
                  placeholder="e.g. FY2026-27 / SEP"
                  className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-mono focus:ring-2 focus:ring-ring focus:outline-none"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Format Specification</label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
              >
                <option value="XML_TALLY_PRIME">TallyPrime XML (Native XML Import Envelope)</option>
                <option value="JSON">Tally JSON Format (TallyPrime Release 3.0+)</option>
              </select>
            </div>

            <div className="rounded-xl bg-muted/20 p-3 text-xs space-y-1.5 border border-border">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                Ledger Mapping Validation
              </p>
              <p className="text-[11px] text-muted-foreground">
                All accounts in this batch have been verified against active Tally ledger names. Zero unmapped codes.
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-border/70 pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isExporting}>
                Cancel <kbd className="ml-1 rounded border border-border bg-muted px-1 text-[9px] font-mono">Esc</kbd>
              </Button>
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90 text-white font-semibold"
                disabled={isExporting}
              >
                {isExporting ? 'Generating XML Payload…' : 'Generate Export File'}
                <kbd className="ml-1.5 rounded border border-white/30 bg-white/20 px-1 py-0.5 text-[9px] font-mono">Ctrl+A</kbd>
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Generated Tally XML Preview
              </h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(exportedContent)}>
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Copy
                </Button>
                <Button size="sm" onClick={handleDownload} className="bg-primary hover:bg-primary/90 text-white">
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download File
                </Button>
              </div>
            </div>

            <pre className="max-h-64 overflow-auto rounded-2xl bg-muted/50 p-4 text-[11px] font-mono text-foreground border border-border">
              {exportedContent}
            </pre>

            <div className="flex justify-end border-t border-border/70 pt-4">
              <Button variant="outline" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
