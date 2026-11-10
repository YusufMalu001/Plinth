"use client";

import React, { useState } from "react";
import {
  Clock,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Card, Button } from "@synergy/ui";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { useWipTimingMetrics } from "../hooks";

interface WipTimingMetricsTabProps {
  departments?: Array<{ id: string; name: string; code: string }>;
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

export function WipTimingMetricsTab({
  departments = []
}: WipTimingMetricsTabProps) {
  const [selectedDept, setSelectedDept] = useState<string>(departments.length === 1 ? departments[0].id : "");
  const [page, setPage] = useState(1);
  const limit = 15;

  React.useEffect(() => {
    if (departments.length === 1) {
      setSelectedDept(departments[0].id);
    }
  }, [departments]);

  const { data: response, isLoading, isError, error, refetch, isFetching } = useWipTimingMetrics({
    departmentId: selectedDept || undefined,
    page,
    limit
  });

  const metricsList = Array.isArray(response)
    ? response
    : response?.items || [];
  const total = Array.isArray(response)
    ? response.length
    : response?.total || metricsList.length;
  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-4" data-testid="wip-timing-metrics-tab">
      {/* 1. Header Toolbar with Notice */}
      <Card className="p-4 border-border bg-card shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Stage Execution Duration Metrics</h3>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              data-testid="select-timing-department"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-9 px-3"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

      </Card>

      {/* 2. Timing Table */}
      {isLoading ? (
        <LoadingState message="Calculating stage duration metrics..." />
      ) : isError ? (
        <ErrorState
          error={error instanceof Error ? error : new Error("Failed to load timing metrics")}
          retry={() => refetch()}
        />
      ) : metricsList.length === 0 ? (
        <EmptyState
          title="No execution batches to measure"
          description="There are currently no batches recorded in this scope."
        />
      ) : (
        <Card className="overflow-hidden border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/50 text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-semibold">Batch Number</th>
                  <th className="px-4 py-3 font-semibold">Created / Received</th>
                  <th className="px-4 py-3 font-semibold">First Started</th>
                  <th className="px-4 py-3 font-semibold text-right">Queue Wait Time</th>
                  <th className="px-4 py-3 font-semibold text-right">Active Processing</th>
                  <th className="px-4 py-3 font-semibold text-right">Paused Duration</th>
                  <th className="px-4 py-3 font-semibold text-right">Total Stage Elapsed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {metricsList.map((metric) => (
                  <tr
                    key={metric.batchId}
                    className="hover:bg-muted/30 transition-colors"
                    data-testid={`timing-row-${metric.batchNumber}`}
                  >
                    <td className="px-4 py-3 font-mono font-bold text-foreground">
                      {metric.batchNumber}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {new Date(metric.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {metric.startedAt ? new Date(metric.startedAt).toLocaleTimeString() : "Not Started"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground" data-testid={`queue-duration-${metric.batchNumber}`}>
                      {formatDuration(metric.queueDurationSeconds)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400" data-testid={`active-duration-${metric.batchNumber}`}>
                      {formatDuration(metric.activeExecutionDurationSeconds)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-amber-600 dark:text-amber-400" data-testid={`paused-duration-${metric.batchNumber}`}>
                      {formatDuration(metric.pausedDurationSeconds)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-bold text-foreground" data-testid={`total-duration-${metric.batchNumber}`}>
                      {formatDuration(metric.totalStageDurationSeconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-muted/20 text-xs text-muted-foreground">
            <div>
              Showing <span className="font-semibold text-foreground">{metricsList.length}</span> of{" "}
              <span className="font-semibold text-foreground">{total}</span> measured batches
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span>
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
