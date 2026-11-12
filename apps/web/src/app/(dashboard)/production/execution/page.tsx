"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Factory,
  Search,
  RefreshCw,
  Calendar,
  Layers,
  Boxes,
  Cpu,
  PackageCheck
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button, Card } from "@plinth/ui";
import { useCurrentUser } from "@/features/auth/hooks";
import { useDepartments } from "@/hooks/useMasterData";
import { useProductionSchedules } from "@/features/production/execution-hooks";
import { StatusBadge } from "@/components/StatusBadge";
import { FilterPills } from "@/components/FilterPills";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";

export default function ProductionExecutionDashboard() {
  const { data: user, isLoading: isLoadingUser } = useCurrentUser();
  const { data: deptResponse } = useDepartments("ACTIVE");
  const departments = useMemo(
    () => deptResponse?.items ?? [],
    [deptResponse]
  );

  const isAssemblyUser = useMemo(() => {
    return Boolean(
      user?.isAssemblyDepartment ||
      user?.assignedDepartment?.isAssembly ||
      /assembly/i.test(user?.department || "") ||
      /assembly/i.test(user?.assignedDepartment?.name || "")
    );
  }, [user]);

  // RBAC resolution
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

  // Search & Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("ALL");

  // Date Filter: "TODAY" by default
  const todayStr = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const [datePreset, setDatePreset] = useState<"today" | "all" | "custom">("today");
  const [customDate, setCustomDate] = useState<string>(todayStr);

  const {
    data: schedules = [],
    isLoading: isLoadingSchedules,
    isError,
    error,
    refetch,
    isFetching
  } = useProductionSchedules(searchQuery || undefined);

  // Filtered schedules according to selected date, status, department, and search
  const filteredSchedules = useMemo(() => {
    return schedules.filter((schedule) => {
      // 1. Date filter
      if (schedule.scheduleDate) {
        const itemDateStr = schedule.scheduleDate.split("T")[0];
        if (datePreset === "today" && itemDateStr !== todayStr) {
          return false;
        }
        if (datePreset === "custom" && customDate && itemDateStr !== customDate) {
          return false;
        }
      }

      // 2. Status filter
      if (statusFilter !== "ALL" && schedule.status !== statusFilter) {
        return false;
      }

      // 3. Department filter
      if (selectedDeptFilter !== "ALL") {
        const hasDeptBatch = schedule.batches?.some(
          (b) => b.departmentId === selectedDeptFilter || b.department?.id === selectedDeptFilter
        );
        const isAssemblyDept = schedule.route?.assemblyDepartmentId === selectedDeptFilter;
        if (!hasDeptBatch && !isAssemblyDept) return false;
      }

      // 4. Client-side search fallback
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const planNo = (schedule.planNumber || "").toLowerCase();
        const prodName = (schedule.product?.name || "").toLowerCase();
        const sku = (schedule.product?.sku || "").toLowerCase();
        if (!planNo.includes(q) && !prodName.includes(q) && !sku.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [schedules, datePreset, customDate, todayStr, statusFilter, selectedDeptFilter, searchQuery]);

  // Summary Metrics calculated from all schedules for the active date filter
  const metrics = useMemo(() => {
    const totalSchedules = filteredSchedules.length;
    let inProgressCount = 0;
    let completedCount = 0;
    let totalPlannedUnits = 0;
    let totalCompletedUnits = 0;

    for (const s of filteredSchedules) {
      if (s.status === "COMPLETED") completedCount++;
      else inProgressCount++;

      totalPlannedUnits += Number(s.quantity || 0);
      totalCompletedUnits += Number(s.completedQuantity || 0);
    }

    return {
      totalSchedules,
      inProgressCount,
      completedCount,
      totalPlannedUnits,
      totalCompletedUnits
    };
  }, [filteredSchedules]);

  if (isLoadingUser || (isLoadingSchedules && !schedules.length)) {
    return <LoadingState message="Loading production execution dashboard..." />;
  }

  if (isError) {
    return <ErrorState error={error as Error} retry={() => refetch()} />;
  }

  return (
    <div className="w-full min-w-0 max-w-full min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 pb-20">
      {/* ── 1. Top Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-border-strong border-border/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Production Execution
          </h1>
        </div>

        {/* Date Filter & Calendar Controls */}
        <div className="flex items-center gap-2.5">
          <div className="inline-flex items-center rounded-lg border border-border/80 bg-card p-1 shadow-xs">
            <button
              type="button"
              onClick={() => {
                setDatePreset("today");
                setCustomDate(todayStr);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                datePreset === "today"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Today</span>
            </button>
            <button
              type="button"
              onClick={() => setDatePreset("all")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                datePreset === "all"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>All Dates ({schedules.length})</span>
            </button>
          </div>

          {/* Styled Calendar Element */}
          <div className="relative flex items-center rounded-lg border border-border/80 bg-card px-3 py-1.5 shadow-xs hover:border-primary/50 transition-colors cursor-pointer group">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors mr-2 shrink-0 pointer-events-none" />
            <input
              type="date"
              value={datePreset === "custom" ? customDate : (datePreset === "today" ? todayStr : "")}
              onChange={(e) => {
                if (e.target.value) {
                  setCustomDate(e.target.value);
                  setDatePreset("custom");
                }
              }}
              className="text-xs font-medium text-foreground bg-transparent border-none outline-none cursor-pointer"
            />
          </div>

          {/* Quick Refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8.5 w-8.5 p-0 shadow-none rounded-lg bg-card border-border/80 text-muted-foreground hover:text-foreground"
            title="Refresh Schedules"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-primary" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Assembly Department Guidance Banner */}
      {isAssemblyUser && (
        <div className="rounded-xl border border-tone-green-solid/25 bg-tone-green-bg p-4 text-tone-green-text flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tone-green-bg text-tone-green-text font-bold text-xs shrink-0">
              ASY
            </span>
            <div>
              <p className="text-xs font-bold">Assembly &amp; Convergence Workspace</p>
              <p className="text-[11px] text-tone-green-text mt-0.5">
                You are assigned to an Assembly department. Your wave dispatches, sub-assembly collections, and finished good gates are managed in Assembly &amp; Convergence.
              </p>
            </div>
          </div>
          <Link href="/production/assembly" className="shrink-0">
            <Button size="sm" className="bg-action hover:bg-[color:var(--action-primary-bg-hover)] text-inverse font-semibold text-xs shadow-none cursor-pointer">
              Go to Assembly Workspace
            </Button>
          </Link>
        </div>
      )}

      {/* ── 2. Metric Overview Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Today's Schedules */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs hover:border-border transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {datePreset === "today" ? "Today's Schedules" : "Selected Schedules"}
            </span>
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
              <Layers size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-extrabold text-foreground tracking-tight">
              {metrics.totalSchedules}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">schedules</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
            <span>Floor Active: <strong className="text-foreground font-mono">{metrics.inProgressCount}</strong></span>
            <span>Completed: <strong className="text-tone-green-text font-mono">{metrics.completedCount}</strong></span>
          </div>
        </div>

        {/* Card 2: Work In Progress (WIP) */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs hover:border-border transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Work In Progress (WIP)
            </span>
            <div className="h-9 w-9 rounded-xl bg-tone-amber-bg text-tone-amber-text border border-tone-amber-solid/25 flex items-center justify-center shrink-0">
              <Cpu size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-extrabold text-primary tracking-tight">
              {metrics.inProgressCount}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">active batches</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-border/60 text-xs text-muted-foreground">
            <span>Operating across interconnected routes</span>
          </div>
        </div>

        {/* Card 3: Scheduled Production */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs hover:border-border transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Scheduled Production
            </span>
            <div className="h-9 w-9 rounded-xl bg-tone-blue-bg text-tone-blue-text border border-tone-blue-solid/25 flex items-center justify-center shrink-0">
              <Boxes size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-extrabold text-foreground tracking-tight">
              {metrics.totalPlannedUnits.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">planned units</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-border/60 text-xs text-muted-foreground">
            <span>Target volume for current schedule date</span>
          </div>
        </div>

        {/* Card 4: Completed Output */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs hover:border-border transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Good Completed Units
            </span>
            <div className="h-9 w-9 rounded-xl bg-tone-green-bg text-tone-green-text border border-tone-green-solid/25 flex items-center justify-center shrink-0">
              <PackageCheck size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-extrabold text-tone-green-text tracking-tight">
              {metrics.totalCompletedUnits.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground font-semibold">units ready</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-border/60 text-xs text-muted-foreground">
            <span>{metrics.completedCount} schedules fully finished &amp; QC accepted</span>
          </div>
        </div>
      </div>

      {/* ── 3. Filters Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex w-full min-w-0 flex-col gap-2 border-border-strong border-border/80 pb-5 xl:flex-row xl:items-start">
        <div className="relative w-full min-w-0 xl:w-[23%] xl:shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            aria-label="Search schedules"
            placeholder="Search schedule # or product name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-card border border-border/80 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground shadow-xs"
          />
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-center gap-2 xl:flex-1 xl:flex-nowrap">
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status:</span>
          {/* Status Filter */}
          <FilterPills
            options={[
              { label: "All Statuses", value: "ALL" },
              { label: "In Progress", value: "IN_PROGRESS" },
              { label: "Released to Floor", value: "RELEASED" },
              { label: "Partial", value: "PARTIALLY_COMPLETED" },
              { label: "Completed", value: "COMPLETED" }
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
            size="sm"
            className="min-w-0 xl:flex-nowrap"
          />
        </div>

        {isManagerOrAdmin && departments.length > 0 && (
          <div className="flex w-full min-w-0 items-center gap-2 xl:w-[24%] xl:shrink-0">
            <label htmlFor="execution-department-filter" className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Department:</label>
            <select
              id="execution-department-filter"
              aria-label="Filter by department"
              value={selectedDeptFilter}
              onChange={(event) => setSelectedDeptFilter(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-border/80 bg-card px-3 text-xs font-semibold text-foreground shadow-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.isAssembly ? `${department.name} [Assembly]` : department.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── 4. Production Schedule Cards Grid (Square & Fully Clickable) ─────────── */}
      {filteredSchedules.length === 0 ? (
        <Card className="rounded-2xl border border-border/80 bg-card p-12 text-center shadow-xs">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground border border-border mb-3">
            <Factory className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-foreground">
            No Production Schedules Found
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            {datePreset === "today"
              ? "There are no production schedules scheduled for today. You can select 'All Dates' or pick a date in the calendar above."
              : "No schedules match your current filter and search query."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {datePreset !== "all" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDatePreset("all")}
                className="text-xs font-semibold"
              >
                View All Dates
              </Button>
            )}
            <Link href="/production/planning/new">
              <Button size="sm" className="text-xs font-semibold">
                Create Production Schedule
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSchedules.map((schedule) => {
            const plannedQty = Number(schedule.quantity || 0);
            const uomSymbol = schedule.quantityUom?.symbol || schedule.quantityUom?.name || "units";

            const scheduleDateFormatted = schedule.scheduleDate
              ? format(parseISO(schedule.scheduleDate), "dd MMM yyyy")
              : "Unscheduled";

            // Department pipeline list
            const batches = schedule.batches || [];
            const sortedBatches = [...batches].sort(
              (a, b) => (a.routeStep?.stepOrder ?? 0) - (b.routeStep?.stepOrder ?? 0)
            );

            // Compute WIP remaining
            const totalPendingWip = batches.reduce((sum, b) => {
              const expected = Number(b.expectedOutputQty || 0);
              const done = Number(b.completed_qty || 0);
              return sum + Math.max(0, expected - done);
            }, 0);

            return (
              <Link
                key={schedule.id}
                href={`/production/execution/plans/${schedule.id}`}
                className="group block focus:outline-none h-full"
              >
                <Card className="h-full flex flex-col justify-between overflow-hidden rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-all hover:border-primary/60 hover:shadow-none cursor-pointer">
                  <div className="space-y-3.5">
                    {/* Card Header: Schedule Number, Status, and Date in top right */}
                    <div className="flex items-start justify-between gap-2 border-border-strong border-border/60 pb-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-foreground">
                            {schedule.planNumber}
                          </span>
                          <StatusBadge status={schedule.status as any} />
                        </div>
                        {schedule.shift && (
                          <div className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                            {schedule.shift} Shift
                          </div>
                        )}
                      </div>

                      {/* Schedule Date in Top Right Corner */}
                      <span className="text-[11px] font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border/60 shrink-0">
                        {scheduleDateFormatted}
                      </span>
                    </div>

                    {/* Product Name & Target Volume (SKU removed) */}
                    <div>
                      <p className="text-sm font-bold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                        {schedule.product?.name || "Product Name"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground font-medium">
                        Target: <strong className="font-mono text-foreground">{plannedQty.toLocaleString()} {uomSymbol}</strong>
                      </p>
                    </div>

                    {/* Department Sequential Pipeline Flow */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Department Route Flow
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {sortedBatches.length > 0 ? (
                          sortedBatches.map((batch, idx) => {
                            const isDone = batch.status === "COMPLETE" || batch.status === "NEXT_STAGE_ACCEPTED";
                            const isActive = ["IN_PROGRESS", "RECEIVED", "ASSIGNED", "PARTIAL"].includes(batch.status);
                            const isPaused = batch.status === "PAUSED";

                            const dotColor = isDone
                              ? "bg-tone-green-solid"
                              : isActive
                              ? "bg-primary animate-pulse"
                              : isPaused
                              ? "bg-tone-amber-solid"
                              : "bg-muted-foreground/50";

                            return (
                              <span
                                key={batch.id || idx}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-foreground"
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                                <span>{batch.department?.name || `Dept ${idx + 1}`}</span>
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-[11px] italic text-muted-foreground">
                            Direct Assembly / Single Stage
                          </span>
                        )}

                        <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                          <span>→ Assembly</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 3 Clean Sub-Category Data Points */}
                  <div className="mt-4 pt-3 border-t border-border/60 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted/30 border border-border/60 p-2">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Departments</p>
                      <p className="font-mono text-xs font-bold text-foreground mt-0.5">
                        {batches.length} stages
                      </p>
                    </div>

                    <div className="rounded-lg bg-muted/30 border border-border/60 p-2">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Active WIP</p>
                      <p className="font-mono text-xs font-bold text-primary mt-0.5">
                        {totalPendingWip.toLocaleString()} {uomSymbol}
                      </p>
                    </div>

                    <div className="rounded-lg bg-muted/30 border border-border/60 p-2">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Assembly</p>
                      <p className="font-mono text-xs font-bold text-tone-green-text mt-0.5">
                        {schedule.buildableQuantity ?? 0} ready
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
