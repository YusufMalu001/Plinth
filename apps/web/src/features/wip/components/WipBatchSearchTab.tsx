"use client";

import React, { useState } from "react";
import {
  Search,
  Eye,
  GitFork,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Card, Button } from "@synergy/ui";
import { StatusBadge, type AnyStatus } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { useWipBatches } from "../hooks";

interface WipBatchSearchTabProps {
  departments?: Array<{ id: string; name: string; code: string }>;
  onSelectBatch?: (batchId: string, mode?: "detail" | "genealogy") => void;
}

const EXECUTION_STATUSES = [
  "AWAITING_RECEIPT",
  "RECEIVED",
  "ASSIGNED",
  "IN_PROGRESS",
  "PAUSED",
  "PARTIAL",
  "COMPLETE",
  "REWORK",
  "REJECTED",
  "HANDOVER_PENDING",
  "NEXT_STAGE_ACCEPTED"
];

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

export function WipBatchSearchTab({
  departments = [],
  onSelectBatch
}: WipBatchSearchTabProps) {
  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState<string>(departments.length === 1 ? departments[0].id : "");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const limit = 15;

  React.useEffect(() => {
    if (departments.length === 1) {
      setSelectedDept(departments[0].id);
    }
  }, [departments]);

  const { data: response, isLoading, isError, error, refetch, isFetching } = useWipBatches({
    search: search.trim() || undefined,
    departmentId: selectedDept || undefined,
    status: selectedStatus || undefined,
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

  return (
    <div className="space-y-4" data-testid="wip-batch-search-tab">
      {/* 1. Filter Toolbar */}
      <Card className="p-4 border-border bg-card shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by batch #, plan #, product name, or SKU..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
              data-testid="input-batch-search"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              data-testid="select-department-filter"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              data-testid="select-status-filter"
            >
              <option value="">All Statuses</option>
              {EXECUTION_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st.replace(/_/g, " ")}
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

      {/* 2. Results Table */}
      {isLoading ? (
        <LoadingState message="Loading batches in flight..." />
      ) : isError ? (
        <ErrorState
          error={error instanceof Error ? error : new Error("Failed to load batches")}
          retry={() => refetch()}
        />
      ) : batches.length === 0 ? (
        <EmptyState
          title="No batches found"
          description="Try adjusting your search query, department, or status filters."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setSelectedDept("");
                setSelectedStatus("");
                setPage(1);
              }}
            >
              Clear Filters
            </Button>
          }
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
                  <th className="px-4 py-3 font-semibold">Department</th>
                  <th className="px-4 py-3 font-semibold text-center">Stage</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Received</th>
                  <th className="px-4 py-3 font-semibold text-right">WIP Qty</th>
                  <th className="px-4 py-3 font-semibold text-right">Duration</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batches.map((batch) => (
                  <tr
                    key={batch.id}
                    className="hover:bg-muted/30 transition-colors"
                    data-testid={`batch-row-${batch.batchNumber}`}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-foreground">
                      {batch.batchNumber}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {batch.productionPlanNumber || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{batch.productName || "—"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{batch.productCode}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{batch.departmentName}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-muted font-mono text-xs font-semibold text-foreground">
                        {batch.stageSequenceNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={batch.status as AnyStatus} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {batch.receivedQty}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                      {batch.wipQuantity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                      {formatDuration(batch.currentStageDurationSeconds)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => onSelectBatch && onSelectBatch(batch.id, "detail")}
                          title="View Batch Details & Timeline"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Detail
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs text-primary border-primary/30 hover:bg-primary/10"
                          onClick={() => onSelectBatch && onSelectBatch(batch.id, "genealogy")}
                          title="View Genealogy Lineage"
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
              <span className="font-semibold text-foreground">{total}</span> batches
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
