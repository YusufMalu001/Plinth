"use client";

import React, { useState, useMemo } from "react";
import {
  Layers,
  Search,
  Building2,
  Clock,
  ShieldAlert
} from "lucide-react";
import { useDepartments } from "@/hooks/useMasterData";
import { useCurrentUser } from "@/features/auth/hooks";
import { LoadingState } from "@/components/LoadingState";
import { WipOverviewTab } from "@/features/wip/components/WipOverviewTab";
import { WipBatchSearchTab } from "@/features/wip/components/WipBatchSearchTab";
import { WipDepartmentQueueTab } from "@/features/wip/components/WipDepartmentQueueTab";
import { WipTimingMetricsTab } from "@/features/wip/components/WipTimingMetricsTab";
import { WipReconciliationTab } from "@/features/wip/components/WipReconciliationTab";
import { WipGenealogyView } from "@/features/wip/components/WipGenealogyView";
import { WipBatchDetailModal } from "@/features/wip/components/WipBatchDetailModal";
import { isProductionExecutionDepartment } from "@/features/production/types";

type WipActiveTab = "overview" | "batches" | "queue" | "timing" | "reconciliation";

export default function WipControlCenterPage() {
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const { data: deptResponse, isLoading: isLoadingDepts } = useDepartments("ACTIVE");
  const allDepartments = useMemo(
    () => (deptResponse?.items ?? []).filter(isProductionExecutionDepartment),
    [deptResponse]
  );

  const userRoleKey = (currentUser?.roleDefinition?.key || currentUser?.role || "").toLowerCase().replace(/[\s-]+/g, "_");
  const isGlobalAdminOrManager =
    userRoleKey === "admin" ||
    userRoleKey === "super_admin" ||
    userRoleKey === "manager" ||
    userRoleKey === "store_manager" ||
    !currentUser?.assignedDepartmentId;

  const userAssignedDeptId = currentUser?.assignedDepartmentId || "";
  const userAssignedDept = useMemo(() => {
    if (!userAssignedDeptId) return null;
    return allDepartments.find((d) => d.id === userAssignedDeptId) || null;
  }, [allDepartments, userAssignedDeptId]);

  const departments = useMemo(() => {
    if (isGlobalAdminOrManager) return allDepartments;
    if (userAssignedDept) return [userAssignedDept];
    if (userAssignedDeptId) {
      const match = allDepartments.find((d) => d.id === userAssignedDeptId);
      return match ? [match] : allDepartments;
    }
    return allDepartments;
  }, [allDepartments, isGlobalAdminOrManager, userAssignedDept, userAssignedDeptId]);

  const [activeTab, setActiveTab] = useState<WipActiveTab>("overview");
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");

  React.useEffect(() => {
    if (!isGlobalAdminOrManager && (userAssignedDeptId || departments[0]?.id)) {
      setSelectedDeptId(userAssignedDeptId || departments[0]?.id || "");
    }
  }, [isGlobalAdminOrManager, userAssignedDeptId, departments]);

  // Lineage Full View state
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  // Quick Detail Modal state
  const [modalBatchId, setModalBatchId] = useState<string | null>(null);

  const handleSelectBatch = (batchId: string, mode: "detail" | "genealogy" = "genealogy") => {
    if (mode === "detail") {
      setModalBatchId(batchId);
    } else {
      setSelectedBatchId(batchId);
    }
  };

  if (isLoadingUser || (isLoadingDepts && !allDepartments.length)) {
    return <LoadingState message="Loading WIP Tracking Control Center..." />;
  }

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6" data-testid="wip-control-center-page">
      {/* 1. If Genealogy / Batch Trace is opened */}
      {selectedBatchId ? (
        <WipGenealogyView
          batchId={selectedBatchId}
          onBack={() => setSelectedBatchId(null)}
          onSelectBatch={handleSelectBatch}
        />
      ) : (
        <>
          {/* 2. Top Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                <Layers className="h-7 w-7 text-primary" />
                WIP & Batch Tracking
              </h1>
            </div>
          </div>

          {/* Department Head Scope Notice */}
          {!isGlobalAdminOrManager && (userAssignedDept || departments[0]) && (
            <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-none">
              <div className="flex items-center gap-2.5 text-sm text-primary font-medium">
                <Building2 className="h-5 w-5 shrink-0" />
                <span>
                  Operating as Department Head:{" "}
                  <strong className="font-bold underline decoration-primary/40">
                    {(userAssignedDept || departments[0])?.name} ({(userAssignedDept || departments[0])?.code})
                  </strong>
                </span>
              </div>
              <span className="text-xs bg-primary/20 text-primary px-3 py-1 rounded-full font-semibold whitespace-nowrap">
                Scoped to Assigned Department Workflows
              </span>
            </div>
          )}

          {/* 3. Navigation Tabs */}
          <div className="flex items-center gap-1 border-border-strong border-border overflow-x-auto pb-px">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-border-strong-2 transition-colors whitespace-nowrap ${
                activeTab === "overview"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
              data-testid="tab-overview"
            >
              <Layers className="h-4 w-4" />
              Overview & Load
            </button>

            <button
              onClick={() => setActiveTab("batches")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-border-strong-2 transition-colors whitespace-nowrap ${
                activeTab === "batches"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
              data-testid="tab-batches"
            >
              <Search className="h-4 w-4" />
              Batch Directory
            </button>

            <button
              onClick={() => setActiveTab("queue")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-border-strong-2 transition-colors whitespace-nowrap ${
                activeTab === "queue"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
              data-testid="tab-queue"
            >
              <Building2 className="h-4 w-4" />
              Department Queue
            </button>

            <button
              onClick={() => setActiveTab("timing")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-border-strong-2 transition-colors whitespace-nowrap ${
                activeTab === "timing"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
              data-testid="tab-timing"
            >
              <Clock className="h-4 w-4" />
              Stage Timing Metrics
            </button>

            <button
              onClick={() => setActiveTab("reconciliation")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-border-strong-2 transition-colors whitespace-nowrap ${
                activeTab === "reconciliation"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              }`}
              data-testid="tab-reconciliation"
            >
              <ShieldAlert className="h-4 w-4" />
              Reconciliation Engine
            </button>
          </div>

          {/* 4. Tab Content */}
          <div>
            {activeTab === "overview" && (
              <WipOverviewTab
                departmentId={!isGlobalAdminOrManager ? (userAssignedDeptId || departments[0]?.id) : undefined}
                onSelectDepartment={(id) => {
                  setSelectedDeptId(id);
                  setActiveTab("queue");
                }}
                onNavigateToTab={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === "batches" && (
              <WipBatchSearchTab
                departments={departments}
                onSelectBatch={handleSelectBatch}
              />
            )}

            {activeTab === "queue" && (
              <WipDepartmentQueueTab
                departments={departments}
                selectedDepartmentId={selectedDeptId}
                onSelectDepartment={(id) => setSelectedDeptId(id)}
                onSelectBatch={handleSelectBatch}
              />
            )}

            {activeTab === "timing" && (
              <WipTimingMetricsTab
                departments={departments}
              />
            )}

            {activeTab === "reconciliation" && (
              <WipReconciliationTab
                onSelectBatch={handleSelectBatch}
              />
            )}
          </div>
        </>
      )}

      {/* 5. Quick Detail Modal */}
      {modalBatchId && (
        <WipBatchDetailModal
          batchId={modalBatchId}
          isOpen={Boolean(modalBatchId)}
          onClose={() => setModalBatchId(null)}
          onOpenGenealogy={(batchId) => {
            setModalBatchId(null);
            setSelectedBatchId(batchId);
          }}
        />
      )}
    </div>
  );
}
