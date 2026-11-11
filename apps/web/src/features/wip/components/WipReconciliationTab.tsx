"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  Play,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Card, Button } from "@plinth/ui";
import { StatusBadge, type AnyStatus } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import type { WipExceptionStatus, WipExceptionSeverity, WipExceptionType } from "@plinth/types";
import {
  useWipExceptions,
  useRunReconciliation,
  useInvestigateException,
  useResolveException,
  useDismissException
} from "../hooks";
import type { WipReconciliationExceptionDto } from "../types";

interface WipReconciliationTabProps {
  onSelectBatch?: (batchId: string) => void;
}

export function WipReconciliationTab({ onSelectBatch }: WipReconciliationTabProps) {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const limit = 15;

  // Selected exception for action modal
  const [actionModal, setActionModal] = useState<{
    type: "investigate" | "resolve" | "dismiss";
    exception: WipReconciliationExceptionDto;
  } | null>(null);
  const [actionNotes, setActionNotes] = useState("");

  const { data: response, isLoading, isError, error, refetch, isFetching } = useWipExceptions({
    status: (statusFilter as WipExceptionStatus) || undefined,
    severity: (severityFilter as WipExceptionSeverity) || undefined,
    exceptionType: (typeFilter as WipExceptionType) || undefined,
    page,
    limit
  });

  const exceptions = Array.isArray(response)
    ? response
    : response?.items || [];
  const total = Array.isArray(response)
    ? response.length
    : response?.total || exceptions.length;
  const totalPages = Math.ceil(total / limit) || 1;

  const runReconcileMutation = useRunReconciliation();
  const investigateMutation = useInvestigateException();
  const resolveMutation = useResolveException();
  const dismissMutation = useDismissException();

  const handleRunReconciliation = async () => {
    try {
      await runReconcileMutation.mutateAsync({});
      refetch();
    } catch (err) {
      console.error("Reconciliation run error:", err);
    }
  };

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionModal) return;

    try {
      if (actionModal.type === "investigate") {
        await investigateMutation.mutateAsync({
          id: actionModal.exception.id,
          notes: actionNotes.trim() || undefined
        });
      } else if (actionModal.type === "resolve") {
        if (!actionNotes.trim() || actionNotes.trim().length < 3) return;
        await resolveMutation.mutateAsync({
          id: actionModal.exception.id,
          resolutionNotes: actionNotes.trim()
        });
      } else if (actionModal.type === "dismiss") {
        if (!actionNotes.trim() || actionNotes.trim().length < 3) return;
        await dismissMutation.mutateAsync({
          id: actionModal.exception.id,
          resolutionNotes: actionNotes.trim()
        });
      }

      setActionModal(null);
      setActionNotes("");
      refetch();
    } catch (err) {
      console.error("Action error:", err);
    }
  };

  return (
    <div className="space-y-4" data-testid="wip-reconciliation-tab">
      {/* 1. Toolbar & Action Card */}
      <Card className="p-4 border-border bg-card shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">WIP Data Reconciliation & Anomaly Engine</h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleRunReconciliation}
              disabled={runReconcileMutation.isPending}
              className="bg-primary text-primary-foreground text-xs h-9"
              data-testid="btn-run-reconciliation"
            >
              <Play className={`h-3.5 w-3.5 mr-1.5 ${runReconcileMutation.isPending ? "animate-spin" : ""}`} />
              {runReconcileMutation.isPending ? "Scanning Stream..." : "Run Reconcile Scan"}
            </Button>

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

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground focus:outline-none"
            data-testid="select-exception-status"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open Anomalies</option>
            <option value="INVESTIGATING">Under Investigation</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground focus:outline-none"
            data-testid="select-exception-severity"
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground focus:outline-none"
            data-testid="select-exception-type"
          >
            <option value="">All Anomaly Types</option>
            <option value="DOUBLE_PRESENCE">Double Presence</option>
            <option value="NEGATIVE_QUANTITY">Negative Quantity</option>
            <option value="CONSERVATION_MISMATCH">Conservation Mismatch</option>
            <option value="BROKEN_GENEALOGY_CHAIN">Broken Genealogy Chain</option>
          </select>
        </div>
      </Card>

      {/* 2. Exception Table */}
      {isLoading ? (
        <LoadingState message="Loading reconciliation exceptions..." />
      ) : isError ? (
        <ErrorState
          error={error instanceof Error ? error : new Error("Failed to load reconciliation exceptions")}
          retry={() => refetch()}
        />
      ) : exceptions.length === 0 ? (
        <EmptyState
          title="No reconciliation exceptions found"
          description="The event stream is consistent. Click 'Run Reconcile Scan' to re-verify shop-floor invariants."
        />
      ) : (
        <Card className="overflow-hidden border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/50 text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-semibold">Detected At</th>
                  <th className="px-4 py-3 font-semibold">Batch</th>
                  <th className="px-4 py-3 font-semibold">Anomaly Type</th>
                  <th className="px-4 py-3 font-semibold">Severity</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Description</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {exceptions.map((ex) => (
                  <tr
                    key={ex.id}
                    className="hover:bg-muted/30 transition-colors"
                    data-testid={`exception-row-${ex.id}`}
                  >
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {new Date(ex.detectedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {onSelectBatch && ex.batchId ? (
                        <button
                          onClick={() => onSelectBatch(ex.batchId)}
                          className="font-mono font-bold text-primary hover:underline text-left"
                        >
                          {ex.batchNumber || "—"}
                        </button>
                      ) : (
                        <span className="font-mono font-bold text-foreground">{ex.batchNumber || "—"}</span>
                      )}
                      {ex.departmentName && (
                        <div className="text-[10px] text-muted-foreground">{ex.departmentName}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-xs">
                      <span className="px-2 py-0.5 rounded bg-muted font-mono text-[11px] text-foreground">
                        {ex.exceptionType.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ex.severity as AnyStatus} className="text-[10px]" />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ex.status as AnyStatus} className="text-[10px]" />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-sm">
                      <p className="truncate" title={ex.description}>
                        {ex.description}
                      </p>
                      {ex.resolutionNotes && (
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 italic">
                          Resolution: {ex.resolutionNotes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {ex.status === "OPEN" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              setActionModal({ type: "investigate", exception: ex });
                              setActionNotes("");
                            }}
                            data-testid={`btn-investigate-${ex.id}`}
                          >
                            Investigate
                          </Button>
                        )}

                        {(ex.status === "OPEN" || ex.status === "INVESTIGATING") && (
                          <>
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => {
                                setActionModal({ type: "resolve", exception: ex });
                                setActionNotes("");
                              }}
                              data-testid={`btn-resolve-${ex.id}`}
                            >
                              Resolve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setActionModal({ type: "dismiss", exception: ex });
                                setActionNotes("");
                              }}
                              data-testid={`btn-dismiss-${ex.id}`}
                            >
                              Dismiss
                            </Button>
                          </>
                        )}
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
              Showing <span className="font-semibold text-foreground">{exceptions.length}</span> of{" "}
              <span className="font-semibold text-foreground">{total}</span> exceptions
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

      {/* 3. Action Modal / Dialog */}
      {actionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          data-testid="exception-action-modal"
        >
          <Card className="w-full max-w-md p-6 bg-card border-border shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="text-base font-bold text-foreground">
                {actionModal.type === "investigate" && "Investigate Anomaly"}
                {actionModal.type === "resolve" && "Resolve Exception"}
                {actionModal.type === "dismiss" && "Dismiss Exception"}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setActionModal(null)}
              >
                ✕
              </Button>
            </div>

            <div className="text-xs space-y-2">
              <p>
                <strong>Batch:</strong> {actionModal.exception.batchNumber}
              </p>
              <p>
                <strong>Anomaly:</strong> {actionModal.exception.exceptionType.replace(/_/g, " ")}
              </p>
              <p className="text-muted-foreground">{actionModal.exception.description}</p>
            </div>

            <form onSubmit={handleActionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  {actionModal.type === "investigate" && "Investigation Notes (Optional):"}
                  {actionModal.type === "resolve" && "Resolution Notes (Required):"}
                  {actionModal.type === "dismiss" && "Reason for Dismissal (Required):"}
                </label>
                <textarea
                  rows={3}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder={
                    actionModal.type === "resolve"
                      ? "Explain what root cause was identified and how data consistency is assured..."
                      : "Add investigation notes or rationale..."
                  }
                  required={actionModal.type !== "investigate"}
                  className="w-full p-2.5 text-xs bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  data-testid="input-action-notes"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActionModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  disabled={
                    (actionModal.type !== "investigate" && actionNotes.trim().length < 3) ||
                    investigateMutation.isPending ||
                    resolveMutation.isPending ||
                    dismissMutation.isPending
                  }
                  className="bg-primary text-primary-foreground"
                  data-testid="btn-submit-action"
                >
                  Confirm {actionModal.type.charAt(0).toUpperCase() + actionModal.type.slice(1)}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
