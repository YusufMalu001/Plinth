'use client';

import React, { useState } from 'react';
import { LossEventDto } from '@plinth/types';
import { Button } from '@plinth/ui';
import { X, UploadCloud, FileText, Warehouse, Calendar, AlertCircle } from 'lucide-react';
import { EvidenceAttachmentField } from './EvidenceAttachmentField';

export interface ReceivedChallanData {
  id: string;
  challanNumber: string;
  lossEventId?: string;
  lossNumber?: string;
  itemName: string;
  quantity: number;
  uom: string;
  receivingLocationId?: string;
  receivingLocationName?: string;
  receivedDate: string;
  vendorOrOrigin?: string;
  notes?: string;
  documentUrls: string[];
  createdAt: string;
}

export interface UploadReceivedChallanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ReceivedChallanData) => Promise<void> | void;
  lossEvents?: LossEventDto[];
  locations?: Array<{ id: string; name: string; code: string }>;
}

export function UploadReceivedChallanModal({
  isOpen,
  onClose,
  onSubmit,
  lossEvents = [],
  locations = [],
}: UploadReceivedChallanModalProps) {
  const [challanNumber, setChallanNumber] = useState('');
  const [selectedLossEventId, setSelectedLossEventId] = useState('');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [uom, setUom] = useState('Units');
  const [receivingLocationId, setReceivingLocationId] = useState(locations[0]?.id || '');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [vendorOrOrigin, setVendorOrOrigin] = useState('');
  const [notes, setNotes] = useState('');
  const [documentUrls, setDocumentUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleLossEventSelect = (eventId: string) => {
    setSelectedLossEventId(eventId);
    if (!eventId) return;
    const evt = lossEvents.find((e) => e.id === eventId);
    if (evt) {
      setItemName(evt.materialName || evt.productName || '');
      setQuantity(String(evt.quantity));
      setUom(evt.uomCode || 'Units');
      if (evt.locationId) setReceivingLocationId(evt.locationId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!challanNumber.trim()) {
      setError('Physical Challan / Document Number is required.');
      return;
    }
    if (!itemName.trim()) {
      setError('Item / Material Name is required.');
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      setError('Quantity received must be greater than zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedEvt = lossEvents.find((e) => e.id === selectedLossEventId);
      const loc = locations.find((l) => l.id === receivingLocationId);

      const record: ReceivedChallanData = {
        id: `REC-CHAL-${Date.now()}`,
        challanNumber: challanNumber.trim(),
        lossEventId: selectedLossEventId || undefined,
        lossNumber: selectedEvt?.lossNumber,
        itemName: itemName.trim(),
        quantity: Number(quantity),
        uom: uom.trim() || 'Units',
        receivingLocationId: receivingLocationId || undefined,
        receivingLocationName: loc ? `${loc.name} (${loc.code})` : undefined,
        receivedDate,
        vendorOrOrigin: vendorOrOrigin.trim() || undefined,
        notes: notes.trim() || undefined,
        documentUrls,
        createdAt: new Date().toISOString(),
      };

      await onSubmit(record);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to record received challan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-card border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Upload &amp; Record Received Challan
              </h3>
              <p className="text-xs text-muted-foreground">
                Attach physical replacement delivery challan, vendor slip, or replenishment receipt.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Physical Challan Number & Received Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Physical Challan / Document # *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. VEND-CHAL-8941"
                value={challanNumber}
                onChange={(e) => setChallanNumber(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono font-bold bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                Date Received *
              </label>
              <input
                type="date"
                required
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Linked Loss Event (Optional) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Link to Loss Event (Optional)
            </label>
            <select
              value={selectedLossEventId}
              onChange={(e) => handleLossEventSelect(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
            >
              <option value="">None / Independent Inward Challan</option>
              {lossEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.lossNumber} — {ev.materialName || ev.productName} ({ev.quantity} {ev.uomCode || ''}) · [{ev.status}]
                </option>
              ))}
            </select>
          </div>

          {/* Item & Quantity Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Item / Material Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Stainless Steel Plate 2mm"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Qty Received *
              </label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  step="any"
                  min="0.000001"
                  required
                  placeholder="0.00"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs font-mono font-bold bg-background border border-border rounded-lg text-foreground"
                />
                <input
                  type="text"
                  placeholder="UOM"
                  value={uom}
                  onChange={(e) => setUom(e.target.value)}
                  className="w-16 h-9 px-2 text-xs bg-background border border-border rounded-lg text-foreground text-center"
                />
              </div>
            </div>
          </div>

          {/* Receiving Location & Vendor / Origin */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5 text-primary" />
                Receiving Storage Location
              </label>
              <select
                value={receivingLocationId}
                onChange={(e) => setReceivingLocationId(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground"
              >
                <option value="">Select location...</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Supplier / Carrier / Origin
              </label>
              <input
                type="text"
                placeholder="e.g. Apex Steel Ltd / BlueDart Express"
                value={vendorOrOrigin}
                onChange={(e) => setVendorOrOrigin(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground"
              />
            </div>
          </div>

          {/* Direct File Attachment */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-primary" />
              Upload Physical Challan Document / Photos
            </label>
            <EvidenceAttachmentField
              evidenceUrls={documentUrls}
              onChange={setDocumentUrls}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Inspection Notes / Verification Remarks
            </label>
            <textarea
              rows={2}
              placeholder="Physical condition on receipt, seal verified, undamaged packaging..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 text-xs bg-background border border-border rounded-lg text-foreground"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-9 px-4 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-9 px-5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            >
              {isSubmitting ? 'Saving...' : 'Record Received Challan'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
