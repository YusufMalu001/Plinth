"use client";

import React from "react";
import {
 Building2,
 Clock,
 User,
 Activity,
 GitFork,
 X
} from "lucide-react";
import { Card, Button } from "@plinth/ui";
import { StatusBadge, type AnyStatus } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { useWipBatchDetail } from "../hooks";

interface WipBatchDetailModalProps {
 batchId: string;
 isOpen: boolean;
 onClose: () => void;
 onOpenGenealogy?: (batchId: string) => void;
}

function formatDuration(seconds: number): string {
 if (seconds < 60) return `${seconds}s`;
 const mins = Math.floor(seconds / 60);
 if (mins < 60) return `${mins}m ${seconds % 60}s`;
 const hours = Math.floor(mins / 60);
 const remainingMins = mins % 60;
 if (hours < 24) return `${hours}h ${remainingMins}m`;
 const days = Math.floor(hours / 24);
 return `${days}d ${hours % 24}h`;
}

export function WipBatchDetailModal({
 batchId,
 isOpen,
 onClose,
 onOpenGenealogy
}: WipBatchDetailModalProps) {
 const { data: detail, isLoading, isError, error, refetch } = useWipBatchDetail(batchId);

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-200">
 <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
 {/* Header */}
 <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-muted/30">
 <div className="flex items-center gap-3">
 <div className="p-2 rounded-lg bg-primary/10 text-primary">
 <Building2 className="h-5 w-5" />
 </div>
 <div>
 <div className="flex items-center gap-2">
 <h3 className="text-lg font-bold text-foreground">
 Batch Detail & Shopfloor Status
 </h3>
 {detail?.batch.status && (
 <StatusBadge status={detail.batch.status as AnyStatus} />
 )}
 </div>
 <p className="text-xs text-muted-foreground mt-0.5 font-mono">
 {detail?.batch.batchNumber || batchId}
 </p>
 </div>
 </div>

 <div className="flex items-center gap-2">
 {onOpenGenealogy && (
 <Button
 variant="outline"
 size="sm"
 onClick={() => {
 onClose();
 onOpenGenealogy(batchId);
 }}
 className="text-xs h-8 text-primary border-primary/30 hover:bg-primary/10"
 >
 <GitFork className="h-3.5 w-3.5 mr-1.5" />
 Trace Lineage
 </Button>
 )}
 <Button
 variant="ghost"
 size="sm"
 onClick={onClose}
 className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
 >
 <X className="h-4 w-4" />
 </Button>
 </div>
 </div>

 {/* Content Body */}
 <div className="flex-1 overflow-y-auto p-5 space-y-6">
 {isLoading ? (
 <div className="py-12">
 <LoadingState message="Loading batch details..." />
 </div>
 ) : isError || !detail ? (
 <div className="py-12">
 <ErrorState
 error={error instanceof Error ? error : new Error("Failed to load batch details")}
 retry={() => refetch()}
 />
 </div>
 ) : (
 <>
 {/* Product & Department Metadata */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="p-3 rounded-lg bg-muted/40 border border-border">
 <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Product</span>
 <span className="text-sm font-semibold text-foreground block mt-0.5 truncate">{detail.batch.productName || "—"}</span>
 <span className="text-xs font-mono text-muted-foreground">{detail.batch.productCode}</span>
 </div>

 <div className="p-3 rounded-lg bg-muted/40 border border-border">
 <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Department / Stage</span>
 <span className="text-sm font-semibold text-foreground block mt-0.5">{detail.batch.departmentName}</span>
 <span className="text-xs font-mono text-muted-foreground">Stage #{detail.batch.stageSequenceNumber}</span>
 </div>

 <div className="p-3 rounded-lg bg-muted/40 border border-border">
 <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Production Plan</span>
 <span className="text-sm font-semibold text-foreground block mt-0.5">{detail.batch.productionPlanNumber || "—"}</span>
 <span className="text-xs font-mono text-muted-foreground truncate">{detail.batch.productionPlanId}</span>
 </div>

 <div className="p-3 rounded-lg bg-muted/40 border border-border">
 <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">WIP Units</span>
 <span className="text-base font-bold text-primary block mt-0.5">{detail.batch.wipQuantity} units</span>
 <span className="text-xs text-muted-foreground font-mono">Recv: {detail.batch.receivedQty} | Done: {detail.batch.completedQty}</span>
 </div>
 </div>

 {/* Timing Breakdown */}
 <Card className="p-4 border-border bg-card shadow-xs space-y-3">
 <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
 <Clock className="h-3.5 w-3.5 text-primary" />
 Raw Execution Timing Breakdown
 </h4>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
 <div className="p-2.5 rounded bg-muted/30 border border-border">
 <span className="text-muted-foreground block text-[11px]">Queue Wait Time</span>
 <p className="font-mono font-semibold text-foreground text-sm mt-0.5">
 {formatDuration(detail.timings.queueDurationSeconds)}
 </p>
 </div>
 <div className="p-2.5 rounded bg-muted/30 border border-border">
 <span className="text-muted-foreground block text-[11px]">Active Processing</span>
 <p className="font-mono font-semibold text-foreground text-sm mt-0.5">
 {formatDuration(detail.timings.activeExecutionDurationSeconds)}
 </p>
 </div>
 <div className="p-2.5 rounded bg-muted/30 border border-border">
 <span className="text-muted-foreground block text-[11px]">Paused Time</span>
 <p className="font-mono font-semibold text-foreground text-sm mt-0.5">
 {formatDuration(detail.timings.pausedDurationSeconds)}
 </p>
 </div>
 <div className="p-2.5 rounded bg-muted/30 border border-border">
 <span className="text-muted-foreground block text-[11px]">Total Stage Elapsed</span>
 <p className="font-mono font-bold text-foreground text-sm mt-0.5">
 {formatDuration(detail.timings.totalStageDurationSeconds)}
 </p>
 </div>
 </div>
 </Card>

 {/* Workers & Handover Links */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 {/* Workers */}
 <Card className="p-4 border-border bg-card shadow-xs space-y-2.5">
 <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
 <User className="h-3.5 w-3.5 text-primary" />
 Assigned Operators ({detail.assignedWorkers.length})
 </h4>
 {detail.assignedWorkers.length === 0 ? (
 <p className="text-xs text-muted-foreground italic py-2">No operators assigned to this stage.</p>
 ) : (
 <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
 {detail.assignedWorkers.map((w) => (
 <div
 key={w.id}
 className="p-2 rounded bg-muted/40 border border-border text-xs flex items-center justify-between"
 >
 <span className="font-medium text-foreground">{w.employeeName}</span>
 {w.subtaskDescription && (
 <span className="text-muted-foreground italic">{w.subtaskDescription}</span>
 )}
 </div>
 ))}
 </div>
 )}
 </Card>

 {/* Handover Links */}
 <Card className="p-4 border-border bg-card shadow-xs space-y-2.5">
 <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
 <GitFork className="h-3.5 w-3.5 text-primary" />
 Stage Handover Connections
 </h4>
 <div className="space-y-2 text-xs">
 {detail.sourceHandover ? (
 <div className="p-2 rounded bg-muted/30 border border-border flex items-center justify-between">
 <span className="text-muted-foreground">
 From: <strong className="text-foreground">{detail.sourceHandover.outgoingDepartmentName}</strong> ({detail.sourceHandover.outgoingBatchNumber})
 </span>
 <StatusBadge status={detail.sourceHandover.status as AnyStatus} className="text-[10px]" />
 </div>
 ) : (
 <p className="text-xs text-muted-foreground italic">Initial stage (No source handover)</p>
 )}

 {detail.outgoingHandovers.map((oh) => (
 <div key={oh.id} className="p-2 rounded bg-muted/30 border border-border flex items-center justify-between">
 <span className="text-muted-foreground">
 To: <strong className="text-foreground">{oh.incomingDepartmentName}</strong> ({oh.quantity} units)
 </span>
 <StatusBadge status={oh.status as AnyStatus} className="text-[10px]" />
 </div>
 ))}
 </div>
 </Card>
 </div>

 {/* Event Stream & Exceptions */}
 <Card className="p-4 border-border bg-card shadow-xs space-y-3">
 <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
 <Activity className="h-3.5 w-3.5 text-primary" />
 Stage Event Stream & Exceptions
 </h4>

 {detail.progressEvents.length === 0 && detail.exceptionRecords.length === 0 ? (
 <p className="text-xs text-muted-foreground text-center py-6 italic">
 No progress events or exceptions logged on this stage.
 </p>
 ) : (
 <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
 {[
 ...detail.progressEvents.map((pe) => ({ ...pe, kind: "event" as const })),
 ...detail.exceptionRecords.map((ex) => ({ ...ex, kind: "exception" as const }))
 ]
 .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
 .map((item, i) => (
 <div key={item.id || i} className="flex items-start gap-3 text-xs">
 <div className="mt-0.5">
 {item.kind === "event" ? (
 <div className="h-4 w-4 rounded-full bg-tone-blue-bg text-tone-blue-text flex items-center justify-center font-bold text-[9px]">
 ✓
 </div>
 ) : (
 <div className="h-4 w-4 rounded-full bg-tone-red-bg text-tone-red-text flex items-center justify-center font-bold text-[9px]">
 !
 </div>
 )}
 </div>

 <div className="flex-1 bg-muted/40 p-2 rounded-lg border border-border">
 <div className="flex items-center justify-between">
 <span className="font-bold text-foreground">
 {item.kind === "event" ? item.eventType : `Exception: ${item.type}`}
 </span>
 <span className="text-[10px] text-muted-foreground font-mono">
 {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
 </span>
 </div>

 {item.kind === "event" && item.quantityDelta > 0 && (
 <p className="text-tone-green-text font-mono mt-0.5 font-semibold">
 +{item.quantityDelta} units recorded
 </p>
 )}

 {item.kind === "exception" && (
 <p className="text-tone-red-text font-mono mt-0.5">
 {item.quantity} units ({item.reason})
 </p>
 )}

 {item.kind === "event" && item.notes && <p className="text-muted-foreground mt-0.5">{item.notes}</p>}
 {item.employeeName && (
 <p className="text-[10px] text-muted-foreground mt-0.5">Logged by: {item.employeeName}</p>
 )}
 </div>
 </div>
 ))}
 </div>
 )}
 </Card>
 </>
 )}
 </div>

 {/* Footer */}
 <div className="p-3 bg-muted/30 border-t border-border flex justify-end">
 <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
 Close
 </Button>
 </div>
 </div>
 </div>
 );
}
