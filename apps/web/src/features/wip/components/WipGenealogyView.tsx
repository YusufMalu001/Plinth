"use client";

import React, { useState } from "react";
import {
 GitFork,
 ArrowRight,
 Clock,
 CheckCircle2,
 Building2,
 Layers,
 ArrowLeft,
 User,
 Activity
} from "lucide-react";
import { Card, Button } from "@plinth/ui";
import { StatusBadge, type AnyStatus } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { useWipBatchGenealogy, useWipBatchDetail } from "../hooks";

interface WipGenealogyViewProps {
 batchId: string;
 onBack?: () => void;
 onSelectBatch?: (batchId: string) => void;
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

export function WipGenealogyView({
 batchId,
 onBack,
 onSelectBatch: _onSelectBatch
}: WipGenealogyViewProps) {
 const [activeStageBatchId, setActiveStageBatchId] = useState<string>(batchId);

 // Sync activeStageBatchId when the batchId prop changes
 React.useEffect(() => {
 setActiveStageBatchId(batchId);
 }, [batchId]);

 const { data: trace, isLoading, isError, error, refetch } = useWipBatchGenealogy(batchId);

 // If activeStageBatchId is not present in trace stages, default to the first stage batch
 React.useEffect(() => {
 if (trace && trace.stages.length > 0) {
 const exists = trace.stages.some(s => s.batchId === activeStageBatchId);
 if (!exists) {
 setActiveStageBatchId(trace.stages[0].batchId);
 }
 }
 }, [trace, activeStageBatchId]);

 const { data: activeDetail, isLoading: isLoadingDetail } = useWipBatchDetail(activeStageBatchId);

 if (isLoading) {
 return <LoadingState message="Tracing batch genealogy lineage..." />;
 }

 if (isError || !trace) {
 return (
 <ErrorState
 error={error instanceof Error ? error : new Error("Failed to load batch genealogy")}
 retry={() => refetch()}
 />
 );
 }

 return (
 <div className="space-y-6" data-testid="wip-genealogy-view">
 {/* 1. Header Toolbar */}
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card p-4 rounded-xl border border-border shadow-sm">
 <div className="flex items-center gap-3">
 {onBack && (
 <Button variant="outline" size="sm" onClick={onBack} className="h-8 px-2.5">
 <ArrowLeft className="h-4 w-4 mr-1" />
 Back
 </Button>
 )}
 <div>
 <div className="flex items-center gap-2">
 <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
 <GitFork className="h-5 w-5 text-primary" />
 Lineage Trace: {trace.productName || "Production Unit"}
 </h2>
 {trace.isComplete ? (
 <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-tone-green-bg text-tone-green-text font-semibold">
 <CheckCircle2 className="h-3 w-3" />
 Chain Complete
 </span>
 ) : (
 <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-tone-blue-bg text-tone-blue-text font-semibold">
 <Activity className="h-3 w-3 animate-pulse" />
 In Production
 </span>
 )}
 </div>
 <p className="text-xs text-muted-foreground mt-0.5">
 Total Stages: <span className="font-semibold text-foreground">{trace.totalStages}</span> | Total Lead Time:{" "}
 <span className="font-semibold text-foreground font-mono">{formatDuration(trace.totalLeadTimeSeconds)}</span>
 </p>
 </div>
 </div>

 <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-lg border border-border">
 <span>Plan:</span>
 <span className="font-mono font-semibold text-foreground">{trace.productionPlanId}</span>
 </div>
 </div>

 {/* 2. Horizontal Stage Chain Visualizer */}
 <Card className="p-5 border-border bg-card shadow-sm overflow-x-auto">
 <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider text-muted-foreground flex items-center gap-2">
 <Layers className="h-4 w-4 text-primary" />
 Multi-Department Routing Timeline
 </h3>

 <div className="flex flex-wrap lg:flex-nowrap items-stretch gap-2.5 pb-2">
 {trace.stages.map((stage, idx) => {
 const isSelected = stage.batchId === activeStageBatchId;

 return (
 <React.Fragment key={stage.batchId}>
 {/* Stage Node Box */}
 <div
 onClick={() => setActiveStageBatchId(stage.batchId)}
 className={`flex-1 min-w-[210px] max-w-sm p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
 isSelected
 ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/20"
 : "border-border bg-background hover:border-primary/50 hover:bg-muted/20"
 }`}
 data-testid={`genealogy-stage-${stage.stageSequenceNumber}`}
 >
 <div>
 {/* Top Row: Stage sequence & Status */}
 <div className="flex items-center justify-between gap-2 mb-2">
 <div className="flex items-center gap-1.5">
 <span className="h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center font-mono">
 {stage.stageSequenceNumber}
 </span>
 <span className="font-semibold text-sm text-foreground truncate max-w-[130px]">
 {stage.departmentName}
 </span>
 </div>
 <StatusBadge status={stage.status as AnyStatus} className="text-xs" />
 </div>

 {/* Batch Number */}
 <div className="flex items-center justify-between text-xs py-1 border-t border-b border-border/50 my-2">
 <span className="text-muted-foreground">Batch:</span>
 <span className="font-mono font-semibold text-foreground">{stage.batchNumber}</span>
 </div>

 {/* Quantities breakdown */}
 <div className="grid grid-cols-2 gap-1.5 text-xs mt-2">
 <div className="bg-muted/40 p-1.5 rounded">
 <span className="text-muted-foreground block text-[10px]">Received</span>
 <span className="font-mono font-bold text-foreground">{stage.receivedQty}</span>
 </div>
 <div className="bg-muted/40 p-1.5 rounded">
 <span className="text-muted-foreground block text-[10px]">Completed</span>
 <span className="font-mono font-bold text-tone-green-text ">
 {stage.completedQty}
 </span>
 </div>
 {stage.rejectedQty > 0 && (
 <div className="bg-tone-red-bg p-1.5 rounded col-span-2 text-tone-red-text ">
 <span className="block text-[10px]">Rejections</span>
 <span className="font-mono font-bold">{stage.rejectedQty}</span>
 </div>
 )}
 {stage.scrapQty > 0 && (
 <div className="bg-tone-amber-bg p-1.5 rounded col-span-2 text-tone-amber-text ">
 <span className="block text-[10px]">Scrap / Rework</span>
 <span className="font-mono font-bold">{stage.scrapQty}</span>
 </div>
 )}
 </div>
 </div>

 {/* Bottom: Raw Duration */}
 <div className="mt-3 pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
 <span className="flex items-center gap-1">
 <Clock className="h-3 w-3" />
 Stage Duration
 </span>
 <span className="font-mono font-semibold text-foreground" data-testid={`stage-duration-${stage.stageSequenceNumber}`}>
 {formatDuration(stage.durationSeconds)}
 </span>
 </div>
 </div>

 {/* Handover Arrow between stages */}
 {idx < trace.stages.length - 1 && (
 <div className="flex flex-col items-center justify-center px-1 text-muted-foreground">
 <div className="p-1 rounded-full bg-muted border border-border">
 <ArrowRight className="h-4 w-4 text-primary" />
 </div>
 {stage.outgoingHandovers?.[0] && (
 <span className="text-[10px] font-mono mt-1 text-muted-foreground font-semibold">
 {stage.outgoingHandovers[0].quantity} units
 </span>
 )}
 </div>
 )}
 </React.Fragment>
 );
 })}
 </div>
 </Card>

 {/* 3. Stage Drilldown Detail Panel */}
 {isLoadingDetail ? (
 <LoadingState message="Loading stage execution detail..." />
 ) : activeDetail ? (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 {/* Left: Stage Information & Worker Assignments */}
 <Card className="p-5 border-border bg-card shadow-sm space-y-4">
 <div className="flex items-center justify-between pb-3 border-b border-border">
 <div>
 <h4 className="font-bold text-foreground flex items-center gap-2">
 <Building2 className="h-4 w-4 text-primary" />
 Stage {activeDetail.batch.stageSequenceNumber}: {activeDetail.batch.departmentName}
 </h4>
 <p className="text-xs text-muted-foreground mt-0.5 font-mono">
 Batch: {activeDetail.batch.batchNumber}
 </p>
 </div>
 <StatusBadge status={activeDetail.batch.status as AnyStatus} />
 </div>

 {/* Timing Breakdown (Honest Raw Durations) */}
 <div className="p-3 bg-muted/30 rounded-lg border border-border space-y-2">
 <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
 <Clock className="h-3.5 w-3.5 text-primary" />
 Raw Execution Timing Breakdown
 </h5>
 <div className="grid grid-cols-2 gap-2 text-xs">
 <div>
 <span className="text-muted-foreground">Queue Wait Time:</span>
 <p className="font-mono font-semibold text-foreground">
 {formatDuration(activeDetail.timings.queueDurationSeconds)}
 </p>
 </div>
 <div>
 <span className="text-muted-foreground">Active Processing:</span>
 <p className="font-mono font-semibold text-foreground">
 {formatDuration(activeDetail.timings.activeExecutionDurationSeconds)}
 </p>
 </div>
 <div>
 <span className="text-muted-foreground">Paused Time:</span>
 <p className="font-mono font-semibold text-foreground">
 {formatDuration(activeDetail.timings.pausedDurationSeconds)}
 </p>
 </div>
 <div>
 <span className="text-muted-foreground">Total Stage Elapsed:</span>
 <p className="font-mono font-bold text-foreground">
 {formatDuration(activeDetail.timings.totalStageDurationSeconds)}
 </p>
 </div>
 </div>
 </div>

 {/* Assigned Workers */}
 <div>
 <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
 <User className="h-3.5 w-3.5 text-primary" />
 Assigned Operators ({activeDetail.assignedWorkers.length})
 </h5>
 {activeDetail.assignedWorkers.length === 0 ? (
 <p className="text-xs text-muted-foreground italic">No operators assigned to this stage.</p>
 ) : (
 <div className="space-y-1.5">
 {activeDetail.assignedWorkers.map((w) => (
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
 </div>

 {/* Handover Links */}
 <div className="pt-2 border-t border-border space-y-2 text-xs">
 {activeDetail.sourceHandover && (
 <div className="p-2 rounded bg-muted/30 border border-border flex items-center justify-between">
 <span className="text-muted-foreground">
 Incoming From: <strong className="text-foreground">{activeDetail.sourceHandover.outgoingDepartmentName}</strong> ({activeDetail.sourceHandover.outgoingBatchNumber})
 </span>
 <StatusBadge status={activeDetail.sourceHandover.status as AnyStatus} className="text-[10px]" />
 </div>
 )}

 {activeDetail.outgoingHandovers.map((oh) => (
 <div key={oh.id} className="p-2 rounded bg-muted/30 border border-border flex items-center justify-between">
 <span className="text-muted-foreground">
 Handover To: <strong className="text-foreground">{oh.incomingDepartmentName}</strong> ({oh.quantity} units)
 </span>
 <StatusBadge status={oh.status as AnyStatus} className="text-[10px]" />
 </div>
 ))}
 </div>
 </Card>

 {/* Right: Progress Events & Exceptions Timeline */}
 <Card className="p-5 border-border bg-card shadow-sm space-y-4">
 <h4 className="font-bold text-foreground flex items-center gap-2 pb-3 border-b border-border">
 <Activity className="h-4 w-4 text-primary" />
 Stage Event Stream & Exceptions
 </h4>

 {activeDetail.progressEvents.length === 0 && activeDetail.exceptionRecords.length === 0 ? (
 <p className="text-xs text-muted-foreground text-center py-8 italic">
 No progress events or exceptions logged on this stage.
 </p>
 ) : (
 <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
 {/* Interleave progress events and exceptions sorted by timestamp */}
 {[
 ...activeDetail.progressEvents.map((pe) => ({ ...pe, kind: "event" as const })),
 ...activeDetail.exceptionRecords.map((ex) => ({ ...ex, kind: "exception" as const }))
 ]
 .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
 .map((item, i) => (
 <div key={item.id || i} className="flex items-start gap-3 text-xs">
 <div className="mt-0.5">
 {item.kind === "event" ? (
 <div className="h-5 w-5 rounded-full bg-tone-blue-bg text-tone-blue-text flex items-center justify-center font-bold text-[10px]">
 ✓
 </div>
 ) : (
 <div className="h-5 w-5 rounded-full bg-tone-red-bg text-tone-red-text flex items-center justify-center font-bold text-[10px]">
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
 <p className="text-[10px] text-muted-foreground mt-1">Logged by: {item.employeeName}</p>
 )}
 </div>
 </div>
 ))}
 </div>
 )}
 </Card>
 </div>
 ) : null}
 </div>
 );
}
