"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Factory,
  RefreshCw,
  Calendar,
  Layers,
  Boxes,
  Cpu,
  PackageCheck,
  User,
  Check,
  Activity
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button, Card } from "@synergy/ui";
import { useCurrentUser } from "@/features/auth/hooks";
import {
  useProductionScheduleDetail,
  useReceiveAssignment,
  useDecideHandover
} from "@/features/production/execution-hooks";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { showToast } from "@/components/toast-store";
import type { ScheduleBatchDetail, TaskMaterialAssignment } from "@/features/production/types";

export default function ProductionScheduleExecutionDetail() {
  const params = useParams();
  const planId = params?.planId as string;

  const { data: user, isLoading: isLoadingUser } = useCurrentUser();

  // Role and department resolution
  const isManagerOrAdmin = useMemo(() => {
    if (!user) return false;
    const roleKey = String(user.roleDefinition?.key || user.role || "")
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    const allowed = [
      "admin",
      "system_admin",
      "super_admin",
      "plant_manager",
      "operations_manager",
      "production_manager",
      "store_manager",
      "storemanager",
      "inventory_manager"
    ];
    if (allowed.includes(roleKey)) return true;
    return (user.roles ?? []).some((r) =>
      allowed.includes(String(r.key || r.name).toLowerCase().replace(/[\s-]+/g, "_"))
    );
  }, [user]);

  const userDepartmentId = user?.assignedDepartmentId || "";

  // Schedule detail query
  const {
    data: schedule,
    isLoading: isLoadingSchedule,
    isError,
    error,
    refetch,
    isFetching
  } = useProductionScheduleDetail(planId);

  // Active tab state
  const [activeTab, setActiveTab] = useState<"departments" | "progress" | "materials" | "assembly">("departments");

  const isAssemblyUser = useMemo(() => {
    return Boolean(
      user?.isAssemblyDepartment ||
      user?.assignedDepartment?.isAssembly ||
      /assembly/i.test(user?.department || "") ||
      /assembly/i.test(user?.assignedDepartment?.name || "") ||
      (userDepartmentId && schedule?.route?.assemblyDepartment?.id === userDepartmentId)
    );
  }, [user, userDepartmentId, schedule?.route?.assemblyDepartment?.id]);

  useEffect(() => {
    if (isAssemblyUser) {
      setActiveTab("assembly");
    }
  }, [isAssemblyUser]);

  const [refusalReason, setRefusalReason] = useState("");
  const [activeHandoverRefusalId, setActiveHandoverRefusalId] = useState<string | null>(null);

  // Mutations
  const receiveAssignmentMutation = useReceiveAssignment();
  const decideHandoverMutation = useDecideHandover();

  // Quantities & Summary
  const plannedQty = Number(schedule?.quantity || 0);
  const completedQty = Number(schedule?.completedQuantity || 0);
  const uomSymbol = schedule?.quantityUom?.symbol || schedule?.quantityUom?.name || "units";
  const overallProgress = plannedQty > 0 ? Math.min(100, Math.round((completedQty / plannedQty) * 100)) : 0;

  // Department Batches sorted in pipeline order
  const batches: ScheduleBatchDetail[] = useMemo(() => {
    if (!schedule?.batches) return [];
    return [...schedule.batches].sort((a, b) => {
      const branchComp = (a.routeStep?.branchKey || "").localeCompare(b.routeStep?.branchKey || "");
      if (branchComp !== 0) return branchComp;
      return (a.routeStep?.stepOrder ?? 0) - (b.routeStep?.stepOrder ?? 0);
    });
  }, [schedule?.batches]);

  // Group batches by route branch for clean route layout
  const branchGroups = useMemo(() => {
    const map = new Map<string, ScheduleBatchDetail[]>();
    for (const b of batches) {
      const key = b.routeStep?.branchKey || "Main Route";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return Array.from(map.entries()).map(([branchKey, branchBatches]) => ({
      branchKey,
      batches: branchBatches.sort((a, b) => (a.routeStep?.stepOrder ?? 0) - (b.routeStep?.stepOrder ?? 0))
    }));
  }, [batches]);

  // Total WIP across all visible batches
  const totalWip = useMemo(() => {
    return batches.reduce((sum, b) => {
      const exp = Number(b.expectedOutputQty || b.received_qty || 0);
      const done = Number(b.completed_qty || 0);
      return sum + Math.max(0, exp - done);
    }, 0);
  }, [batches]);

  // Total Losses/Scrap across batches
  const totalLosses = useMemo(() => {
    return batches.reduce((sum, b) => {
      return (
        sum +
        Number(b.scrap_qty || 0) +
        Number(b.rejected_qty || 0) +
        Number(b.wastage_qty || 0)
      );
    }, 0);
  }, [batches]);

  // Buildable complete kits for Assembly
  const buildableKits = useMemo(() => {
    if (!schedule?.assemblyIntakeRequirements || schedule.assemblyIntakeRequirements.length === 0) return 0;
    const kitsPerReq = schedule.assemblyIntakeRequirements.map((item) => {
      const available = Number(item.acceptedQty) - Number(item.allocatedQty);
      const reqPerUnit = Number(item.requiredPerUnit);
      if (reqPerUnit <= 0) return 0;
      return Math.floor(available / reqPerUnit);
    });
    return Math.max(0, Math.min(...kitsPerReq));
  }, [schedule?.assemblyIntakeRequirements]);

  // Handover acceptance / refusal for Assembly intake
  const handleDecideHandover = (handoverId: string, status: "ACCEPTED" | "REFUSED") => {
    if (status === "REFUSED" && !refusalReason.trim()) {
      showToast({
        kind: "error",
        title: "Reason Required",
        message: "Please enter a reason for refusing this handover."
      });
      return;
    }

    decideHandoverMutation.mutate(
      {
        handoverId,
        status,
        refusalReason: status === "REFUSED" ? refusalReason.trim() : undefined,
        idempotencyKey: `${status}:${handoverId}:${Date.now()}`
      },
      {
        onSuccess: () => {
          refetch();
          setActiveHandoverRefusalId(null);
          setRefusalReason("");
        }
      }
    );
  };

  if (isLoadingUser || (isLoadingSchedule && !schedule)) {
    return <LoadingState message="Loading production schedule & department stages..." />;
  }

  if (isError || !schedule) {
    return <ErrorState error={(error as Error) || new Error("Schedule not found")} retry={() => refetch()} />;
  }

  const scheduleDateFormatted = schedule.scheduleDate
    ? format(parseISO(schedule.scheduleDate), "dd MMM yyyy")
    : "Unscheduled";

  return (
    <div className="w-full min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 pb-20">
      {/* ── 1. Top Breadcrumbs & Header ─────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Link
              href="/production/execution"
              className="hover:text-primary transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Production Execution</span>
            </Link>
            <span>/</span>
            <span className="font-mono font-bold text-foreground bg-muted px-2 py-0.5 rounded border border-border">
              {schedule.planNumber}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8.5 w-8.5 p-0 shadow-none rounded-lg bg-card border-border/80 text-muted-foreground hover:text-foreground"
            title="Refresh Plan Details"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-primary" : ""}`} />
          </Button>
        </div>

        {/* Title, Product & Badges */}
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {schedule.product?.name || "Product Name"}
            </h1>
            <StatusBadge status={schedule.status as any} />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1 font-medium">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              Schedule Date: <strong className="text-foreground">{scheduleDateFormatted}</strong>
            </span>
            <span>·</span>
            <span className="uppercase font-semibold tracking-wider text-[11px] text-foreground bg-muted px-2 py-0.5 rounded border border-border">
              {schedule.shift || "Day"} Shift
            </span>
            <span>·</span>
            <span>
              Target: <strong className="text-foreground font-mono">{plannedQty.toLocaleString()} {uomSymbol}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. Metric Overview Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Planned Target Output */}
        <div className="rounded-xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs hover:border-primary/40 hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Target Quantity
            </span>
            <div className="h-9 w-9 rounded-xl bg-muted text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <Boxes size={18} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-extrabold text-foreground tracking-tight">
              {plannedQty.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">{uomSymbol}</span>
          </div>
        </div>

        {/* Metric 2: Completed Good Output */}
        <div className="rounded-xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs hover:border-primary/40 hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Completed Good Output
            </span>
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <PackageCheck size={18} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-extrabold text-emerald-700 dark:text-emerald-400 tracking-tight">
              {completedQty.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">{uomSymbol} ({overallProgress}%)</span>
          </div>
        </div>

        {/* Metric 3: Active Floor WIP */}
        <div className="rounded-xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs hover:border-primary/40 hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Active Floor WIP
            </span>
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
              <Cpu size={18} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-extrabold text-primary tracking-tight">
              {totalWip.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">{uomSymbol} remaining</span>
          </div>
        </div>

        {/* Metric 4: Assembly Readiness */}
        <div className="rounded-xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs hover:border-primary/40 hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Assembly Complete Kits
            </span>
            <div className="h-9 w-9 rounded-xl bg-muted text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <Factory size={18} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-extrabold text-foreground tracking-tight">
              {buildableKits.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">kits ready</span>
          </div>
        </div>
      </div>

      {/* ── 3. Navigation Tabs ─────────────────────────────────────────────────── */}
      <div className="border-b border-border">
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("departments")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "departments"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Department Stages ({batches.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("progress")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "progress"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>Overall Completion &amp; Floor Status</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("materials")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "materials"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Boxes className="h-4 w-4" />
            <span>Inventory Allotments ({schedule.taskMaterialAssignments?.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("assembly")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "assembly"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Factory className="h-4 w-4" />
            <span>Assembly Intake &amp; Waves ({schedule.assemblyIntakeRequirements?.length || 0})</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: Department Stages & Floor Tasks ─────────────────────────────── */}
      {activeTab === "departments" && (
        <div className="space-y-6">

          {batches.length === 0 ? (
            <Card className="rounded-xl border border-border/80 bg-card p-10 text-center shadow-xs">
              <Layers className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-bold text-foreground">No Department Stages Visible</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                No active stages were assigned to your department for this schedule, or stages are direct assembly.
              </p>
            </Card>
          ) : (
            <div className="space-y-6">
              {branchGroups.map((group, groupIdx) => (
                <div key={group.branchKey} className="space-y-3">
                  {/* Route Branch Header */}
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary text-[11px] font-bold">
                      {groupIdx + 1}
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      {group.branchKey}
                    </h3>
                    <span className="text-[11px] text-muted-foreground font-medium">
                      • {group.batches.length} {group.batches.length === 1 ? "Stage" : "Stages in Route"}
                    </span>
                  </div>

                  {/* Cards Grid for this Route */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
                    {group.batches.map((batch) => {
                      const recQty = Number(batch.received_qty || 0);
                      const compQty = Number(batch.completed_qty || 0);
                      const expQty = Number(batch.expectedOutputQty || recQty || 0);
                      const pndQty = Math.max(0, expQty - compQty);
                      const scrapQty = Number(batch.scrap_qty || 0);
                      const unitName = batch.outputUnitName || uomSymbol;
                      const batchProgress = expQty > 0 ? Math.min(100, Math.round((compQty / expQty) * 100)) : 0;
                      const assignedEmp = batch.workerAssignments?.[0]?.employee;

                      return (
                        <Link
                          key={batch.id}
                          href={`/production/execution/${batch.id}`}
                          className="group flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-all hover:border-primary/60 hover:shadow-sm"
                        >
                          <div className="space-y-3.5">
                            {/* Card Header: Batch Number & Status */}
                            <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
                              <span className="font-mono text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                                {batch.batchNumber}
                              </span>
                              <StatusBadge status={batch.status as any} />
                            </div>

                            {/* Department & Sub-department (Operation) */}
                            <div>
                              <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                                {batch.department?.name || "Department"}
                              </h4>
                              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                                {batch.routeStep?.stepName || "Production Operation"}
                              </p>
                            </div>

                            {/* Produced Component Pill */}
                            <div className="rounded-lg bg-muted/40 border border-border/60 p-2 space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                                Producing Component
                              </span>
                              <div className="flex items-baseline justify-between gap-1.5">
                                <span className="font-bold text-xs text-foreground truncate" title={(batch as any).outputItemName || schedule.product?.name}>
                                  {(batch as any).outputItemName || schedule.product?.name || 'Component Output'}
                                </span>
                                {(batch as any).outputItemCode && (
                                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">{(batch as any).outputItemCode}</span>
                                )}
                              </div>
                            </div>

                            {/* Clean Stage Progress Component */}
                            <div className="rounded-lg bg-muted/30 border border-border/60 p-2.5 space-y-1.5">
                              <div className="flex items-center justify-between text-xs font-semibold">
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                  Output
                                </span>
                                <span className="font-mono text-xs font-bold text-foreground">
                                  {compQty.toLocaleString()} / {expQty.toLocaleString()} {unitName}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      batchProgress === 100 ? "bg-emerald-500" : "bg-primary"
                                    }`}
                                    style={{ width: `${batchProgress}%` }}
                                  />
                                </div>
                                <span className="font-mono text-[10px] font-bold text-muted-foreground w-7 text-right">
                                  {batchProgress}%
                                </span>
                              </div>
                            </div>

                            {/* Sub-Metrics Grid */}
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="rounded-lg bg-muted/20 border border-border/60 p-2">
                                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Received</p>
                                <p className="font-mono text-xs font-bold text-foreground mt-0.5">
                                  {recQty.toLocaleString()}
                                </p>
                              </div>

                              <div className="rounded-lg bg-muted/20 border border-border/60 p-2">
                                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Remaining WIP</p>
                                <p className="font-mono text-xs font-bold text-primary mt-0.5">
                                  {pndQty.toLocaleString()}
                                </p>
                              </div>

                              <div className="rounded-lg bg-muted/20 border border-border/60 p-2">
                                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Scrap / Loss</p>
                                <p className="font-mono text-xs font-bold text-rose-700 dark:text-rose-400 mt-0.5">
                                  {scrapQty.toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Operator Incharge */}
                          <div className="mt-3.5 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/60 pt-2.5">
                            <div className="flex items-center gap-1.5 truncate">
                              <User className="h-3 w-3 text-muted-foreground shrink-0" />
                              {assignedEmp ? (
                                <span className="truncate">
                                  Incharge: <strong className="text-foreground">{assignedEmp.firstName} {assignedEmp.lastName}</strong>
                                </span>
                              ) : (
                                <span className="italic text-muted-foreground">
                                  Unassigned Operator
                                </span>
                              )}
                            </div>

                            {batch.availableToSend > 0 ? (
                              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 whitespace-nowrap">
                                {batch.availableToSend} ready
                              </span>
                            ) : batch.outgoingHandovers?.some((h) => h.status === "PROPOSED") ? (
                              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 whitespace-nowrap">
                                Handover Dispatched
                              </span>
                            ) : null}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: Overall Schedule Completion & Department Live Status ───────── */}
      {activeTab === "progress" && (
        <div className="space-y-6">
          {/* 1. Schedule Completion Master Overview */}
          <Card className="rounded-xl border border-border/80 bg-card p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-3.5">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <span>Overall Schedule Completion Overview</span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Aggregate execution metrics across all parallel and sequential department workstations.
                </p>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-3xl font-extrabold text-primary">
                  {overallProgress}%
                </span>
                <span className="text-xs text-muted-foreground font-semibold">Total Completed</span>
              </div>
            </div>

            {/* Progress Bar Track */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-muted-foreground">
                  Completed Output: <strong className="text-foreground font-mono">{completedQty.toLocaleString()} {uomSymbol}</strong>
                </span>
                <span className="text-muted-foreground">
                  Planned Target: <strong className="text-foreground font-mono">{plannedQty.toLocaleString()} {uomSymbol}</strong>
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>

            {/* Volume Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="rounded-lg bg-muted/20 border border-border/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Completed Finished Goods</p>
                <p className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                  {completedQty.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">{uomSymbol}</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Fully inspected &amp; approved</p>
              </div>

              <div className="rounded-lg bg-muted/20 border border-border/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Remaining To Produce</p>
                <p className="font-mono text-base font-bold text-foreground mt-1">
                  {Math.max(0, plannedQty - completedQty).toLocaleString()} <span className="text-xs text-muted-foreground font-normal">{uomSymbol}</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Yet to complete</p>
              </div>

              <div className="rounded-lg bg-muted/20 border border-border/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Department Workstations</p>
                <p className="font-mono text-base font-bold text-primary mt-1">
                  {batches.length} <span className="text-xs text-muted-foreground font-normal">Stages</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {batches.filter((b) => b.status === "COMPLETED").length} completed · {batches.filter((b) => b.status === "IN_PROGRESS" || b.status === "RECEIVED").length} active
                </p>
              </div>

              <div className="rounded-lg bg-muted/20 border border-border/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Scrap / Loss Reported</p>
                <p className="font-mono text-base font-bold text-rose-700 dark:text-rose-400 mt-1">
                  {totalLosses.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">units</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Recorded scrap &amp; defects</p>
              </div>
            </div>
          </Card>

          {/* 2. Detailed Department Floor Execution & Delivery Matrix */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Department Workload &amp; Delivery Matrix
              </h3>
              <p className="text-xs text-muted-foreground">
                Stage outputs, destination delivery departments, and real-time WIP custody on the shop floor.
              </p>
            </div>

            <Card className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground font-semibold">
                    <tr>
                      <th className="p-3.5">Department &amp; Stage</th>
                      <th className="p-3.5">Produced Output</th>
                      <th className="p-3.5">Deliver To (Destination)</th>
                      <th className="p-3.5 min-w-[190px]">WIP Progress &amp; Custody</th>
                      <th className="p-3.5">Floor Status</th>
                      <th className="p-3.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {batches.map((batch) => {
                      const recQty = Number(batch.received_qty || 0);
                      const compQty = Number(batch.completed_qty || 0);
                      const expQty = Number(batch.expectedOutputQty || recQty || 0);
                      const pndQty = Math.max(0, expQty - compQty);
                      const scrapQty = Number(batch.scrap_qty || 0);
                      const assignedEmp = batch.workerAssignments?.[0]?.employee;
                      const batchUnit = batch.outputUnitName || uomSymbol;
                      const progressPercent = expQty > 0 ? Math.min(100, Math.round((compQty / expQty) * 100)) : 0;

                      // Delivery destination resolution
                      const destinationDeptName =
                        batch.destinationDepartmentName ||
                        (schedule.route?.steps?.find((s: any) => s.id === batch.routeStep?.parentStepId || s.parentStepId === batch.routeStepId)?.department?.name) ||
                        schedule.route?.assemblyDepartment?.name ||
                        "Assembly Department";
                      const isAssembly =
                        destinationDeptName.toLowerCase().includes("assembly") ||
                        batch.destinationDepartmentId === (schedule.route as any)?.assemblyDepartmentId ||
                        !(batch.routeStep as any)?.nextDepartmentId;

                      const isWorking = batch.status === "IN_PROGRESS" || batch.status === "RECEIVED";
                      const isFree = batch.status === "PENDING";
                      const isAwaiting = batch.status === "AWAITING_RECEIPT";
                      const isDone = batch.status === "COMPLETED";

                      return (
                        <tr key={batch.id} className="hover:bg-muted/20 transition-colors">
                          {/* 1. Department & Stage */}
                          <td className="p-3.5">
                            <div className="font-bold text-foreground text-xs">
                              {batch.department?.name || "Department"}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {batch.routeStep?.stepName || "Stage"} · <span className="font-medium text-foreground">{batch.routeStep?.branchKey || "Main Route"}</span>
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                              {batch.batchNumber}
                            </div>
                          </td>

                          {/* 2. Produced Output */}
                          <td className="p-3.5">
                            <div className="font-bold text-foreground text-xs">
                              {(batch as any).outputItemName || schedule.product?.name || "Target Component"}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
                              Target: <strong className="font-mono text-foreground">{expQty.toLocaleString()} {batchUnit}</strong>
                            </div>
                            {(batch as any).outputItemCode && (
                              <span className="font-mono text-[10px] text-muted-foreground block mt-0.5">
                                {(batch as any).outputItemCode}
                              </span>
                            )}
                          </td>

                          {/* 3. Deliver To (Destination Department) */}
                          <td className="p-3.5">
                            <div className="flex items-start gap-1.5">
                              <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold text-foreground text-xs block">
                                  {destinationDeptName}
                                </span>
                                {isAssembly ? (
                                  <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                    Final Assembly · FG Gate
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                                    Next Stage Handoff
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 4. WIP Progress & Custody */}
                          <td className="p-3.5">
                            <div className="space-y-1.5 min-w-[170px]">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-mono font-bold text-foreground">
                                  {compQty.toLocaleString()} / {expQty.toLocaleString()} <span className="font-normal text-muted-foreground">{batchUnit}</span>
                                </span>
                                <span className={`font-mono font-bold ${progressPercent === 100 ? "text-emerald-700 dark:text-emerald-400" : "text-primary"}`}>
                                  {progressPercent}%
                                </span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    progressPercent === 100 ? "bg-emerald-500" : "bg-primary"
                                  }`}
                                  style={{ width: `${progressPercent}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                                <span>
                                  Floor WIP: <strong className="font-mono font-semibold text-foreground">{pndQty.toLocaleString()} {batchUnit}</strong>
                                </span>
                                {scrapQty > 0 && (
                                  <span className="font-bold text-rose-700 dark:text-rose-400">
                                    {scrapQty.toLocaleString()} scrap
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 5. Floor Status & Operator */}
                          <td className="p-3.5">
                            <div>
                              {isWorking && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 text-[11px] font-bold border border-emerald-500/20">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Working Now
                                </span>
                              )}
                              {isFree && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[11px] font-semibold border border-border">
                                  Free / Queued
                                </span>
                              )}
                              {isAwaiting && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2.5 py-0.5 text-[11px] font-bold border border-amber-500/20">
                                  Awaiting Receipt
                                </span>
                              )}
                              {isDone && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-bold border border-primary/20">
                                  Completed
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1.5">
                              <User className="h-3 w-3 shrink-0" />
                              {assignedEmp ? (
                                <span className="font-medium text-foreground truncate max-w-[130px]" title={`${assignedEmp.firstName} ${assignedEmp.lastName}`}>
                                  {assignedEmp.firstName} {assignedEmp.lastName}
                                </span>
                              ) : (
                                <span className="italic text-muted-foreground">Unassigned</span>
                              )}
                            </div>
                          </td>

                          {/* 6. Action */}
                          <td className="p-3.5 text-center">
                            <Link
                              href={`/production/execution/${batch.id}`}
                              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all border border-primary/20 whitespace-nowrap"
                            >
                              <span>Workstation</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── TAB 3: Inventory Allotments & Material Issues ──────────────────────── */}
      {activeTab === "materials" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Assigned Raw Material Stock &amp; Inventory Issues
            </h2>
            <p className="text-xs text-muted-foreground">
              Each raw material issue posted from the inventory store to departments for this schedule.
            </p>
          </div>

          {(!schedule.taskMaterialAssignments || schedule.taskMaterialAssignments.length === 0) ? (
            <Card className="rounded-xl border border-border/80 bg-card p-10 text-center shadow-xs">
              <Boxes className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-bold text-foreground">No Material Assignments Found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No inventory material allocations have been issued for this production schedule.
              </p>
            </Card>
          ) : (
            <Card className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground font-semibold">
                    <tr>
                      <th className="p-3.5">Material Name</th>
                      <th className="p-3.5">Destination Department</th>
                      <th className="p-3.5">Lot #</th>
                      <th className="p-3.5 text-right">Required</th>
                      <th className="p-3.5 text-right">Issued from Store</th>
                      <th className="p-3.5 text-right">Received by Dept</th>
                      <th className="p-3.5 text-center">Status &amp; Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {schedule.taskMaterialAssignments.map((assignment: TaskMaterialAssignment) => {
                      const req = Number(assignment.requiredQty || 0);
                      const issued = Number(assignment.issuedQty || 0);
                      const received = Number(assignment.receivedQty || 0);
                      const isPendingReceipt = received < issued;
                      const canReceive = isManagerOrAdmin || (userDepartmentId && assignment.destinationDepartmentId === userDepartmentId);

                      return (
                        <tr key={assignment.id} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3.5 font-bold text-foreground">
                            {assignment.itemName}
                          </td>
                          <td className="p-3.5 font-medium text-foreground">
                            {assignment.destinationDepartmentName || "Department"}
                          </td>
                          <td className="p-3.5 font-mono text-muted-foreground">
                            {assignment.lotNumber || "—"}
                          </td>
                          <td className="p-3.5 text-right font-mono font-medium text-foreground">
                            {req.toLocaleString()} {assignment.unitName}
                          </td>
                          <td className="p-3.5 text-right font-mono font-medium text-foreground">
                            {issued.toLocaleString()} {assignment.unitName}
                          </td>
                          <td className="p-3.5 text-right font-mono font-bold text-foreground">
                            {received.toLocaleString()} {assignment.unitName}
                          </td>
                          <td className="p-3.5 text-center">
                            {isPendingReceipt ? (
                              canReceive ? (
                                <Button
                                  size="sm"
                                  onClick={() => receiveAssignmentMutation.mutate(assignment.id)}
                                  disabled={receiveAssignmentMutation.isPending}
                                  className="h-7.5 px-3 bg-primary text-primary-foreground text-xs font-semibold shadow-none"
                                >
                                  <Check className="h-3 w-3 mr-1" />
                                  <span>Receive</span>
                                </Button>
                              ) : (
                                <span className="inline-flex items-center text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                  Awaiting Receipt
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                <Check className="h-3 w-3 mr-1" /> Fully Received
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── TAB 3: Assembly Intake & Waves ──────────────────────────────────────── */}
      {activeTab === "assembly" && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Assembly Intake Requirements &amp; Waves
              </h2>
              <p className="text-xs text-muted-foreground">
                Terminal component intake feeding into the Assembly Department. Complete kits can be allocated into assembly waves.
              </p>
            </div>

            <div className="rounded-xl border border-border/80 bg-card px-4 py-2 text-right shadow-xs">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Buildable Kits</p>
              <p className="font-mono text-lg font-extrabold text-foreground">
                {buildableKits.toLocaleString()} {uomSymbol} ready
              </p>
            </div>
          </div>

          {/* Assembly waves are allocated automatically after a complete kit is received. */}
          <Card className="rounded-xl border border-border/80 bg-card p-5 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground mb-1">Automatic Assembly Allocation</h3>
            <p className="text-xs text-muted-foreground">
              Accepted department handovers and received direct materials are combined automatically. When all required inputs for a kit are accepted, an Assembly work batch is created and appears in the Assembly queue.
            </p>
          </Card>

          {/* Intake Requirements Table */}
          <Card className="rounded-xl border border-border/80 bg-card shadow-xs overflow-hidden">
            <div className="p-4 border-b border-border/80 bg-muted/20">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Intake Component Balances
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground font-semibold">
                  <tr>
                    <th className="p-3.5">Component Item</th>
                    <th className="p-3.5">Source Operation</th>
                    <th className="p-3.5 text-right">Required Per Unit</th>
                    <th className="p-3.5 text-right">Total Needed</th>
                    <th className="p-3.5 text-right">Accepted Into Assembly</th>
                    <th className="p-3.5 text-right">Unallocated Kits</th>
                    <th className="p-3.5 text-center">Incoming Handovers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {schedule.assemblyIntakeRequirements?.map((item) => {
                    const req = Number(item.requiredQty || 0);
                    const accepted = Number(item.acceptedQty || 0);
                    const allocated = Number(item.allocatedQty || 0);
                    const unallocated = Math.max(0, accepted - allocated);
                    const pendingHandovers = item.handovers?.filter((h) => h.status === "PROPOSED") || [];

                    return (
                      <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                        <td className="p-3.5 font-bold text-foreground">
                          {item.itemName}
                        </td>
                        <td className="p-3.5 font-medium text-muted-foreground">
                          {item.sourceStep ? `${item.sourceStep.department?.name || 'Department'} · ${item.sourceStep.stepName}` : "Direct Inventory Issue"}
                        </td>
                        <td className="p-3.5 text-right font-mono text-muted-foreground">
                          {item.requiredPerUnit} {item.unitName}
                        </td>
                        <td className="p-3.5 text-right font-mono font-medium text-foreground">
                          {req.toLocaleString()} {item.unitName}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-foreground">
                          {accepted.toLocaleString()} {item.unitName}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          {unallocated.toLocaleString()} {item.unitName}
                        </td>
                        <td className="p-3.5">
                          {pendingHandovers.length > 0 ? (
                            <div className="space-y-1.5">
                              {pendingHandovers.map((handover) => (
                                <div
                                  key={handover.id}
                                  className="flex items-center justify-between gap-2 p-1.5 rounded-lg border border-primary/20 bg-primary/5 text-xs"
                                >
                                  <span className="font-mono font-bold text-primary">
                                    {handover.quantity} {item.unitName}
                                  </span>

                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="sm"
                                      onClick={() => handleDecideHandover(handover.id, "ACCEPTED")}
                                      disabled={decideHandoverMutation.isPending}
                                      className="h-6 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold shadow-none"
                                    >
                                      Accept
                                    </Button>

                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        if (activeHandoverRefusalId === handover.id) {
                                          handleDecideHandover(handover.id, "REFUSED");
                                        } else {
                                          setActiveHandoverRefusalId(handover.id);
                                        }
                                      }}
                                      className="h-6 px-2 text-rose-700 dark:text-rose-400 border-rose-500/30 text-[10px] font-bold"
                                    >
                                      Refuse
                                    </Button>
                                  </div>
                                </div>
                              ))}

                              {activeHandoverRefusalId && (
                                <div className="mt-1 flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    placeholder="Enter refusal reason..."
                                    value={refusalReason}
                                    onChange={(e) => setRefusalReason(e.target.value)}
                                    className="flex-1 rounded border border-rose-500/40 bg-background px-2 py-1 text-xs"
                                  />
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-center block text-[11px]">
                              None pending
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Existing Assembly Batches */}
          {schedule.assemblyBatches && schedule.assemblyBatches.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Active Assembly Waves
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {schedule.assemblyBatches.map((wave) => (
                  <Link
                    key={wave.id}
                    href={`/production/assembly/${schedule.id}`}
                    className="flex items-center justify-between p-4 rounded-xl border border-border/80 bg-card hover:border-primary/40 transition-all shadow-xs"
                  >
                    <div>
                      <p className="font-mono text-xs font-bold text-primary">{wave.batchNumber}</p>
                      <p className="text-xs font-semibold text-foreground mt-0.5">
                        Target: {wave.targetOutputQuantity} · Finished: {wave.actualOutputQuantity}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
