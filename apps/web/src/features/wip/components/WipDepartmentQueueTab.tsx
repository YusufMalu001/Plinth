"use client";

import React, { useState } from "react";
import {
  Building2,
  User,
  GitFork,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Card, Button } from "@plinth/ui";
import { StatusBadge, type AnyStatus } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { useWipDepartmentQueue } from "../hooks";

interface WipDepartmentQueueTabProps {
  departments?: Array<{ id: string; name: string; code: string }>;
  selectedDepartmentId?: string;
  onSelectDepartment?: (deptId: string) => void;
  onSelectBatch?: (batchId: string, mode?: "detail" | "genealogy") => void;
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

export function WipDepartmentQueueTab({
  departments = [],
  selectedDepartmentId,
  onSelectDepartment,
  onSelectBatch
}: WipDepartmentQueueTabProps) {
  const activeDeptId = selectedDepartmentId || departments[0]?.id || "";
  const [queueTab, setQueueTab] = useState<"all" | "awaiting" | "active" | "handover">("all");
  const [page, setPage] = useState(1);
  const limit = 15;

  const effectiveStatus =
    queueTab === "awaiting"
      ? "AWAITING_RECEIPT"
      : queueTab === "handover"
      ? "HANDOVER_PENDING"
      : undefined;

  const {
    data: response,
    isLoading,
    isError,
    error,
    refetch,
    isFetching
  } = useWipDepartmentQueue(activeDeptId, {
    status: effectiveStatus,
    page,
    limit
  });

  const batches = Array.isArray(response)
    ? response
    : response?.items || [];
  const total = Array.isArray(response)
    ? response.length
    : response?.total || batches.length;
  const totalPages = Math.ceil(total / limit) || 1;

  const currentDept = departments.find((d) => d.id === activeDeptId);

  return (
    <div className="space-y-4" data-testid="wip-department-queue-tab">
      {/* 1. Header Toolbar */}
      <Card className="p-4 border-border bg-card shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {currentDept?.name || "Department Shop Floor Queue"}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {departments.length > 1 && (
              <select
                value={activeDeptId}
                onChange={(e) => {
                  if (onSelectDepartment) onSelectDepartment(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                data-testid="select-queue-department"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            )}

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

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 mt-4 pt-3 border-t border-border">
          <Button
            variant={queueTab === "all" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setQueueTab("all");
              setPage(1);
            }}
            className="text-xs h-8"
          >
            All Active Queue
          </Button>
          <Button
            variant={queueTab === "awaiting" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setQueueTab("awaiting");
              setPage(1);
            }}
            className="text-xs h-8"
          >
            Awaiting Receipt
          </Button>
          <Button
            variant={queueTab === "active" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setQueueTab("active");
              setPage(1);
            }}
            className="text-xs h-8"
          >
            In Progress & Assigned
          </Button>
          <Button
            variant={queueTab === "handover" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setQueueTab("handover");
              setPage(1);
            }}
            className="text-xs h-8"
          >
            Handover Pending
          </Button>
        </div>
      </Card>

      {/* 2. Queue Table */}
      {isLoading ? (
        <LoadingState message="Loading department queue..." />
      ) : isError ? (
        <ErrorState
          error={error instanceof Error ? error : new Error("Failed to load department queue")}
          retry={() => refetch()}
        />
      ) : batches.length === 0 ? (
        <EmptyState
          title="Department queue is clear"
          description="There are currently no active batches awaiting action in this department."
        />
      ) : (
        <Card className="overflow-hidden border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/50 text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-semibold">Batch #</th>
                  <th className="px-4 py-3 font-semibold">Production Plan</th>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold text-center">Stage</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Received</th>
                  <th className="px-4 py-3 font-semibold text-right">Completed</th>
                  <th className="px-4 py-3 font-semibold text-right">Pending</th>
                  <th className="px-4 py-3 font-semibold text-center">Operators</th>
                  <th className="px-4 py-3 font-semibold text-right">Queue Wait</th>
                  <th className="px-4 py-3 font-semibold text-right">Active Time</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batches.map((item) => (
                  <tr
                    key={item.batchId}
                    className="hover:bg-muted/30 transition-colors"
                    data-testid={`queue-item-${item.batchNumber}`}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-foreground">
                      {item.batchNumber}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {item.productionPlanNumber || "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {item.productName || "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-muted font-mono text-xs font-semibold text-foreground">
                        {item.stageSequenceNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status as AnyStatus} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {item.receivedQty}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {item.completedQty}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-amber-600 dark:text-amber-400 font-semibold">
                      {item.pendingQty}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-mono">
                        <User className="h-3 w-3" />
                        {item.assignedWorkersCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                      {formatDuration(item.queueDurationSeconds)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-foreground font-semibold">
                      {formatDuration(item.activeDurationSeconds)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => onSelectBatch && onSelectBatch(item.batchId, "detail")}
                          title="View Details"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Detail
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs text-primary border-primary/30 hover:bg-primary/10"
                          onClick={() => onSelectBatch && onSelectBatch(item.batchId, "genealogy")}
                          title="Trace Genealogy"
                        >
                          <GitFork className="h-3.5 w-3.5 mr-1" />
                          Trace
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-muted/20 text-xs text-muted-foreground">
            <div>
              Showing <span className="font-semibold text-foreground">{batches.length}</span> of{" "}
              <span className="font-semibold text-foreground">{total}</span> queue items
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
