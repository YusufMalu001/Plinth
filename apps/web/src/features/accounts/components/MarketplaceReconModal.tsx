'use client';

import React, { useState } from 'react';
import { X, UploadCloud } from 'lucide-react';
import { Button } from '@plinth/ui';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  entityId: string;
  onUploadBatch: (batchData: any) => Promise<void>;
}

export function MarketplaceReconModal({ isOpen, onClose, entityId, onUploadBatch }: Props) {
  const [channel, setChannel] = useState<'AMAZON' | 'E_TRADE'>('AMAZON');
  const [externalBatchId, setExternalBatchId] = useState('');
  const [settlementDate, setSettlementDate] = useState('');
  const [grossAmount, setGrossAmount] = useState('');
  const [feesAmount, setFeesAmount] = useState('0.00');
  const [gstTcsAmount, setGstTcsAmount] = useState('0.00');
  const [incomeTdsAmount, setIncomeTdsAmount] = useState('0.00');
  const [netPayoutAmount, setNetPayoutAmount] = useState('');
  const [busy, setBusy] = useState(false);
  if (!isOpen) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onUploadBatch({ entityId, channel, externalBatchId, settlementDate, grossAmount, feesAmount, gstTcsAmount, incomeTdsAmount, netPayoutAmount });
      onClose();
    } finally { setBusy(false); }
  };
  const inputClass = 'mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-xs';

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
    <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
      <div className="flex items-start justify-between border-b border-border/70 pb-4">
        <div><h2 className="text-xl font-bold">Record marketplace settlement</h2><p className="mt-1 text-xs text-muted-foreground">Enter totals from the settlement report. Match the bank reference before posting.</p></div>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
      </div>
      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-semibold">Channel<select className={inputClass} value={channel} onChange={e=>setChannel(e.target.value as 'AMAZON'|'E_TRADE')}><option value="AMAZON">Amazon</option><option value="E_TRADE">E-Trade</option></select></label>
        <label className="text-xs font-semibold">Settlement batch ID<input required className={inputClass} value={externalBatchId} onChange={e=>setExternalBatchId(e.target.value)} maxLength={120} /></label>
        <label className="text-xs font-semibold">Settlement date<input required type="date" className={inputClass} value={settlementDate} onChange={e=>setSettlementDate(e.target.value)} /></label>
        <label className="text-xs font-semibold">Gross proceeds<input required type="number" min="0.01" step="0.01" className={inputClass} value={grossAmount} onChange={e=>setGrossAmount(e.target.value)} /></label>
        <label className="text-xs font-semibold">Marketplace fees<input required type="number" min="0" step="0.01" className={inputClass} value={feesAmount} onChange={e=>setFeesAmount(e.target.value)} /></label>
        <label className="text-xs font-semibold">GST TCS<input required type="number" min="0" step="0.01" className={inputClass} value={gstTcsAmount} onChange={e=>setGstTcsAmount(e.target.value)} /></label>
        <label className="text-xs font-semibold">Income tax TDS<input required type="number" min="0" step="0.01" className={inputClass} value={incomeTdsAmount} onChange={e=>setIncomeTdsAmount(e.target.value)} /></label>
        <label className="text-xs font-semibold">Net bank payout<input required type="number" min="0" step="0.01" className={inputClass} value={netPayoutAmount} onChange={e=>setNetPayoutAmount(e.target.value)} /></label>
        <div className="sm:col-span-2 flex justify-end gap-2 border-t border-border/70 pt-4"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy} className="gap-2"><UploadCloud className="h-4 w-4" />Save draft</Button></div>
      </form>
    </div>
  </div>;
}
