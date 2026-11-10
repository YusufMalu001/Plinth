'use client';

import React, { useState } from 'react';
import { LossEventDto } from '@synergy/types';
import { Button } from '@synergy/ui';
import { X, RefreshCw, Warehouse, Building2, AlertCircle, FileText } from 'lucide-react';
import { EvidenceAttachmentField } from './EvidenceAttachmentField';

export interface IssueReplacementChallanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    lossEventId: string;
    dispatchLocationId: string;
    targetDepartmentId?: string;
    replacementQuantity?: number;
    rejectedQuantity?: number;
    rejectionReason?: string;
    notes?: string;
    documentUrls?: string[];
  }) => Promise<void>;
  lossEvents?: LossEventDto[];
  preselectedEvent?: LossEventDto;
  locations?: Array<{ id: string; name: string; code: string }>;
  departments?: Array<{ id: string; name: string; code: string }>;
}

export function IssueReplacementChallanModal({
  isOpen,
  onClose,
  onSubmit,
  lossEvents = [],
  preselectedEvent,
  locations = [],
  departments = [],
}: IssueReplacementChallanModalProps) {
  const initialEvent = preselectedEvent || lossEvents.find((e) => ['APPROVED', 'POSTED', 'REPORTED', 'REVIEWED'].includes(e.status)) || lossEvents[0];
  const [selectedEventId, setSelectedEventId] = useState(initialEvent?.id || '');
  const currentEvent = lossEvents.find((e) => e.id === selectedEventId) || initialEvent;

  const [dispatchLocationId, setDispatchLocationId] = useState(
    currentEvent?.locationId || locations[0]?.id || ''
  );
  const [targetDepartmentId, setTargetDepartmentId] = useState(
    currentEvent?.departmentId || ''
  );
  const [notes, setNotes] = useState('');
  const [documentUrls, setDocumentUrls] = useState<string[]>([]);
  const totalProposalQty = Number(currentEvent?.quantity || 0);
  const [replacementQty, setReplacementQty] = useState(String(currentEvent?.quantity || ''));
  const [rejectedQty, setRejectedQty] = useState('0');
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleEventChange = (eventId: string) => {
    setSelectedEventId(eventId);
    const ev = lossEvents.find((e) => e.id === eventId);
    if (ev) {
      if (ev.locationId) setDispatchLocationId(ev.locationId);
      if (ev.departmentId) setTargetDepartmentId(ev.departmentId);
      setReplacementQty(String(ev.quantity || ''));
      setRejectedQty('0');
      setRejectionReason('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedEventId) {
      setError('Please select a Loss Event to issue replenishment for.');
      return;
    }
    if (!dispatchLocationId) {
      setError('Please select a dispatch warehouse location.');
      return;
    }

    const repNum = parseFloat(replacementQty);
    const rejNum = parseFloat(rejectedQty || '0');

    if (isNaN(repNum) || repNum < 0) {
      setError('Replacement quantity must be non-negative.');
      return;
    }

    if (repNum + rejNum > totalProposalQty + 0.0001) {
      setError(`Sum of replacement (${repNum}) and rejected returned (${rejNum}) exceeds proposal quantity (${totalProposalQty}).`);
      return;
    }

    if (rejNum > 0 && !rejectionReason.trim()) {
      setError('Rejection reason is required when returning material to department.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        lossEventId: selectedEventId,
        dispatchLocationId,
        targetDepartmentId: targetDepartmentId || undefined,
        replacementQuantity: repNum,
        rejectedQuantity: rejNum,
        rejectionReason: rejNum > 0 ? rejectionReason.trim() : undefined,
        notes: notes.trim() || undefined,
        documentUrls,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to issue replacement challan.');
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
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Issue Replacement Delivery Challan
              </h3>
              <p className="text-xs text-muted-foreground">
                Authorize physical replenishment dispatch to replace scrapped or damaged inventory.
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

          {/* Loss Event Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Select Loss Event to Replenish *
            </label>
            <select
              value={selectedEventId}
              onChange={(e) => handleEventChange(e.target.value)}
              required
              className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Select loss event...</option>
              {lossEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.lossNumber} — {ev.materialName || ev.productName} ({ev.quantity} {ev.uomCode || ''}) · [{ev.status}]
                </option>
              ))}
            </select>
          </div>

          {/* Selected Event Details Banner */}
          {currentEvent && (
            <>
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-violet-500/5 border border-violet-500/20 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">Material / Item</span>
                <span className="font-semibold text-foreground">
                  {currentEvent.materialName || currentEvent.productName || 'Raw Material'}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground block">
                  {currentEvent.itemCode || 'Code: —'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Reported Proposal Qty</span>
                <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                  {currentEvent.quantity} {currentEvent.uomCode || 'units'}
                </span>
              </div>
            </div>

            {/* Split Quantity Allocation */}
            <div className="mt-3 p-3 rounded-xl bg-muted/30 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Quantity Allocation</span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  Total: {currentEvent.quantity} {currentEvent.uomCode || 'units'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 block mb-1">
                    Accept &amp; Replace (From Store) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={totalProposalQty}
                    step="any"
                    value={replacementQty}
                    onChange={(e) => {
                      const val = e.target.value;
                      setReplacementQty(val);
                      const parsed = parseFloat(val);
                      if (!isNaN(parsed) && parsed <= totalProposalQty) {
                        setRejectedQty(String(Math.max(0, +(totalProposalQty - parsed).toFixed(4))));
                      }
                    }}
                    className="w-full h-8 px-2.5 text-xs font-mono font-bold bg-background border border-emerald-500/40 rounded-lg text-foreground focus:ring-2 focus:ring-emerald-500/20"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 block mb-1">
                    Reject &amp; Return to Dept
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={totalProposalQty}
                    step="any"
                    value={rejectedQty}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRejectedQty(val);
                      const parsed = parseFloat(val);
                      if (!isNaN(parsed) && parsed <= totalProposalQty) {
                        setReplacementQty(String(Math.max(0, +(totalProposalQty - parsed).toFixed(4))));
                      }
                    }}
                    className="w-full h-8 px-2.5 text-xs font-mono font-bold bg-background border border-rose-500/40 rounded-lg text-foreground focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>
              </div>

              {parseFloat(rejectedQty || '0') > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-destructive block">
                    Rejection Reason ({rejectedQty} {currentEvent.uomCode || 'units'} returned) *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Usable material; department must rework or complete with original stock"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs bg-background border border-destructive/40 rounded-lg text-foreground focus:ring-2 focus:ring-destructive/20"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Returned material reverts to the department. Department head must use it to achieve the scheduled output.
                  </p>
                </div>
              )}
            </div>
            </>
          )}
          {/* Dispatch Location */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Warehouse className="w-3.5 h-3.5 text-primary" />
              Dispatch Warehouse Location *
            </label>
            <select
              value={dispatchLocationId}
              onChange={(e) => setDispatchLocationId(e.target.value)}
              required
              className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Select dispatch location...</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          {/* Target Department */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-primary" />
              Receiving Destination Department
            </label>
            <select
              value={targetDepartmentId}
              onChange={(e) => setTargetDepartmentId(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Select receiving department...</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name} ({dept.code})
                </option>
              ))}
            </select>
          </div>

          {/* Direct File Attachment (Gate Pass / Physical Challan) */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-primary" />
              Attach Physical Challan / Gate Pass Document (Optional)
            </label>
            <EvidenceAttachmentField
              evidenceUrls={documentUrls}
              onChange={setDocumentUrls}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Dispatch Instructions / Remarks
            </label>
            <textarea
              placeholder="Provide gatepass / driver / handling instructions (optional)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full p-2.5 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
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
              className="h-9 px-5 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white shadow-xs"
            >
              {isSubmitting ? 'Issuing...' : 'Issue Replacement Challan'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
