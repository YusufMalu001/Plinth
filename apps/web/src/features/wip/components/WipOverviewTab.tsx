"use client";

import React from "react";
import {
 Layers,
 Activity,
 AlertTriangle,
 Building2,
 ArrowRight,
 Clock
} from "lucide-react";
import { Card, Button } from "@plinth/ui";
import { StatusBadge, type AnyStatus } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { useWipOverview } from "../hooks";

interface WipOverviewTabProps {
 departmentId?: string;
 onSelectDepartment?: (deptId: string) => void;
 onNavigateToTab?: (tab: "batches" | "queue" | "timing" | "reconciliation") => void;
}

export function WipOverviewTab({
 departmentId,
 onSelectDepartment,
 onNavigateToTab
}: WipOverviewTabProps) {
 const { data: metrics, isLoading, isError, error, refetch } = useWipOverview(
 departmentId ? { departmentId } : undefined
 );

 if (isLoading) {
 return <LoadingState message="Loading WIP overview metrics..." />;
 }

 if (isError || !metrics) {
 return (
 <ErrorState
 error={error instanceof Error ? error : new Error("Failed to load WIP Overview")}
 retry={() => refetch()}
 />
 );
 }

 return (
 <div className="space-y-6" data-testid="wip-overview-tab">
 {/* 1. Metric Summary Cards */}
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <Card className="p-5 flex items-center justify-between border-border bg-card shadow-sm hover:shadow transition-shadow">
 <div>
 <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
 Batches in Flight
 </p>
 <p className="text-3xl font-bold mt-1 text-foreground" data-testid="kpi-active-batches">
 {metrics.totalActiveBatches}
 </p>
 </div>
 <div className="h-12 w-12 rounded-xl bg-tone-blue-solid/10 text-tone-blue-text flex items-center justify-center">
 <Layers className="h-6 w-6" />
 </div>
 </Card>

 <Card className="p-5 flex items-center justify-between border-border bg-card shadow-sm hover:shadow transition-shadow">
 <div>
 <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
 Total WIP Quantity
 </p>
 <p className="text-3xl font-bold mt-1 text-foreground" data-testid="kpi-total-wip-qty">
 {metrics.totalWipQuantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
 </p>
 </div>
 <div className="h-12 w-12 rounded-xl bg-tone-green-solid/10 text-tone-green-text flex items-center justify-center">
 <Activity className="h-6 w-6" />
 </div>
 </Card>

 <Card
 className={`p-5 flex items-center justify-between border-border bg-card shadow-sm hover:shadow transition-shadow ${
 metrics.openExceptionsCount > 0 ? "border-tone-amber-solid/25/40 bg-tone-amber-bg/20 " : ""
 }`}
 >
 <div>
 <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
 Reconciliation Exceptions
 </p>
 <p className="text-3xl font-bold mt-1 text-foreground" data-testid="kpi-open-exceptions">
 {metrics.openExceptionsCount}
 </p>
 </div>
 <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
 metrics.openExceptionsCount > 0
 ? "bg-tone-amber-solid/10 text-tone-amber-text "
 : "bg-muted text-muted-foreground"
 }`}>
 <AlertTriangle className="h-6 w-6" />
 </div>
 </Card>
 </div>

 {/* 2. Department Breakdown Table */}
 <Card className="p-5 border-border bg-card shadow-sm">
 <div className="flex items-center justify-between mb-4">
 <div>
 <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
 <Building2 className="h-4 w-4 text-primary" />
 Department Shop-Floor Load
 </h3>
 </div>
 {onNavigateToTab && (
 <Button
 variant="outline"
 size="sm"
 onClick={() => onNavigateToTab("queue")}
 className="text-xs"
 >
 Open Department Queues
 <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
 </Button>
 )}
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-sm text-left">
 <thead className="text-xs uppercase bg-muted/50 text-muted-foreground border-b border-border">
 <tr>
 <th className="px-4 py-3 font-semibold">Department</th>
 <th className="px-4 py-3 font-semibold text-right">Total Batches</th>
 <th className="px-4 py-3 font-semibold text-right">Active In Stage</th>
 <th className="px-4 py-3 font-semibold text-right">Pending Handover</th>
 <th className="px-4 py-3 font-semibold text-right">Derived WIP Units</th>
 <th className="px-4 py-3 font-semibold text-right">Action</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {metrics.departmentBreakdown.length === 0 ? (
 <tr>
 <td colSpan={6} className="text-center py-6 text-muted-foreground text-sm">
 No department execution batches active at this time.
 </td>
 </tr>
 ) : (
 metrics.departmentBreakdown.map((dept) => (
 <tr
 key={dept.departmentId}
 className="hover:bg-muted/30 transition-colors cursor-pointer"
 onClick={() => {
 if (onSelectDepartment) onSelectDepartment(dept.departmentId);
 if (onNavigateToTab) onNavigateToTab("queue");
 }}
 >
 <td className="px-4 py-3 font-medium text-foreground">
 <div className="flex items-center gap-2">
 <span className="font-semibold">{dept.departmentName}</span>
 <span className="text-xs text-muted-foreground font-mono">({dept.departmentCode})</span>
 </div>
 </td>
 <td className="px-4 py-3 text-right font-mono text-muted-foreground">
 {dept.batchCount}
 </td>
 <td className="px-4 py-3 text-right">
 <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
 dept.activeBatches > 0 ? "bg-tone-blue-bg text-tone-blue-text " : "text-muted-foreground"
 }`}>
 {dept.activeBatches}
 </span>
 </td>
 <td className="px-4 py-3 text-right">
 <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
 dept.pendingHandovers > 0 ? "bg-tone-amber-bg text-tone-amber-text " : "text-muted-foreground"
 }`}>
 {dept.pendingHandovers}
 </span>
 </td>
 <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
 {dept.totalWipQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}
 </td>
 <td className="px-4 py-3 text-right">
 <Button
 variant="ghost"
 size="sm"
 className="text-xs h-7 px-2"
 onClick={(e) => {
 e.stopPropagation();
 if (onSelectDepartment) onSelectDepartment(dept.departmentId);
 if (onNavigateToTab) onNavigateToTab("queue");
 }}
 >
 View Queue
 <ArrowRight className="h-3 w-3 ml-1" />
 </Button>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </Card>

 {/* 3. Status Distribution Grid */}
 <Card className="p-5 border-border bg-card shadow-sm">
 <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
 <Clock className="h-4 w-4 text-primary" />
 Status Distribution Breakdown
 </h3>
 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
 {Object.entries(metrics.statusBreakdown).map(([status, count]) => (
 <div
 key={status}
 className="p-3 rounded-lg bg-muted/40 border border-border flex flex-col justify-between"
 >
 <StatusBadge status={status as AnyStatus} className="text-xs mb-2 self-start" />
 <div className="flex items-baseline justify-between mt-1">
 <span className="text-xs text-muted-foreground">Count</span>
 <span className="text-lg font-bold text-foreground font-mono">{count}</span>
 </div>
 </div>
 ))}
 </div>
 </Card>
 </div>
 );
}
