"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  RefreshCw,
  Factory,
  Clock,
  ShieldCheck,
  Boxes,
  Search,
  CalendarDays,
  X,
  Pencil,
  Trash2,
  Send,
} from "lucide-react";
import {
  PageHeader,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@plinth/ui";
import {
  useProductionPlans,
  useDeleteProductionPlan,
  useProductionAction,
} from "@/features/production/hooks";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { StatusBadge } from "@/components/StatusBadge";
import type { ProductionPlan } from "@/features/production/types";
import { ModuleRecommendationsPanel } from "@/features/intelligence/components/ModuleRecommendationsPanel";
import { useCurrentUser } from "@/features/auth/hooks";
import { PaginationControls } from "@/components/PaginationControls";
import { CancelProductionScheduleDialog } from "@/features/production/components/CancelProductionScheduleDialog";
const PRODUCTION_PLANS_PAGE_SIZE_KEY = "plinth-table-page-size:production-plans";
const SCHEDULE_TYPES = [
  { value: "DAY", label: "Day Shift (Standard)" },
  { value: "NIGHT", label: "Night Shift" },
  { value: "URGENT", label: "Urgent Priority Run" },
  { value: "BUFFER", label: "Buffer Stock Replenishment" },
  { value: "GROUPED", label: "Grouped Batch Run" },
  { value: "REWORK", label: "Rework / Correction" },
  { value: "CARRY_FORWARD", label: "Carry Forward from Previous Shift" },
];

export default function ProductionOverviewPage() {
  const router = useRouter();
  const deletePlanMutation = useDeleteProductionPlan();
  const releasePlanAction = useProductionAction('release');
  const { data: currentUser } = useCurrentUser();
  const isAdmin =
    ["admin", "system_admin", "super-admin", "super_admin"].includes(
      String(currentUser?.roleDefinition?.key || currentUser?.role || "").toLowerCase()
    ) ||
    (currentUser?.roles ?? []).some((role) =>
      ["admin", "super-admin", "super_admin"].includes(String(role.key || role.name).toLowerCase())
    );

  // Filter and View State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("ALL");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("ALL");
  const [selectedScheduleDate, setSelectedScheduleDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [planToDelete, setPlanToDelete] = useState<ProductionPlan | null>(null);

  useEffect(() => {
    try {
      const savedPageSize = Number(window.localStorage.getItem(PRODUCTION_PLANS_PAGE_SIZE_KEY));
      if ([10, 20, 50, 100].includes(savedPageSize)) setPageSize(savedPageSize);
    } catch {
      // Keep the default page size when browser storage is unavailable.
    }
  }, []);

  useEffect(() => setPage(1), [searchTerm, selectedTypeFilter, selectedStatusFilter, selectedScheduleDate]);

  const updatePageSize = (nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(1);
    try {
      window.localStorage.setItem(PRODUCTION_PLANS_PAGE_SIZE_KEY, String(nextPageSize));
    } catch {
      // The selected size still applies for the current view.
    }
  };

  const dateFrom = selectedScheduleDate ? new Date(`${selectedScheduleDate}T00:00:00.000Z`).toISOString() : undefined;
  const dateTo = selectedScheduleDate ? new Date(`${selectedScheduleDate}T23:59:59.999Z`).toISOString() : undefined;
  const { data, isLoading, isError, error, refetch } = useProductionPlans({
    page,
    limit: pageSize,
    search: searchTerm.trim() || undefined,
    status: selectedStatusFilter === "ALL" ? undefined : selectedStatusFilter,
    scheduleType: selectedTypeFilter === "ALL" ? undefined : selectedTypeFilter,
    scheduleDateFrom: dateFrom,
    scheduleDateTo: dateTo,
  });
  const { data: summaryData } = useProductionPlans({ page: 1, limit: 100 });
  const plans = data?.items ?? [];
  const summaryPlans = summaryData?.items ?? [];

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [data?.total, page, pageSize]);

  if (isLoading) return <LoadingState message="Loading production overview & schedules..." />;
  if (isError) return <ErrorState error={error as Error} retry={refetch} />;

  // KPIs
  const active = summaryPlans.filter((p) => ["RELEASED", "IN_PROGRESS", "PARTIALLY_COMPLETED"].includes(p.status));
  const pendingApproval = summaryPlans.filter((p) => p.status === "PENDING_APPROVAL").length;
  const completed = summaryPlans.filter((p) => p.status === "COMPLETED").length;

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Production Overview"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              onClick={() => refetch()}
              className="font-semibold shadow-none"
            >
              Refresh
            </Button>
            <Link href="/production/planning/new">
              <Button
                size="sm"
                icon={Plus}
                className="font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-none"
              >
                Schedule Run
              </Button>
            </Link>
          </div>
        }
      />

      <ModuleRecommendationsPanel module="PRODUCTION" />

      {/* 3 Consistent KPI Metric Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 w-full">
        {/* Card 1: Active Plans */}
        <Card className="border border-border/80 dark:border-border/60 bg-card shadow-none rounded-2xl p-5 hover:border-primary/40 transition-all">
          <CardContent className="p-0 flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Plans</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">{active.length}</span>
                <span className="text-xs font-medium text-muted-foreground">in progress</span>
              </div>
            </div>
            <span className="rounded-xl bg-primary/10 p-3 text-primary shrink-0">
              <Factory className="h-5 w-5" />
            </span>
          </CardContent>
        </Card>

        {/* Card 2: Awaiting Approval */}
        <Card className="border border-border/80 dark:border-border/60 bg-card shadow-none rounded-2xl p-5 hover:border-primary/40 transition-all">
          <CardContent className="p-0 flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Awaiting Approval</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">{pendingApproval}</span>
                <span className="text-xs font-medium text-muted-foreground">pending</span>
              </div>
            </div>
            <span className="rounded-xl bg-muted p-3 text-muted-foreground shrink-0">
              <Clock className="h-5 w-5" />
            </span>
          </CardContent>
        </Card>

        {/* Card 3: Completed Output */}
        <Card className="border border-border/80 dark:border-border/60 bg-card shadow-none rounded-2xl p-5 hover:border-primary/40 transition-all">
          <CardContent className="p-0 flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Completed Runs</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">{completed}</span>
                <span className="text-xs font-medium text-muted-foreground">finished</span>
              </div>
            </div>
            <span className="rounded-xl bg-primary/10 p-3 text-primary shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Production Plans Registry Card */}
      <Card className="rounded-2xl border border-border overflow-hidden shadow-none w-full bg-card">
        {/* Controls / Filter Bar */}
        <div className="p-4 sm:p-5 border-b border-border bg-card flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <h3 className="text-lg font-bold text-foreground">Current Production Plans</h3>
            <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary">
              {data?.total ?? 0} {(data?.total ?? 0) === 1 ? "Plan" : "Plans"}
            </span>
          </div>

          {/* Search and schedule filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative w-full sm:w-64 md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search plan #, product, lead..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-border bg-background outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Shift Type Dropdown */}
            <div className="w-full sm:w-auto">
              <select
                value={selectedTypeFilter}
                onChange={(e) => setSelectedTypeFilter(e.target.value)}
                className="w-full sm:w-44 py-2 px-3 text-xs font-semibold rounded-xl border border-border bg-background text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 cursor-pointer"
                aria-label="Filter by Shift"
              >
                <option value="ALL">All Shifts</option>
                {SCHEDULE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Dropdown */}
            <div className="w-full sm:w-auto">
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="w-full sm:w-44 py-2 px-3 text-xs font-semibold rounded-xl border border-border bg-background text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 cursor-pointer"
                aria-label="Filter by Status"
              >
                <option value="ALL">All Statuses</option>
                {[
                  "DRAFT",
                  "PENDING_APPROVAL",
                  "APPROVED",
                  "RELEASED",
                  "IN_PROGRESS",
                  "PARTIALLY_COMPLETED",
                  "COMPLETED",
                  "CANCELLED",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="relative inline-flex h-9 w-10 cursor-pointer items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:border-primary hover:text-primary focus-within:ring-2 focus-within:ring-primary/20" title="Filter by schedule date">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                <input
                  type="date"
                  value={selectedScheduleDate}
                  onChange={(event) => setSelectedScheduleDate(event.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Choose schedule date"
                />
              </label>
              {selectedScheduleDate && (
                <>
                  <span className="whitespace-nowrap text-xs font-semibold text-foreground">
                    {new Date(`${selectedScheduleDate}T00:00:00`).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedScheduleDate("")}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Clear schedule date filter"
                    title="Clear date filter"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content Body */}
        {plans.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 gap-3 text-center">
            <Boxes className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-semibold text-foreground text-sm">No production plans found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {searchTerm || selectedTypeFilter !== "ALL" || selectedStatusFilter !== "ALL" || selectedScheduleDate
                  ? "Try clearing or adjusting your search filters."
                  : "Schedule a new manufacturing run to get started."}
              </p>
            </div>
            {!searchTerm && selectedTypeFilter === "ALL" && selectedStatusFilter === "ALL" && !selectedScheduleDate && (
              <Link href="/production/planning/new" className="mt-2">
                <Button size="sm" icon={Plus} className="bg-primary text-primary-foreground shadow-none">
                  Schedule Run
                </Button>
              </Link>
            )}
          </div>
        ) : (
          /* Table View */
          <div className="w-full overflow-x-auto">
            <Table className="w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[13%]">Plan #</TableHead>
                  <TableHead className="w-[25%]">Product Target</TableHead>
                  <TableHead className="w-[16%]">BOM Name</TableHead>
                  <TableHead className="w-[11%]">Target Qty</TableHead>
                  <TableHead className="w-[11%]">Scheduled Date</TableHead>
                  <TableHead className="w-[12%]">Status</TableHead>
                  <TableHead className="w-[12%] text-right pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => {
                  const canEdit = isAdmin && ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(plan.status);
                  const canCancel = isAdmin && ['PENDING_APPROVAL', 'APPROVED'].includes(plan.status);
                  const canRelease = isAdmin && plan.status === 'APPROVED';
                  return (
                  <TableRow
                    key={plan.id}
                    tabIndex={0}
                    aria-label={`Open production schedule ${plan.planNumber}`}
                    onClick={() => router.push(`/production/planning/${plan.id}`)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(`/production/planning/${plan.id}`);
                      }
                    }}
                    className="hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary cursor-pointer transition-colors"
                  >
                    <TableCell>
                      <Link
                        className="font-mono text-xs font-bold text-primary hover:underline"
                        href={`/production/planning/${plan.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {plan.planNumber}
                      </Link>
                      {plan.scheduleType && (
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-1">
                          {plan.scheduleType} Shift
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-foreground text-sm">{plan.product?.name ?? "—"}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-foreground/85">
                      {plan.bomVersion?.bomNumber || "—"}
                      {plan.incharge && (
                        <div className="text-[11px] text-muted-foreground font-sans font-normal mt-0.5">
                          Lead: <span className="font-medium text-foreground">{plan.incharge}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-foreground">
                      {plan.quantity} {plan.product?.uom?.symbol ?? "units"}
                      {Number(plan.bufferQuantity) > 0 && (
                        <span className="block text-[10px] text-muted-foreground font-normal">
                          +{plan.bufferQuantity} buffer
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-medium text-muted-foreground">
                      {new Date(plan.scheduleDate).toLocaleDateString("en-IN", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={plan.status} />
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex items-center justify-end gap-1.5">
                        {canRelease && (
                          <Button
                            variant="outline"
                            size="sm"
                            icon={Send}
                            className="h-8 whitespace-nowrap px-2 text-xs font-semibold"
                            title={`Release ${plan.planNumber} to the floor`}
                            disabled={releasePlanAction.isPending}
                            onClick={(event) => {
                              event.stopPropagation();
                              releasePlanAction.mutate({ id: plan.id });
                            }}
                          >
                            Release to floor
                          </Button>
                        )}
                        {canEdit && (
                          <Link
                            href={`/production/planning/new?editId=${encodeURIComponent(plan.id)}`}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Edit production schedule ${plan.planNumber}`}
                            title="Edit schedule"
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-primary hover:text-primary hover:bg-primary/10"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Link>
                        )}
                        {canCancel && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Cancel schedule"
                            aria-label={`Cancel production schedule ${plan.planNumber}`}
                            disabled={deletePlanMutation.isPending}
                            onClick={(event) => {
                              event.stopPropagation();
                              setPlanToDelete(plan);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <PaginationControls
              page={page}
              pageSize={pageSize}
              total={data?.total ?? 0}
              onPageChange={setPage}
              onPageSizeChange={updatePageSize}
            />
          </div>

        )}
      </Card>

      <CancelProductionScheduleDialog
        plan={planToDelete}
        isPending={deletePlanMutation.isPending}
        onClose={() => setPlanToDelete(null)}
        onConfirm={async (plan) => {
          try {
            await deletePlanMutation.mutateAsync(plan.id);
            setPlanToDelete(null);
          } catch (error) {
            void error;
          }
        }}
      />
    </div>
  );
}
