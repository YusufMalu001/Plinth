"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Play,
  Sparkles,
  FileText,
  History,
  Loader2,
  Check,
  Printer,
  Package,
  Hash,
  CalendarDays,
  Layers,
  GitBranch,
  Edit3,
  Copy,
  FileCheck,
  Factory,
  Boxes,
  CheckCheck,
  Pencil,
  Trash2,
  Send,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Dialog, Input } from "@plinth/ui";
import {
  useProductionAction,
  useDeleteProductionPlan,
  useProductionPlan,
  useIssueProductionMaterial,
  useRecordProductionOutput,
  useReverseProductionMaterialIssue,
  useUpdateProductionPlan,
} from "@/features/production/hooks";
import { useCurrentUser } from "@/features/auth/hooks";
import { showToast } from "@/components/toast-store";
import { friendlyErrorMessage } from "@/features/auth/access-control";
import type { ProductionPlanStatus } from "@/features/production/types";
import { ProductionSchedulePDF } from "@/components/ProductionSchedulePDF";
import { CancelProductionScheduleDialog } from "@/features/production/components/CancelProductionScheduleDialog";
import { SearchableSelector } from "@/components/ui/SearchableSelector";
import { useReactToPrint } from "react-to-print";

type ViewMode = "details" | "document" | "execution";

/* ─── Status Badge Helper ──────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: ProductionPlanStatus }) {
  switch (status) {
    case "DRAFT":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-muted text-muted-foreground border border-border">
          <FileText className="h-3.5 w-3.5" />
          Draft
        </span>
      );
    case "APPROVED":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-tone-green-bg text-tone-green-text border border-tone-green-solid/25">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Approved
        </span>
      );
    case "RELEASED":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-tone-blue-bg text-tone-blue-text border border-tone-blue-solid/25">
          <Send className="h-3.5 w-3.5" />
          Released to Floor
        </span>
      );
    case "PENDING_APPROVAL":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-tone-amber-bg text-tone-amber-text border border-tone-amber-solid/25">
          <Clock className="h-3.5 w-3.5" />
          Pending Approval
        </span>
      );
    case "PARTIALLY_COMPLETED":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-tone-blue-bg text-tone-blue-text border border-tone-blue-solid/25">
          <Sparkles className="h-3.5 w-3.5" />
          Partially Completed
        </span>
      );
    case "COMPLETED":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-tone-green-bg text-tone-green-text border border-tone-green-solid/25">
          <CheckCheck className="h-3.5 w-3.5" />
          Completed
        </span>
      );
    case "IN_PROGRESS":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/15 text-primary border border-primary/30">
          <Play className="h-3.5 w-3.5 animate-pulse" />
          In Progress
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-muted text-muted-foreground border border-border">
          <FileText className="h-3.5 w-3.5" />
          Cancelled
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-muted text-muted-foreground border border-border">
          <FileText className="h-3.5 w-3.5" />
          {status}
        </span>
      );
  }
}

export default function ProductionPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data, isLoading } = useProductionPlan(id, { refreshExecution: true });
  const { data: currentUser } = useCurrentUser();

  const [viewMode, setViewMode] = useState<ViewMode>("details");
  const [copied, setCopied] = useState(false);
  const [cancelScheduleOpen, setCancelScheduleOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: data ? `PS-${data.planNumber}` : "Production Schedule",
  });

  const approveAction = useProductionAction("approve");
  const releaseAction = useProductionAction("release");
  const partialAction = useProductionAction("partialComplete");
  const interruptAction = useProductionAction("interrupt");
  const issueAction = useIssueProductionMaterial();
  const outputAction = useRecordProductionOutput();
  const reverseIssueAction = useReverseProductionMaterialIssue();
  const updatePlanMutation = useUpdateProductionPlan();
  const cancelPlanMutation = useDeleteProductionPlan();
  const [shortageDialogOpen, setShortageDialogOpen] = useState(false);
  const [resolvedQuantity, setResolvedQuantity] = useState(0);
  const [partialQty, setPartialQty] = useState(1);
  const [partialReason, setPartialReason] = useState("");
  const [interruptReason, setInterruptReason] = useState("");
  const [issueRequirementId, setIssueRequirementId] = useState("");
  const [issueQty, setIssueQty] = useState("");
  const [outputQty, setOutputQty] = useState("");

  const isAdmin =
    ["admin", "system_admin", "super-admin", "super_admin", "plant_manager", "production_manager"].includes(
      String(currentUser?.roleDefinition?.key || currentUser?.role || "").toLowerCase()
    ) ||
    (currentUser?.roles ?? []).some((role) =>
      ["admin", "super-admin", "super_admin", "plant_manager", "production_manager"].includes(
        String(role.key || role.name).toLowerCase()
      )
    );
  const isScheduleAdmin =
    ["admin", "system_admin", "super-admin", "super_admin"].includes(
      String(currentUser?.roleDefinition?.key || currentUser?.role || "").toLowerCase()
    ) ||
    (currentUser?.roles ?? []).some((role) =>
      ["admin", "system_admin", "super-admin", "super_admin"].includes(
        String(role.key || role.name).toLowerCase()
      )
    );

  const handleCopyPlanNumber = () => {
    if (!data?.planNumber) return;
    navigator.clipboard.writeText(data.planNumber);
    setCopied(true);
    showToast({
      kind: "success",
      title: "Copied",
      message: `Production Schedule ${data.planNumber} copied to clipboard.`,
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const openShortageDialog = () => {
    if (!data) return;
    setResolvedQuantity(Number(data.quantity) || 0);
    setShortageDialogOpen(true);
  };

  const saveShortageResolution = async () => {
    if (!data || !id) return;
    await updatePlanMutation.mutateAsync({
      id,
      quantity: resolvedQuantity,
    });
    setShortageDialogOpen(false);
  };

  const handleApprove = async () => {
    if (!id) return;
    try {
      await approveAction.mutateAsync({ id });
    } catch (err: unknown) {
      const msg = friendlyErrorMessage(err);
      if (msg.toLowerCase().includes("material shortage") || msg.toLowerCase().includes("shortage")) {
        showToast({
          kind: "error",
          title: "Material Shortage Detected",
          message: "Material shortage must be resolved before approval. Adjust batch quantities or replenish inventory.",
          duration: 9000,
        });
        openShortageDialog();
      } else {
        showToast({
          kind: "error",
          title: "Approval Failed",
          message: msg,
        });
      }
    }
  };

  const handleRelease = () => {
    if (!id) return;
    releaseAction.mutate({ id });
  };

  const safeQuantityAnalysis = useMemo(() => {
    const currentQuantity = Number(data?.quantity) || 0;
    const proposedQuantity = Math.max(0, Number(resolvedQuantity) || 0);
    const bomLines = data?.bomVersion?.lines ?? [];
    const requirements = data?.requirements ?? [];
    const snapshotLines = (data?.requirementSnapshot as any)?.lines ?? [];
    const rows = requirements.map((requirement: any) => {
      const line = bomLines.find((candidate: any) => candidate.id === requirement.bomLineId) as any;
      const snapshotLine = snapshotLines.find((candidate: any) => candidate.bomLineId === requirement.bomLineId || candidate.itemId === requirement.itemId);
      const available = Number(requirement.availableQuantity ?? snapshotLine?.availableQuantity ?? Math.max(0, Number(requirement.inventoryQuantity ?? 0) - Number(requirement.shortageQuantity ?? 0)));
      const required = Number(requirement.requiredQuantity ?? 0);
      const isFixed = line?.quantityMode === "FIXED";
      const materialPerOutput = Number(line?.quantity) || (currentQuantity > 0 ? required / currentQuantity : 0);
      const projectedRequired = isFixed ? materialPerOutput : materialPerOutput * proposedQuantity;
      const unitsPerOutput = !isFixed ? materialPerOutput : null;
      const maximumOutput = isFixed
        ? available < materialPerOutput
          ? 0
          : null
        : unitsPerOutput && unitsPerOutput > 0
          ? Math.floor(available / unitsPerOutput)
          : null;
      return {
        requirement,
        available,
        required,
        projectedRequired,
        projectedShortage: Math.max(0, projectedRequired - available),
        unitsPerOutput,
        maximumOutput,
        safeOutput: maximumOutput,
      };
    });
    const constrained = rows.filter((row) => row.safeOutput !== null);
    const safeQuantity = constrained.length ? Math.min(...constrained.map((row) => row.safeOutput as number)) : null;
    const limitingRow = constrained.find((row) => row.safeOutput === safeQuantity);
    return {
      rows,
      safeQuantity,
      limitingItem: limitingRow?.requirement.itemName || limitingRow?.requirement.itemCode || null,
    };
  }, [data, resolvedQuantity]);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-12 text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm font-semibold text-muted-foreground">Loading production schedule workspace…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto p-12 text-center space-y-4">
        <p className="text-base font-bold text-foreground">Production Schedule Not Found</p>
        <Link href="/production/planning">
          <Button variant="outline" size="sm" icon={ArrowLeft}>
            Back
          </Button>
        </Link>
      </div>
    );
  }

  const shortages = data.materialSnapshot?.shortages ?? [];
  const bomLines = data.bomVersion?.lines ?? [];
  const routeSteps = data.route?.steps ?? [];
  const executionBatches = data.executionBatches ?? [];
  const requirements = data.requirements ?? [];
  const selectedRequirement = requirements.find((r) => r.id === issueRequirementId);
  const issueRequirementOptions = requirements
    .filter((requirement) => Number(requirement.reservedQuantity) > Number(requirement.issuedQuantity))
    .map((requirement) => ({
      id: requirement.id,
      name: requirement.itemName || requirement.itemCode || `${requirement.itemType} · ${requirement.itemId.slice(0, 8)}`,
      code: `Remaining ${Number(requirement.inventoryQuantity) - Number(requirement.issuedQuantity)}`,
    }));
  const hasShortage = shortages.length > 0;
  const plannedQuantity = Number(data.quantity) || 0;
  const routeProgress = routeSteps.map((step, index) => {
    const sequenceNumber = step.sequenceNumber ?? step.sequence ?? index + 1;
    const batches = executionBatches.filter((batch) =>
      (step.id && batch.routeStepId === step.id) || batch.stageSequenceNumber === sequenceNumber
    );
    const receivedQuantity = batches.reduce((sum, batch) => sum + Number(batch.received_qty || 0), 0);
    const recordedCompletedQuantity = batches.reduce((sum, batch) => sum + Number(batch.completed_qty || 0), 0);
    const isPlanComplete = data.status === "COMPLETED";
    const isComplete = isPlanComplete || (
      batches.length > 0 && batches.every((batch) =>
        ["COMPLETE", "COMPLETED", "HANDOVER_PENDING", "NEXT_STAGE_ACCEPTED"].includes(batch.status)
      )
    );
    const completedQuantity = isPlanComplete && batches.length === 0
      ? plannedQuantity
      : recordedCompletedQuantity;
    const targetQuantity = receivedQuantity || plannedQuantity;
    const percentage = isComplete
      ? 100
      : targetQuantity > 0
        ? Math.min(99, Math.round((completedQuantity / targetQuantity) * 100))
        : 0;
    const hasStarted = batches.some((batch) =>
      ["RECEIVED", "ASSIGNED", "IN_PROGRESS", "PAUSED", "PARTIAL", "COMPLETE", "HANDOVER_PENDING", "NEXT_STAGE_ACCEPTED", "COMPLETED"].includes(batch.status)
    );

    return {
      step,
      sequenceNumber,
      batches,
      completedQuantity,
      targetQuantity,
      percentage,
      isComplete,
      isActive: !isComplete && hasStarted,
    };
  });
  const completedStepCount = routeProgress.filter((step) => step.isComplete).length;
  const processProgress = routeProgress.length
    ? Math.round(routeProgress.reduce((sum, step) => sum + step.percentage, 0) / routeProgress.length)
    : 0;
  const routeProgressById = new Map(routeProgress.map((progress) => [progress.step.id, progress]));
  const routeProgressRoots = routeProgress.filter((progress) =>
    Number(progress.step.stepOrder || 0) === 1 || !progress.step.parentStepId || !routeProgressById.has(progress.step.parentStepId)
  );

  function renderRouteProgress(progress: (typeof routeProgress)[number], displayNumber: string, depth = 0): React.ReactNode {
    const { step, sequenceNumber, isComplete, isActive, percentage, completedQuantity, targetQuantity } = progress;
    const isProcessing = progress.completedQuantity > 0 || progress.batches.some((batch) =>
      ["IN_PROGRESS", "PAUSED", "PARTIAL", "REWORK"].includes(batch.status)
    );
    const isAwaitingReceipt = progress.batches.some((batch) => batch.status === "AWAITING_RECEIPT");
    const isReady = progress.batches.some((batch) => ["RECEIVED", "ASSIGNED"].includes(batch.status));
    const statusLabel = isComplete
      ? "Done"
      : isProcessing
        ? "In progress"
        : isAwaitingReceipt
          ? "Awaiting receipt"
          : isReady
            ? "Ready to start"
            : "Not started";
    const children = depth > 0
      ? []
      : step.branchKey
        ? routeProgress.filter((candidate) => candidate.step.id !== step.id && candidate.step.branchKey === step.branchKey)
          .sort((a, b) => Number(a.step.stepOrder || a.sequenceNumber) - Number(b.step.stepOrder || b.sequenceNumber))
        : routeProgress.filter((candidate) => candidate.step.parentStepId === step.id)
          .sort((a, b) => Number(a.step.stepOrder || a.sequenceNumber) - Number(b.step.stepOrder || b.sequenceNumber));

    return (
      <li key={step.id || sequenceNumber} className={depth > 0 ? "relative ml-4 border-l-2 border-primary/20 pl-4" : "relative"}>
        <div className={`relative flex gap-3 ${depth > 0 ? "rounded-md bg-muted/25 py-2 pr-2" : ""}`}>
          <div className="relative flex w-7 shrink-0 flex-col items-center">
            <span className={`z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              isComplete
                ? "bg-tone-green-solid text-inverse"
                : isActive
                  ? "bg-primary text-primary-foreground ring-4 ring-primary/10"
                  : "border border-border bg-background text-muted-foreground"
            }`}>
              {isComplete ? <Check className="h-4 w-4" /> : displayNumber}
            </span>
          </div>

          <div className="mb-3 min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                {depth > 0 && <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Sub-department</p>}
                <h3 className="text-sm font-semibold leading-5 text-foreground">{step.stepName || step.name || "Operation Step"}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {step.department?.name || "Department not assigned"}
                  {step.standardDurationMinutes ? ` · ${step.standardDurationMinutes} min` : ""}
                  {step.isQcRequired ? " · QC required" : ""}
                </p>
              </div>
              <span className={`shrink-0 text-xs font-semibold ${isComplete ? "text-tone-green-text" : isActive ? "text-primary" : "text-muted-foreground"}`}>
                {statusLabel}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span>{completedQuantity.toLocaleString()} / {targetQuantity.toLocaleString()} {data?.product?.uom?.symbol || "units"} completed</span>
              <span className="font-mono tabular-nums">{percentage}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${step.stepName || step.name || `Step ${sequenceNumber}`} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
              <div className={`h-full rounded-full transition-[width] duration-500 ${isComplete ? "bg-tone-green-solid" : "bg-primary"}`} style={{ width: `${percentage}%` }} />
            </div>
          </div>
        </div>
        {children.length > 0 && (
          <ol className="mt-1 space-y-2">
            {children.map((child, index) => renderRouteProgress(child, `${displayNumber}.${index + 1}`, depth + 1))}
          </ol>
        )}
      </li>
    );
  }

  return (
    <>
      <div className="flex-1 min-h-screen bg-background p-4 sm:p-6 md:p-8 overflow-y-auto print:hidden">
        <div className="w-full space-y-6">
          {/* Top Breadcrumbs & View Mode Bar */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Link href="/production" className="hover:text-foreground transition-colors">
                  Manufacturing &amp; Planning
                </Link>
                <span className="text-muted-foreground/60">/</span>
                <Link href="/production/planning" className="hover:text-foreground transition-colors">
                  Production Planning
                </Link>
                <span className="text-muted-foreground/60">/</span>
                <span className="font-mono font-bold text-foreground flex items-center gap-1.5">
                  {data.planNumber}
                  <button
                    type="button"
                    onClick={handleCopyPlanNumber}
                    className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
                    title="Copy Schedule Number"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-tone-green-text" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </span>
              </nav>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {/* View Mode Toggle Controls */}
                <div className="inline-flex items-center p-1 rounded-xl bg-muted/60 border border-border text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setViewMode("details")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${viewMode === "details"
                        ? "bg-card text-foreground font-bold border border-border/50"
                        : "text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    <FileCheck className="h-3.5 w-3.5" />
                    <span>Plan Details</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewMode("document")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${viewMode === "document"
                        ? "bg-card text-foreground font-bold border border-border/50"
                        : "text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Official Document</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewMode("execution")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${viewMode === "execution"
                        ? "bg-card text-foreground font-bold border border-border/50"
                        : "text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    <Factory className="h-3.5 w-3.5" />
                    <span>Execution &amp; Audit</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Executive Header Card */}
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                      <Factory className="h-5 w-5" />
                    </span>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground font-mono">
                      {data.planNumber}
                    </h1>
                  </div>

                  <StatusBadge status={data.status} />

                </div>

                {/* Schedule actions */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                  <Link href="/production">
                    <Button variant="outline" size="sm" icon={ArrowLeft} className="font-semibold">
                      Back
                    </Button>
                  </Link>

                  {isScheduleAdmin && ["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(data.status) && (
                    <>
                      <Link href={`/production/planning/new?editId=${encodeURIComponent(data.id)}`}>
                        <Button variant="outline" size="sm" icon={Pencil} className="font-semibold" aria-label="Edit schedule">
                          Edit
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        icon={Trash2}
                        className="border-destructive/40 text-destructive hover:bg-destructive/10 font-semibold"
                        onClick={() => setCancelScheduleOpen(true)}
                        aria-label="Delete schedule"
                        title="Delete schedule"
                      >
                        Delete
                      </Button>
                    </>
                  )}

                  {data.status === "PENDING_APPROVAL" && isAdmin && (
                    <>
                      <Button
                        size="sm"
                        icon={Check}
                        loading={approveAction.isPending}
                        onClick={handleApprove}
                        className="bg-action hover:bg-[color:var(--action-primary-bg-hover)] text-inverse font-semibold cursor-pointer"
                      >
                        Approve Schedule
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        icon={XCircle}
                        onClick={() => setCancelScheduleOpen(true)}
                        className="border-destructive/40 text-destructive hover:bg-destructive/10 font-semibold cursor-pointer"
                      >
                        Reject Schedule
                      </Button>
                    </>
                  )}

                  {data.status === "APPROVED" && isScheduleAdmin && (
                    <Button
                      size="sm"
                      icon={Send}
                      loading={releaseAction.isPending}
                      onClick={handleRelease}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                    >
                      Release to Floor
                    </Button>
                  )}

                  {["RELEASED", "IN_PROGRESS", "PARTIALLY_COMPLETED", "COMPLETED"].includes(data.status) && (
                    <Link href={`/production/execution/plans/${data.id}`}>
                      <Button
                        size="sm"
                        icon={ExternalLink}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                      >
                        View in Production Execution
                      </Button>
                    </Link>
                  )}

                  {hasShortage && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={Edit3}
                      onClick={openShortageDialog}
                      className="border-tone-amber-solid/25 text-tone-amber-text hover:bg-tone-amber-bg font-semibold"
                    >
                      Resolve Shortage
                    </Button>
                  )}

                </div>
              </div>

            </div>
          </div>

          {/* Schedule summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Card className="border-border bg-card shadow-none hover:shadow-none">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Package className="h-4 w-4" /></div>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Target Product</span>
                </div>
                <p className="text-sm font-bold text-foreground line-clamp-2">{data.product?.name || "—"}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card shadow-none hover:shadow-none">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Hash className="h-4 w-4" /></div>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Planned Quantity</span>
                </div>
                <p className="text-2xl font-black text-foreground font-mono">
                  {String(data.quantity)} <span className="text-xs font-semibold text-muted-foreground font-sans">{data.product?.uom?.symbol || "pcs"}</span>
                </p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card shadow-none hover:shadow-none">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Layers className="h-4 w-4" /></div>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">BOM Specification</span>
                </div>
                <p className="text-sm font-bold text-foreground font-mono truncate">{data.bomVersion?.bomNumber || "—"}</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card shadow-none hover:shadow-none">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><CalendarDays className="h-4 w-4" /></div>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Schedule Date</span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  {new Date(data.scheduleDate).toLocaleDateString("en-IN", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card shadow-none hover:shadow-none">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Clock className="h-4 w-4" /></div>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Shift Type</span>
                </div>
                <p className="text-sm font-bold uppercase text-foreground">{data.scheduleType} Shift</p>
              </CardContent>
            </Card>
          </div>

          {/* ─── VIEW MODE: PLAN DETAILS (Default Single Workspace) ─── */}
          {viewMode === "details" && (
            <div className="space-y-6">
              <div className="hidden">
                <ProductionSchedulePDF data={data} ref={printRef} />
              </div>
              <div className={`grid grid-cols-1 gap-6 items-start ${bomLines.length > 0 ? "xl:grid-cols-2" : ""}`}>
                <Card className="border-border bg-card shadow-none hover:shadow-none">
                  <CardHeader className="pb-3">
                    <div className="flex w-full items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <GitBranch className="h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <CardTitle className="text-sm font-bold text-foreground">Formula &amp; Assembly Route</CardTitle>
                          <p className="mt-1 truncate text-xs font-medium text-muted-foreground">
                            Production Route · {data.route?.name || "Standard Cutting Route"}{data.route?.code ? ` · ${data.route.code}` : ""}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                        {routeSteps.length} {routeSteps.length === 1 ? "step" : "steps"}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0 text-xs">
                    {routeProgress.length > 0 ? (
                      <>
                        <div className="mb-5">
                          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                            <span className="font-semibold text-foreground">Department route progress</span>
                            <span className="font-medium text-muted-foreground">
                              {completedStepCount} of {routeProgress.length} steps done · {processProgress}%
                            </span>
                          </div>
                          <div
                            className="h-2 overflow-hidden rounded-full bg-muted"
                            role="progressbar"
                            aria-label="Department route progress"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={processProgress}
                          >
                            <div
                              className="h-full rounded-full bg-primary transition-[width] duration-500"
                              style={{ width: `${processProgress}%` }}
                            />
                          </div>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Schedule completion is recorded after Assembly accepts and QC clears finished output.
                          </p>
                        </div>

                        <ol className="space-y-3">
                          {routeProgressRoots.map((progress, index) => renderRouteProgress(progress, String(index + 1)))}
                        </ol>
                      </>
                    ) : (
                      <p className="text-muted-foreground">No route operations configured.</p>
                    )}
                  </CardContent>
                </Card>

                {/* 3. BOM Lines Table */}
                {bomLines.length > 0 && (
                  <Card className="border-border bg-card shadow-none hover:shadow-none">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary" />
                        <CardTitle className="text-sm font-bold text-foreground">
                          Bill of Materials &amp; Cut-List ({bomLines.length} components)
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0 text-xs">
                      <div className="px-4 py-3">
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] table-fixed text-xs">
                            <colgroup>
                              <col className="w-[6%]" />
                              <col className="w-[47%]" />
                              <col className="w-[29%]" />
                              <col className="w-[12%]" />
                              <col className="w-[6%]" />
                            </colgroup>
                            <thead className="bg-primary text-[11px] uppercase tracking-wider text-primary-foreground">
                              <tr>
                                {["#", "Component / Material", "Cut Qty / Unit", "Batch Qty", "UOM"].map((h) => (
                                  <th
                                    key={h}
                                    className={`px-3 py-2.5 font-bold text-primary-foreground ${h === "Batch Qty" ? "text-right" : h === "UOM" ? "text-center" : "text-left"}`}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-card">
                              {bomLines.map((line, idx) => {
                                const name =
                                  line.componentProduct?.name ||
                                  line.material?.name ||
                                  (line.note ? line.note.split(" — ")[0] : "—");
                                const subtext = line.componentProduct
                                  ? line.componentProduct.sku
                                  : line.material
                                    ? line.material.code
                                    : line.note && line.note.includes(" — ")
                                      ? line.note.split(" — ")[1]
                                      : null;
                                const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
                                const normalizedSubtext = subtext?.toLowerCase().replace(/[^a-z0-9]/g, "");
                                const showSubtext = Boolean(normalizedSubtext && normalizedSubtext !== normalizedName);
                                const lineQty = Number(line.quantity) || 0;
                                const totalBatchQty = lineQty * (Number(data.quantity) || 0);

                                return (
                                  <tr key={line.id || idx} className="align-middle hover:bg-muted/20 transition-colors">
                                    <td className="px-3 py-3 text-left font-mono text-muted-foreground">{line.sequence || idx + 1}</td>
                                    <td className="px-3 py-3 text-left">
                                      <div className="font-semibold text-foreground">{name}</div>
                                      {showSubtext && subtext && (
                                        <div className="mt-0.5 text-[11px] font-mono text-muted-foreground">
                                          {subtext}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">{lineQty}</td>
                                    <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-foreground">{totalBatchQty}</td>
                                    <td className="px-2 py-3 text-center text-muted-foreground">{line.uom?.symbol || "pcs"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

                {/* 4. In-Progress Material Issue & Finished Output (Active States) */}
                {(data.status === "IN_PROGRESS" || data.status === "PARTIALLY_COMPLETED") && (
                  <Card className="border-border bg-card shadow-none hover:shadow-none">
                    <CardHeader className="border-border-strong border-border bg-muted/20 pb-3">
                      <CardTitle className="text-sm font-bold text-foreground">
                        Material Issue &amp; Finished Output Execution
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-5">
                      <div className="grid gap-3 md:grid-cols-[1fr_140px_auto] items-end">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Requirement to issue
                          <SearchableSelector
                            size="sm"
                            options={issueRequirementOptions}
                            value={issueRequirementId}
                            onChange={setIssueRequirementId}
                            placeholder="Search reserved component..."
                            disabled={issueRequirementOptions.length === 0}
                            className="mt-1 w-full text-xs"
                          />
                        </label>
                        <label className="text-xs font-semibold text-muted-foreground">
                          Issue quantity
                          <Input
                            type="number"
                            min="0"
                            step="0.001"
                            value={issueQty}
                            onChange={(e) => setIssueQty(e.target.value)}
                            placeholder="0"
                            className="rounded-xl"
                          />
                        </label>
                        <Button
                          size="sm"
                          loading={issueAction.isPending}
                          disabled={!selectedRequirement || !issueQty}
                          onClick={() =>
                            issueAction.mutate({
                              id,
                              requirementId: issueRequirementId,
                              quantity: Number(issueQty),
                            })
                          }
                          className="h-10 rounded-xl"
                        >
                          Issue Material
                        </Button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end border-t border-border pt-4">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Accepted finished quantity (Target: {String(data.quantity)})
                          <Input
                            type="number"
                            min="0"
                            step="0.001"
                            value={outputQty}
                            onChange={(e) => setOutputQty(e.target.value)}
                            placeholder="0"
                            className="rounded-xl"
                          />
                        </label>
                        <Button
                          size="sm"
                          loading={outputAction.isPending}
                          disabled={!outputQty}
                          onClick={() => outputAction.mutate({ id, quantity: Number(outputQty) })}
                          className="h-10 rounded-xl bg-tone-green-solid hover:bg-[color:var(--tone-green-text)] text-inverse font-bold"
                        >
                          Record Finished Output
                        </Button>
                      </div>

                      {/* Partial Yield and Interruption Controls */}
                      <div className="grid gap-4 sm:grid-cols-2 pt-4 border-t border-border">
                        <div className="p-3.5 rounded-xl border border-border bg-muted/10 space-y-2.5">
                          <span className="text-xs font-bold text-foreground block">Log Partial Yield</span>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              min="1"
                              max={Number(data.quantity)}
                              value={partialQty}
                              onChange={(e) => setPartialQty(Number(e.target.value))}
                              className="rounded-xl text-xs h-9"
                            />
                            <Button
                              size="sm"
                              loading={partialAction.isPending}
                              onClick={() =>
                                partialAction.mutate({ id, partialQuantity: partialQty, reason: partialReason })
                              }
                              className="h-9 px-3 text-xs"
                            >
                              Log Yield
                            </Button>
                          </div>
                          <Input
                            placeholder="Optional reason/notes"
                            value={partialReason}
                            onChange={(e) => setPartialReason(e.target.value)}
                            className="rounded-xl text-xs h-8"
                          />
                        </div>

                        <div className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/5 space-y-2.5">
                          <span className="text-xs font-bold text-destructive block">Interrupt / Line Stoppage</span>
                          <Input
                            placeholder="Reason for line stoppage..."
                            value={interruptReason}
                            onChange={(e) => setInterruptReason(e.target.value)}
                            className="rounded-xl text-xs h-9"
                          />
                          <Button
                            variant="destructive"
                            size="sm"
                            loading={interruptAction.isPending}
                            disabled={!interruptReason.trim()}
                            onClick={() => interruptAction.mutate({ id, reason: interruptReason })}
                            className="h-8 text-xs font-bold w-full"
                          >
                            Halt Production Line
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
            </div>
          )}

          {/* ─── VIEW MODE: OFFICIAL DOCUMENT (Full Screen Center View) ─── */}
          {viewMode === "document" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-card p-4 rounded-2xl border border-border">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">
                      Official Production Schedule &amp; Shop-Floor Order
                    </h2>
                    <p className="text-xs text-muted-foreground font-mono">
                      {data.planNumber} · Batch: {data.batchIdentity || "Pending Release"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewMode("details")}
                    className="font-semibold text-xs rounded-xl"
                    icon={ArrowLeft}
                  >
                    Back
                  </Button>
                  <Button
                    size="sm"
                    icon={Printer}
                    onClick={() => handlePrint()}
                    className="bg-primary hover:bg-[color:var(--action-primary-bg-hover)] text-inverse font-bold rounded-xl cursor-pointer"
                  >
                    Print Hardcopy
                  </Button>
                </div>
              </div>

              <div className="bg-muted/20 p-6 sm:p-10 rounded-2xl border border-border flex justify-center overflow-x-auto">
                <div className="w-full max-w-[850px] bg-surface rounded-sm border border-border/40">
                  <ProductionSchedulePDF data={data} ref={printRef} />
                </div>
              </div>
            </div>
          )}

          {/* ─── VIEW MODE: EXECUTION & LIFECYCLE ─── */}
          {viewMode === "execution" && (
            <div className="space-y-6">
              <div className="hidden">
                <ProductionSchedulePDF data={data} ref={printRef} />
              </div>
              {/* Material Issue Movements */}
              <Card className="border-border bg-card shadow-none hover:shadow-none">
                <CardHeader className="border-border-strong border-border bg-muted/20 pb-3">
                  <div className="flex items-center gap-2">
                    <Boxes className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base font-bold text-foreground">
                      Material Issue Movements &amp; Output Register
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0 divide-y divide-border">
                  {((data.materialIssues?.length ?? 0) === 0 && (data.outputs?.length ?? 0) === 0) ? (
                    <p className="p-8 text-xs text-muted-foreground text-center">
                      No material issue or yield output movements posted yet.
                    </p>
                  ) : (
                    <>
                      {(data.materialIssues ?? []).map((issue) => (
                        <div key={issue.id} className="flex items-center justify-between gap-3 px-6 py-3.5 text-xs hover:bg-muted/10">
                          <div>
                            <span className="font-mono font-bold text-foreground">{issue.issueNumber}</span> ·{" "}
                            <span className="text-muted-foreground">{issue.itemType} {issue.itemId.slice(0, 8)}</span> ·{" "}
                            <strong className="text-primary">{String(issue.quantity)} issued</strong>
                          </div>
                          {issue.reversedAt ? (
                            <span className="text-muted-foreground font-mono">Reversed</span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              loading={reverseIssueAction.isPending}
                              onClick={() =>
                                reverseIssueAction.mutate({
                                  id,
                                  issueId: issue.id,
                                  reason: "Reversed from production workspace",
                                })
                              }
                              className="text-xs"
                            >
                              Reverse Movement
                            </Button>
                          )}
                        </div>
                      ))}
                      {(data.outputs ?? []).map((output) => (
                        <div key={output.id} className="px-6 py-3.5 text-xs bg-tone-green-bg flex items-center justify-between">
                          <div>
                            <span className="font-mono font-bold text-foreground">{output.outputNumber}</span> ·{" "}
                            <strong className="text-tone-green-text">{String(output.quantity)} accepted</strong> ·{" "}
                            <span className="text-destructive">{String(output.rejectedQuantity)} rejected</span> ·{" "}
                            <span className="text-tone-amber-text">{String(output.damagedQuantity)} damaged</span>
                          </div>
                          <span className="font-mono text-muted-foreground text-[11px]">
                            {new Date(output.recordedAt).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Lifecycle Audit Log */}
              <Card className="border-border bg-card shadow-none hover:shadow-none">
                <CardHeader className="border-border-strong border-border bg-muted/20 pb-3">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base font-bold text-foreground">Lifecycle Audit Log</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {(data.events ?? []).length === 0 ? (
                    <p className="p-8 text-xs text-muted-foreground text-center">No lifecycle events recorded yet.</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {data.events?.map((event) => (
                        <div
                          key={event.id}
                          className="p-4 sm:p-5 flex items-center justify-between text-xs hover:bg-muted/10 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
                              {event.eventType}
                            </span>
                            <span className="text-foreground font-medium">
                              {event.reason ? `"${event.reason}"` : "Schedule state transition executed"}
                            </span>
                          </div>
                          <span className="text-muted-foreground font-mono">
                            {new Date(event.createdAt).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* ─── SHORTAGE RESOLUTION DIALOG ─── */}
      <Dialog
        open={shortageDialogOpen}
        onClose={() => setShortageDialogOpen(false)}
        title="Resolve Material Shortage in Schedule"
        description="Adjust the planned batch production quantity. The system recalculates live inventory coverage and safe production thresholds in real time."
        className="max-w-3xl"
      >
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Planned production quantity
              <Input
                type="number"
                min="1"
                value={resolvedQuantity}
                onChange={(event) => setResolvedQuantity(Number(event.target.value))}
                className="mt-1 font-bold text-base"
              />
            </label>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
              <p className="font-bold text-foreground">Inventory-Safe Calculation</p>
              <p className="mt-1">
                Recommendation is derived from live available stock and the BOM consumption ratio.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Safe Quantity</p>
              <p className="mt-1 text-xl font-black text-primary">
                {safeQuantityAnalysis.safeQuantity === null ? "—" : safeQuantityAnalysis.safeQuantity.toLocaleString()}{" "}
                <span className="text-xs font-semibold">units</span>
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">Based on current stock &amp; BOM ratio.</p>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Proposed Plan</p>
              <p className="mt-1 text-xl font-black text-foreground">
                {Number(resolvedQuantity || 0).toLocaleString()} <span className="text-xs font-semibold">units</span>
              </p>
              <p
                className={`mt-1 text-[10px] font-semibold ${safeQuantityAnalysis.safeQuantity !== null && Number(resolvedQuantity) <= safeQuantityAnalysis.safeQuantity
                    ? "text-tone-green-text"
                    : "text-destructive"
                  }`}
              >
                {safeQuantityAnalysis.safeQuantity !== null && Number(resolvedQuantity) <= safeQuantityAnalysis.safeQuantity
                  ? "Within available stock"
                  : "Above safe inventory level"}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Limiting Item</p>
              <p
                className="mt-1 truncate text-sm font-bold text-foreground"
                title={safeQuantityAnalysis.limitingItem || undefined}
              >
                {safeQuantityAnalysis.limitingItem || "No limiting item"}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">First component to restrict output.</p>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full min-w-[620px] table-fixed border-collapse text-xs">
                <colgroup>
                  <col className="w-[42%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[16%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-primary text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-bold">Inventory Item</th>
                    <th scope="col" className="px-3 py-3 text-right font-bold">Required</th>
                    <th scope="col" className="px-3 py-3 text-right font-bold">Available</th>
                    <th scope="col" className="px-4 py-3 text-right font-bold">Shortage</th>
                    <th scope="col" className="px-4 py-3 text-right font-bold">Safe Output</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {requirements.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No material requirements found.
                      </td>
                    </tr>
                  ) : (
                    requirements.map((requirement) => {
                      const row = safeQuantityAnalysis.rows.find(
                        (candidate) => candidate.requirement.id === requirement.id
                      );
                      const shortage = row?.projectedShortage ?? Number(requirement.shortageQuantity || 0);
                      const shortageDetails = shortages.find(
                        (item) => item.itemId === requirement.itemId || item.bomLineId === requirement.bomLineId
                      );
                      const itemName =
                        requirement.itemName ||
                        shortageDetails?.itemName ||
                        shortageDetails?.item ||
                        requirement.itemId;
                      const itemCode = requirement.itemCode || shortageDetails?.itemCode;
                      const required =
                        row?.projectedRequired ??
                        Number(requirement.inventoryQuantity || requirement.requiredQuantity || 0);
                      const available = row?.available ?? Number(requirement.availableQuantity ?? required - shortage);

                      return (
                        <tr key={requirement.id} className="bg-card align-middle">
                          <td className="px-4 py-3 text-left">
                            <div className="truncate font-semibold text-foreground" title={itemName}>
                              {itemName}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground font-mono">
                              {itemCode || requirement.itemType}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums">{required.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-tone-green-text">
                            {available.toLocaleString()}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${shortage > 0 ? "text-destructive" : "text-tone-green-text"
                              }`}
                          >
                            {shortage > 0 ? `-${shortage.toLocaleString()}` : "Ready"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-primary">
                            {row?.safeOutput?.toLocaleString() || "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setShortageDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              loading={updatePlanMutation.isPending}
              disabled={resolvedQuantity <= 0}
              onClick={saveShortageResolution}
              className="bg-primary hover:bg-action text-inverse font-bold"
            >
              Save &amp; Recheck Schedule
            </Button>
          </div>
        </div>
      </Dialog>

      <CancelProductionScheduleDialog
        plan={cancelScheduleOpen ? data : null}
        isPending={cancelPlanMutation.isPending}
        onClose={() => setCancelScheduleOpen(false)}
        onConfirm={async (plan) => {
          try {
            await cancelPlanMutation.mutateAsync(plan.id);
            setCancelScheduleOpen(false);
          } catch (error) {
            void error;
          }
        }}
      />

    </>
  );
}
