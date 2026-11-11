import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertOctagon,
  RotateCcw,
  Trash2,
  RefreshCw,
  Plus,
  Paperclip,
  User,
  Layers,
  FileCheck2
} from 'lucide-react';
import {
  InspectionResultStatus,
  QcQueueItemDto
} from '@plinth/types';
import { qualityApi, EmployeeItem, RecordInspectionPayload } from '../api';

interface InspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  targetItem: QcQueueItemDto;
  employees?: EmployeeItem[];
}

export function InspectionModal({
  isOpen,
  onClose,
  onSuccess,
  targetItem,
  employees: initialEmployees
}: InspectionModalProps) {
  const [employees, setEmployees] = useState<EmployeeItem[]>(initialEmployees || []);
  const [selectedInspectorId, setSelectedInspectorId] = useState<string>('');
  const [sampledQty, setSampledQty] = useState<number>(targetItem.quantity || 1);
  const [defectiveQty, setDefectiveQty] = useState<number>(0);
  const [status, setStatus] = useState<InspectionResultStatus>('PASS');
  const [reason, setReason] = useState<string>('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState<string>('');
  const [reworkStageId, setReworkStageId] = useState<string>('');
  const [correctiveActionDesc, setCorrectiveActionDesc] = useState<string>('');
  const [exceptionType, setExceptionType] = useState<'REJECTION' | 'SCRAP'>('REJECTION');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialEmployees && initialEmployees.length > 0) {
      setEmployees(initialEmployees);
      setSelectedInspectorId(prev => prev || initialEmployees[0].id);
    } else {
      qualityApi.getEmployees().then(emps => {
        setEmployees(emps);
        if (emps.length > 0) {
          setSelectedInspectorId(prev => prev || emps[0].id);
        }
      });
    }
  }, [initialEmployees]);

  if (!isOpen) return null;

  const isNonPass = status !== 'PASS';
  const isReasonMissing = isNonPass && (!reason || reason.trim().length === 0);
  const isReworkDescMissing = status === 'REWORK' && (!correctiveActionDesc || correctiveActionDesc.trim().length === 0);
  const isQuantityInvalid = sampledQty <= 0 || defectiveQty < 0 || defectiveQty > sampledQty;
  const isInspectorMissing = !selectedInspectorId;

  const canSubmit = !isReasonMissing && !isReworkDescMissing && !isQuantityInvalid && !isInspectorMissing && !isSubmitting;

  const handleAddUrl = () => {
    if (!newUrl || !newUrl.trim()) return;
    try {
      new URL(newUrl.trim());
      setEvidenceUrls(prev => [...prev, newUrl.trim()]);
      setNewUrl('');
    } catch {
      setErrorMessage('Please enter a valid HTTP/HTTPS URL for the evidence attachment.');
    }
  };

  const handleRemoveUrl = (idx: number) => {
    setEvidenceUrls(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload: RecordInspectionPayload = {
        checkpointType: targetItem.checkpointType,
        targetType: targetItem.targetType,
        targetId: targetItem.targetId,
        inspectorEmployeeId: selectedInspectorId,
        qcRuleId: targetItem.qcRuleId,
        sampledQuantity: Number(sampledQty),
        defectiveQuantity: Number(defectiveQty),
        status,
        reason: isNonPass ? reason.trim() : null,
        evidenceAttachmentUrls: evidenceUrls,
        correctiveActionDescription: status === 'REWORK' ? correctiveActionDesc.trim() : null,
        targetReworkStageId: status === 'REWORK' && reworkStageId ? reworkStageId.trim() : null,
        assignedEmployeeId: status === 'REWORK' ? selectedInspectorId : null,
        exceptionType: status === 'REJECT_SCRAP' ? exceptionType : undefined
      };

      await qualityApi.recordInspection(payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to record inspection result');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Record Quality Inspection</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <span>{targetItem.referenceNumber}</span>
                <span>•</span>
                <span>{targetItem.itemDescription}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
              {errorMessage}
            </div>
          )}

          {/* Target Info Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-muted/30 border border-border text-xs">
            <div>
              <span className="text-muted-foreground block">Checkpoint</span>
              <span className="font-semibold text-foreground">{targetItem.checkpointType}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Target Type</span>
              <span className="font-semibold text-foreground">{targetItem.targetType}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">QC Rule</span>
              <span className="font-semibold text-foreground">{targetItem.qcRuleCode || 'Standard'}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Batch/Lot Qty</span>
              <span className="font-semibold text-foreground">{targetItem.quantity} {targetItem.unitOfMeasure || 'PCS'}</span>
            </div>
          </div>

          {/* Inspector Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-primary" />
              Inspector (Signatory Employee) <span className="text-destructive">*</span>
            </label>
            <select
              value={selectedInspectorId}
              onChange={e => setSelectedInspectorId(e.target.value)}
              required
              className="w-full h-10 px-3 text-xs bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground"
            >
              <option value="" disabled>Select inspector employee...</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} ({emp.employeeCode}) — {emp.role}
                </option>
              ))}
            </select>
          </div>

          {/* Quantities */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary" />
                Sampled Quantity <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                min="1"
                max={targetItem.quantity || undefined}
                value={sampledQty}
                onChange={e => setSampledQty(Number(e.target.value))}
                required
                className="w-full h-10 px-3 text-xs bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <AlertOctagon className="w-3.5 h-3.5 text-destructive" />
                Defective Quantity
              </label>
              <input
                type="number"
                min="0"
                max={sampledQty}
                value={defectiveQty}
                onChange={e => setDefectiveQty(Number(e.target.value))}
                className="w-full h-10 px-3 text-xs bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground"
              />
            </div>
          </div>

          {/* Result Disposition Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground block">
              Inspection Result Disposition <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => { setStatus('PASS'); setDefectiveQty(0); }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all ${
                  status === 'PASS'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/20 shadow-sm'
                    : 'border-border bg-card hover:bg-muted text-muted-foreground'
                }`}
              >
                <CheckCircle2 className="w-5 h-5 mb-1 text-emerald-500" />
                PASS
              </button>

              <button
                type="button"
                onClick={() => setStatus('FAIL')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all ${
                  status === 'FAIL'
                    ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-2 ring-rose-500/20 shadow-sm'
                    : 'border-border bg-card hover:bg-muted text-muted-foreground'
                }`}
              >
                <AlertOctagon className="w-5 h-5 mb-1 text-rose-500" />
                FAIL
              </button>

              <button
                type="button"
                onClick={() => setStatus('REWORK')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all ${
                  status === 'REWORK'
                    ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20 shadow-sm'
                    : 'border-border bg-card hover:bg-muted text-muted-foreground'
                }`}
              >
                <RotateCcw className="w-5 h-5 mb-1 text-primary" />
                REWORK
              </button>

              <button
                type="button"
                onClick={() => setStatus('REJECT_SCRAP')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all ${
                  status === 'REJECT_SCRAP'
                    ? 'border-red-600 bg-red-600/10 text-red-600 dark:text-red-400 ring-2 ring-red-600/20 shadow-sm'
                    : 'border-border bg-card hover:bg-muted text-muted-foreground'
                }`}
              >
                <Trash2 className="w-5 h-5 mb-1 text-red-600" />
                REJECT / SCRAP
              </button>

              <button
                type="button"
                onClick={() => setStatus('RE_INSPECTION')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all ${
                  status === 'RE_INSPECTION'
                    ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-2 ring-sky-500/20 shadow-sm'
                    : 'border-border bg-card hover:bg-muted text-muted-foreground'
                }`}
              >
                <RefreshCw className="w-5 h-5 mb-1 text-sky-500" />
                RE-INSPECT
              </button>
            </div>
          </div>

          {/* Conditional Rework Details */}
          {status === 'REWORK' && (
            <div className="p-4 rounded-xl border border-border bg-muted/40 space-y-3">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-primary" />
                Rework & Corrective Action Loop Setup
              </h4>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Corrective Action Description <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Deburr edges and re-align in cutting center"
                  value={correctiveActionDesc}
                  onChange={e => setCorrectiveActionDesc(e.target.value)}
                  required
                  className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Target Rework Stage / Operation (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Stage 2 / Machining Work Center"
                  value={reworkStageId}
                  onChange={e => setReworkStageId(e.target.value)}
                  className="w-full h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          )}

          {/* Conditional Reject/Scrap Details */}
          {status === 'REJECT_SCRAP' && (
            <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 space-y-3">
              <h4 className="text-xs font-semibold text-red-900 dark:text-red-200 flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                Scrap & Rejection Exception Logging
              </h4>
              <p className="text-xs text-muted-foreground">
                This will atomically create an official <code>ExceptionRecord</code> in Module 8 under this batch so scrap quantities remain synchronized.
              </p>
              <div className="flex items-center gap-4 text-xs font-medium">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="exceptionType"
                    value="REJECTION"
                    checked={exceptionType === 'REJECTION'}
                    onChange={() => setExceptionType('REJECTION')}
                    className="text-red-600 focus:ring-red-500"
                  />
                  <span>Rejection (Unusable WIP)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="exceptionType"
                    value="SCRAP"
                    checked={exceptionType === 'SCRAP'}
                    onChange={() => setExceptionType('SCRAP')}
                    className="text-red-600 focus:ring-red-500"
                  />
                  <span>Scrap (Metal/Raw Material Loss)</span>
                </label>
              </div>
            </div>
          )}

          {/* Reason Field (Required for Non-PASS) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>
                Inspection Notes & Reason {isNonPass && <span className="text-destructive">* (Strictly Required for non-PASS)</span>}
              </span>
              {isReasonMissing && (
                <span className="text-[11px] text-destructive font-medium">
                  Reason is mandatory for {status}
                </span>
              )}
            </label>
            <textarea
              rows={3}
              placeholder={isNonPass ? 'Provide detailed observation and cause for non-PASS result...' : 'Optional general inspection observations...'}
              value={reason}
              onChange={e => setReason(e.target.value)}
              className={`w-full p-3 text-xs bg-background border rounded-lg focus:ring-2 transition-all text-foreground ${
                isReasonMissing
                  ? 'border-destructive/60 focus:ring-destructive/20'
                  : 'border-border focus:ring-primary/20 focus:border-primary'
              }`}
            />
          </div>

          {/* Evidence Attachments */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-primary" />
              Evidence & Photo Attachment URLs
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://example.com/photos/qc-defect-01.jpg"
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                className="flex-1 h-9 px-3 text-xs bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <button
                type="button"
                onClick={handleAddUrl}
                className="px-3 h-9 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium inline-flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add URL
              </button>
            </div>
            {evidenceUrls.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {evidenceUrls.map((url, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border text-xs">
                    <span className="truncate max-w-md font-mono text-muted-foreground">{url}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveUrl(i)}
                      className="text-destructive hover:text-destructive/80 p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-border hover:bg-muted text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`px-5 py-2 text-xs font-semibold rounded-lg text-white shadow-sm transition-all flex items-center gap-1.5 ${
                !canSubmit
                  ? 'bg-muted-foreground/40 cursor-not-allowed opacity-60'
                  : status === 'PASS'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : status === 'REWORK'
                  ? 'bg-primary hover:bg-primary/90'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Recording...
                </>
              ) : (
                `Record ${status} Result`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
