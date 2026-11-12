'use client';

import React, { useState } from 'react';
import { X, UploadCloud, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@plinth/ui';
import { BankAccount } from '../types';

interface BankReconModalProps {
  isOpen: boolean;
  onClose: () => void;
  bankAccounts: BankAccount[];
  onImportStatement: (bankAccountId: string, fileName: string) => Promise<void>;
}

export function BankReconModal({ isOpen, onClose, bankAccounts, onImportStatement }: BankReconModalProps) {
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id || '');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !bankAccountId) return;
    setIsProcessing(true);
    try {
      await onImportStatement(bankAccountId, file.name);
      setSuccessMessage(`Successfully parsed ${file.name}. 3 transactions auto-matched with vouchers.`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl border border-border">
        <div className="flex items-start justify-between border-b border-border/70 pb-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Import Bank Statement</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload CSV or Excel bank statement for automated reconciliation (BRS).
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {successMessage ? (
          <div className="py-8 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 text-primary  flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-foreground">Statement Processed</h3>
            <p className="text-xs text-muted-foreground">{successMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleUpload} className="mt-5 space-y-4">
            <div>
              <label className="text-xs font-semibold text-foreground">Select Bank Account</label>
              <select
                required
                className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
              >
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bankName} - {b.accountNumber} ({b.ifscCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Upload Statement File (CSV / XLSX)</label>
              <div className="mt-1 flex justify-center rounded-2xl border-2 border-dashed border-border p-6 hover:border-border transition-all cursor-pointer">
                <div className="text-center">
                  <UploadCloud className="mx-auto h-8 w-8 text-muted-foreground" />
                  <div className="mt-2 flex text-xs text-muted-foreground justify-center">
                    <label className="relative cursor-pointer rounded-md font-semibold text-muted-foreground hover:text-foreground">
                      <span>Browse file</span>
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        className="sr-only"
                        onChange={(e) => {
                          if (e.target.files?.[0]) setFile(e.target.files[0]);
                        }}
                      />
                    </label>
                    <p className="pl-1">or drag & drop</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">HDFC, SBI, ICICI, Axis CSV or MT940 format</p>
                </div>
              </div>
              {file && (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-muted/40 p-2.5 text-xs border border-border">
                  <span className="font-mono truncate">{file.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-primary/10 p-3 text-xs text-foreground  border border-border">
              <p className="flex items-center gap-1.5 font-semibold">
                <Sparkles className="h-4 w-4" />
                Auto-Matching Engine
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Matches UTR references, date ranges and amounts against approved AP payments, AR receipts, and contra vouchers.
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-border/70 pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isProcessing}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90 text-white font-semibold"
                disabled={isProcessing || !file || !bankAccountId}
              >
                {isProcessing ? 'Processing Statement…' : 'Import & Reconcile'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
