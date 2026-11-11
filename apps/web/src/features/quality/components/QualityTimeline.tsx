import React from 'react';
import {
  CheckCircle2,
  AlertOctagon,
  RotateCcw,
  Trash2,
  RefreshCw,
  Lock,
  ExternalLink,
  Clock,
  User,
  ArrowRight,
  ShieldCheck,
  Paperclip
} from 'lucide-react';
import { InspectionResultDto, CorrectiveActionDto } from '@plinth/types';
import { StatusBadge } from '../../../components/StatusBadge';

interface QualityTimelineProps {
  inspections: InspectionResultDto[];
  onReinspect?: (inspection: InspectionResultDto) => void;
  onUpdateAction?: (action: CorrectiveActionDto) => void;
}

export function QualityTimeline({
  inspections,
  onReinspect,
  onUpdateAction
}: QualityTimelineProps) {
  if (inspections.length === 0) {
    return (
      <div className="text-center py-12 px-4 rounded-xl border border-dashed border-border bg-card">
        <ShieldCheck className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
        <h4 className="text-sm font-semibold text-foreground">No Quality Inspection Records</h4>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          No quality inspections, reinspections, or gate overrides have been recorded for this item yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative before:absolute before:inset-0 before:left-4 sm:before:left-6 before:w-0.5 before:bg-border">
      {inspections.map((insp) => {
        const isPass = insp.status === 'PASS';
        const isFail = insp.status === 'FAIL';
        const isRework = insp.status === 'REWORK';
        const isScrap = insp.status === 'REJECT_SCRAP';
        const isReinspect = !!insp.reinspectionOfId;

        const getIcon = () => {
          if (insp.isOverride) return <Lock className="w-4 h-4 text-primary" />;
          if (isPass) return <CheckCircle2 className="w-4 h-4 text-primary" />;
          if (isRework) return <RotateCcw className="w-4 h-4 text-primary" />;
          if (isScrap) return <Trash2 className="w-4 h-4 text-destructive" />;
          if (isFail) return <AlertOctagon className="w-4 h-4 text-destructive" />;
          return <RefreshCw className="w-4 h-4 text-primary" />;
        };

        return (
          <div key={insp.id} className="relative pl-10 sm:pl-14 group">
            {/* Timeline Dot Icon */}
            <div className="absolute left-2 sm:left-4 -translate-x-1/2 top-1.5 p-1.5 rounded-full bg-card border-2 border-border shadow-xs flex items-center justify-center transition-transform group-hover:scale-110">
              {getIcon()}
            </div>

            {/* Content Card */}
            <div className="p-4 sm:p-5 rounded-2xl border border-border bg-card shadow-2xs space-y-3 transition-all hover:border-primary/40">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono text-xs font-bold text-foreground">
                    {insp.inspectionNumber}
                  </span>
                  <StatusBadge status={insp.status} />
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-mono">
                    {insp.checkpointType}
                  </span>
                  {insp.isOverride && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-semibold flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Override
                    </span>
                  )}
                  {isReinspect && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-semibold flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      Re-Inspection Loop
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{new Date(insp.createdAt).toLocaleString()}</span>
                </div>
              </div>

              {/* Inspector & Quantities */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-muted/20 p-3 rounded-xl border border-border/50">
                <div>
                  <span className="text-muted-foreground block">Inspector</span>
                  <span className="font-medium text-foreground flex items-center gap-1 mt-0.5">
                    <User className="w-3 h-3 text-primary" />
                    {insp.inspectorEmployeeName || 'Signatory'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Sampled Qty</span>
                  <span className="font-semibold text-foreground">{insp.sampledQuantity}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Defective Qty</span>
                  <span className={`font-semibold ${insp.defectiveQuantity > 0 ? 'text-destructive' : 'text-foreground'}`}>
                    {insp.defectiveQuantity}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Criteria Rule</span>
                  <span className="font-mono text-foreground font-medium">{insp.qcRule?.code || 'Standard'}</span>
                </div>
              </div>

              {/* Reason / Observations */}
              {insp.reason && (
                <div className="text-xs space-y-1">
                  <span className="font-semibold text-foreground">Findings & Reason:</span>
                  <p className="p-2.5 rounded-lg bg-muted/40 border border-border/60 text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {insp.reason}
                  </p>
                </div>
              )}

              {/* Corrective Actions */}
              {insp.correctiveActions && insp.correctiveActions.length > 0 && (
                <div className="space-y-2 pt-1">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-primary" />
                    Traceable Corrective Actions:
                  </span>
                  <div className="space-y-2">
                    {insp.correctiveActions.map((ca) => (
                      <div
                        key={ca.id}
                        className="p-3 rounded-xl bg-muted/40 border border-border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={ca.status} />
                            <span className="font-medium text-foreground">{ca.actionDescription}</span>
                          </div>
                          {ca.resolutionNotes && (
                            <p className="text-muted-foreground text-[11px] mt-0.5">
                              Resolution: {ca.resolutionNotes}
                            </p>
                          )}
                        </div>

                        {onUpdateAction && ca.status !== 'COMPLETED' && ca.status !== 'VERIFIED' && (
                          <button
                            type="button"
                            onClick={() => onUpdateAction(ca)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors w-full sm:w-auto text-center"
                          >
                            Update Action
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence Attachment URLs */}
              {insp.evidenceAttachmentUrls && insp.evidenceAttachmentUrls.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-primary" />
                    Evidence Attachments:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {insp.evidenceAttachmentUrls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted text-foreground hover:text-primary border border-border text-xs transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span className="max-w-[200px] truncate">{url}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Re-Inspect Action */}
              {onReinspect && (isFail || isRework) && (
                <div className="flex justify-end pt-2 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => onReinspect(insp)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Record Re-Inspection
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
