'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Factory,
  CheckCircle2,
  Play,
  Pause,
  Send,
  PackageCheck,
  Users,
  Check,
  Clock,
  Copy,
  RefreshCw,
  Building2,
  X,
  AlertTriangle,
  History as HistoryIcon,
  ShieldCheck,
  ShieldAlert,
  Scale,
  Sliders,
  Trash2,
  FileCheck2
} from 'lucide-react';
import { Button, Card, Dialog, Input } from '@plinth/ui';
import { useCurrentUser } from '@/features/auth/hooks';
import { useEmployees, useDepartments } from '@/hooks/useMasterData';
import {
  useBatch,
  useBatchHistory,
  useReceiveAssignment,
  useStartBatch,
  usePauseBatch,
  useResumeBatch,
  useRecordProgress,
  useCompleteBatch,
  useProposeHandover,
  useDecideHandover,
  useUnassignWorker
} from '@/features/production/execution-hooks';
import { AssignWorkerModal } from '@/features/production/components/AssignWorkerModal';
import { ReportLossModal, type LossScenarioId } from '@/features/loss-management/components/ReportLossModal';
import { useLossEvents } from '@/features/loss-management/hooks';
import { lossApi } from '@/features/loss-management/api';
import { QcRuleModal } from '@/features/quality/components/QcRuleModal';
import { InspectionModal } from '@/features/quality/components/InspectionModal';
import { OverrideModal } from '@/features/quality/components/OverrideModal';
import { BlockedCheckpointBanner } from '@/features/quality/components/BlockedCheckpointBanner';
import { qualityApi, type CheckpointResolutionData } from '@/features/quality/api';
import { StatusBadge } from '@/components/StatusBadge';
import { SearchableSelector, type SearchableOption } from '@/components/ui/SearchableSelector';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { showToast } from '@/components/toast-store';
import { resolveAssemblyDepartment } from '@/features/production/types';

export default function DepartmentBatchExecutionPage() {
  const params = useParams();
  const batchId = params?.id as string;

  const { data: user } = useCurrentUser();
  const { data: batch, isLoading: isLoadingBatch, isError, error, refetch, isFetching } = useBatch(batchId);
  const { data: historyData } = useBatchHistory(batchId);
  const { data: lossEventsData, refetch: refetchLossEvents } = useLossEvents({
    departmentId: batch?.departmentId,
  });
  const batchLossEvents = useMemo(() => {
    const list: any[] = Array.isArray(lossEventsData)
      ? lossEventsData
      : (lossEventsData?.items ?? []);
    if (!list.length) return [];
    return list.filter((evt: any) =>
      (batchId && evt.batchId === batchId) ||
      (batch?.batchNumber && evt.lossNumber?.includes(batch.batchNumber)) ||
      (batch?.batchNumber && evt.reason?.includes(batch.batchNumber)) ||
      (batchId && evt.reason?.includes(batchId))
    );
  }, [lossEventsData, batchId, batch?.batchNumber]);

  // Departments
  const { data: deptsResponse } = useDepartments('ACTIVE');
  const assemblyDepartment = useMemo(
    () => resolveAssemblyDepartment(deptsResponse?.items || []),
    [deptsResponse?.items]
  );

  // Employees for current department
  const { data: empResponse, refetch: refetchEmployees } = useEmployees(batch?.departmentId);
  const departmentEmployees = useMemo(() => empResponse?.items ?? [], [empResponse]);

  // Tab state
  const [activeTab, setActiveTab] = useState<'workstation' | 'handovers' | 'history'>('workstation');

  // Modal states
  const [showAssignWorkerModal, setShowAssignWorkerModal] = useState(false);
  const [showReceiveMaterialsModal, setShowReceiveMaterialsModal] = useState(false);
  const [receiptQuantities, setReceiptQuantities] = useState<Record<string, string>>({});
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showRefuseModal, setShowRefuseModal] = useState(false);
  const [refusingHandoverId, setRefusingHandoverId] = useState<string | null>(null);

  // Loss & Scrap Modal state
  const [showReportLossModal, setShowReportLossModal] = useState(false);
  const [lossModalDefaults, setLossModalDefaults] = useState<{
    qty?: number;
    scenario?: LossScenarioId;
    notes?: string;
  }>({});

  // QC Gate states
  const [showQcInspectionModal, setShowQcInspectionModal] = useState(false);
  const [showQcRuleModal, setShowQcRuleModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showQcScrapModal, setShowQcScrapModal] = useState(false);
  const [isWritingOffScrap, setIsWritingOffScrap] = useState(false);
  const [qcScrapNotes, setQcScrapNotes] = useState('');
  const [isAutoApprovingQc, setIsAutoApprovingQc] = useState(false);
  const [qcCheckpoints, setQcCheckpoints] = useState<CheckpointResolutionData['checkpoints']>([]);
  const [, setIsLoadingQc] = useState(false);
  const [inspectionHistory, setInspectionHistory] = useState<any[]>([]);
  const [, setIsLoadingInspections] = useState(false);

  // Form states
  const [progressUnits, setProgressUnits] = useState('');
  const [progressScrap, setProgressScrap] = useState('');
  const [progressWastage, setProgressWastage] = useState('');
  const [progressWorkerId, setProgressWorkerId] = useState('');
  const [progressNotes, setProgressNotes] = useState('');

  const [handoverQty, setHandoverQty] = useState('');
  const [handoverTargetDeptId, setHandoverTargetDeptId] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');

  const [pauseReason, setPauseReason] = useState('');
  const [refusalReason, setRefusalReason] = useState('');
  const [copiedBatch, setCopiedBatch] = useState(false);

  // Mutations
  const receiveAssignmentMutation = useReceiveAssignment();
  const startBatchMutation = useStartBatch();
  const pauseBatchMutation = usePauseBatch();
  const resumeBatchMutation = useResumeBatch();
  const recordProgressMutation = useRecordProgress();
  const completeBatchMutation = useCompleteBatch();
  const proposeHandoverMutation = useProposeHandover();
  const decideHandoverMutation = useDecideHandover();
  const unassignWorkerMutation = useUnassignWorker();

  // Quantities & units calculation
  const recQty = Number(batch?.received_qty || 0);
  const compQty = Number(batch?.completed_qty || 0);
  const expQty = Number(batch?.expectedOutputQty || recQty || 0);
  const scrapQty = Number(batch?.scrap_qty || 0);
  const rejQty = Number(batch?.rejected_qty || 0);
  const wastageQty = Number(batch?.wastage_qty || 0);
  const totalLoss = scrapQty + rejQty + wastageQty;
  const materialAssignments = batch?.materialAssignments || [];
  const firstMaterialAssignment = materialAssignments[0] as any;
  const hasPartialMaterialReceipt = materialAssignments.some((assignment: any) =>
    Number(assignment.receivedQty || 0) > 0 && Number(assignment.receivedQty || 0) < Number(assignment.issuedQty || 0)
  );
  const allMaterialsReceived = materialAssignments.length > 0 && materialAssignments.every((assignment: any) =>
    Number(assignment.receivedQty || 0) >= Number(assignment.issuedQty || 0)
  );

  // Available physical work in custody ready to be processed right now:
  const custodyAvailable = Math.max(0, recQty - compQty - totalLoss);
  // Quantity of scheduled target that has not yet been delivered by upstream departments:
  const awaitingUpstream = Math.max(0, expQty - recQty);
  // Target output progress completely marked/fulfilled for this workstation operation
  const isTargetFullyCompleted = expQty > 0
    ? (compQty >= expQty || compQty + totalLoss >= expQty)
    : (recQty > 0 && (compQty >= recQty || compQty + totalLoss >= recQty));

  useEffect(() => {
    if (isTargetFullyCompleted) {
      setShowProgressModal(false);
      setShowPauseModal(false);
    }
  }, [isTargetFullyCompleted]);

  const upstreamDeptName =
    (batch as any)?.incomingHandovers?.[0]?.outgoingDepartment?.name ||
    (batch as any)?.routeStep?.parentStep?.department?.name ||
    'Upstream Department';

  const uomSymbol =
    (batch as any)?.outputUnitName ||
    batch?.productionPlan?.product?.uom?.symbol ||
    batch?.productionPlan?.product?.uom?.name ||
    'units';

  const outputItemName =
    (batch as any)?.outputItemName ||
    batch?.productionPlan?.product?.name ||
    'Target Output';

  const outputItemCode =
    (batch as any)?.outputItemCode ||
    batch?.productionPlan?.product?.sku ||
    '';

  const planProductName = batch?.productionPlan?.product?.name || 'Finished Product';
  const planProductSku = batch?.productionPlan?.product?.sku || '';
  const planQuantity = Number(batch?.productionPlan?.quantity || 0);
  const planUom = batch?.productionPlan?.product?.uom?.symbol || batch?.productionPlan?.product?.uom?.name || 'units';

  const progressPercent = expQty > 0 ? Math.min(100, Math.round((compQty / expQty) * 100)) : 0;

  // Handover destination resolution strictly from approved floor route sequence
  const resolvedNextDept = useMemo(() => {
    // 1. Explicit nextDepartment relation on routeStep
    if ((batch as any)?.routeStep?.nextDepartment) {
      return (batch as any).routeStep.nextDepartment;
    }
    if ((batch as any)?.routeStep?.nextDepartmentId) {
      const found = (deptsResponse?.items || []).find((d) => d.id === (batch as any).routeStep.nextDepartmentId);
      if (found) return found;
    }
    // 2. Next step in sequence
    const nextStep = (batch?.productionPlan?.route?.steps || []).find(
      (s: any) => s.parentStepId === batch?.routeStepId
    );
    if (nextStep?.department) return nextStep.department;
    if (nextStep?.departmentId) {
      const found = (deptsResponse?.items || []).find((d) => d.id === nextStep.departmentId);
      if (found) return found;
    }
    // 3. Fallback to Assembly Department
    if (batch?.productionPlan?.route?.assemblyDepartment) {
      return batch.productionPlan.route.assemblyDepartment;
    }
    if (batch?.productionPlan?.route?.assemblyDepartmentId) {
      const found = (deptsResponse?.items || []).find((d) => d.id === batch?.productionPlan?.route?.assemblyDepartmentId);
      if (found) return found;
    }
    return assemblyDepartment || null;
  }, [batch, deptsResponse?.items, assemblyDepartment]);

  const nextDepartmentId = resolvedNextDept?.id || '';
  const nextDepartmentName = resolvedNextDept?.name || 'Assembly Department';
  const nextDepartmentCode = resolvedNextDept?.code || '';

  // Set default handover target department when modal opens
  useEffect(() => {
    if (nextDepartmentId && !handoverTargetDeptId) {
      setHandoverTargetDeptId(nextDepartmentId);
    }
  }, [nextDepartmentId, handoverTargetDeptId]);

  const currentCheckpoint = qcCheckpoints[0] || null;
  const latestInspection = useMemo(() => {
    if (currentCheckpoint?.latestInspection) return currentCheckpoint.latestInspection;
    if (inspectionHistory && inspectionHistory.length > 0) return inspectionHistory[0];
    return null;
  }, [currentCheckpoint, inspectionHistory]);

  const isQcPassed = latestInspection?.status === 'PASS';
  const isQcFailed = latestInspection
    ? ['FAIL', 'REJECT', 'REJECT_SCRAP', 'REWORK'].includes(latestInspection.status)
    : false;
  const defectiveQty = Number(latestInspection?.defectiveQuantity || 0);

  // Available quantity to handover = completed_qty minus quantity already handed over in accepted/proposed handovers
  const alreadyHandedOverQty = useMemo(() => {
    return (batch?.outgoingHandovers || [])
      .filter((h) => ['PROPOSED', 'ACCEPTED'].includes(h.status))
      .reduce((sum, h) => sum + Number(h.quantity || 0), 0);
  }, [batch?.outgoingHandovers]);

  const rawAvailableToHandover = Math.max(0, Number((compQty - alreadyHandedOverQty).toFixed(6)));
  // When quality gate flags non-conformance, downstream handover is held under Invariant V-009
  const availableToHandover = isQcFailed ? 0 : rawAvailableToHandover;

  // Worker dropdown options (filtered to current department)
  const workerOptions: SearchableOption[] = useMemo(() => {
    return departmentEmployees.map((emp) => ({
      id: emp.id,
      name: `${emp.firstName} ${emp.lastName}`,
      code: emp.employeeCode || undefined,
    }));
  }, [departmentEmployees]);

  // Workstation RBAC & Scoping
  const isManagerOrAdmin = useMemo(() => {
    if (!user) return false;
    const roleKey = String(user.roleDefinition?.key || user.role || '')
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    const allowed = [
      'admin',
      'system_admin',
      'super_admin',
      'plant_manager',
      'operations_manager',
      'production_manager',
      'store_manager',
      'storemanager'
    ];
    if (allowed.includes(roleKey)) return true;
    return (user.roles ?? []).some((r) =>
      allowed.includes(String(r.key || r.name).toLowerCase().replace(/[\s-]+/g, '_'))
    );
  }, [user]);

  const isUserAssemblyDept = useMemo(() => {
    return Boolean(
      user?.isAssemblyDepartment ||
      user?.assignedDepartment?.isAssembly ||
      /assembly/i.test(user?.department || '') ||
      /assembly/i.test(user?.assignedDepartment?.name || '')
    );
  }, [user]);

  const isDifferentDept = useMemo(() => {
    if (isManagerOrAdmin) return false;
    const userDeptId = user?.assignedDepartmentId;
    if (!userDeptId || !batch?.departmentId) return false;
    return userDeptId !== batch.departmentId;
  }, [isManagerOrAdmin, user?.assignedDepartmentId, batch?.departmentId]);

  const canExecuteBatch = useMemo(() => {
    if (isManagerOrAdmin) return true;
    if (isUserAssemblyDept) return false;
    if (isDifferentDept) return false;
    return true;
  }, [isManagerOrAdmin, isUserAssemblyDept, isDifferentDept]);

  // Handlers
  const handleCopyBatch = () => {
    if (!batch?.batchNumber) return;
    navigator.clipboard.writeText(batch.batchNumber);
    setCopiedBatch(true);
    showToast({ kind: 'success', title: 'Copied', message: `Batch ${batch.batchNumber} copied.` });
    setTimeout(() => setCopiedBatch(false), 2000);
  };

  const handleReceiveAllMaterials = async () => {
    const pendingAssignments = batch?.materialAssignments?.filter((assignment: any) =>
      Number(assignment.issuedQty || 0) > Number(assignment.receivedQty || 0)
    ) || [];
    setReceiptQuantities(Object.fromEntries(pendingAssignments.map((assignment: any) => [
      assignment.id,
      String(Number((Number(assignment.issuedQty || 0) - Number(assignment.receivedQty || 0)).toFixed(6)))
    ])));
    setShowReceiveMaterialsModal(true);
  };

  const handleSubmitMaterialReceipt = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const pendingAssignments = batch?.materialAssignments?.filter((assignment: any) =>
      Number(assignment.issuedQty || 0) > Number(assignment.receivedQty || 0)
    ) || [];
    const receipts = pendingAssignments.map((assignment: any) => ({
      assignment,
      quantity: Number(receiptQuantities[assignment.id] || 0),
      remaining: Number(assignment.issuedQty || 0) - Number(assignment.receivedQty || 0)
    })).filter(({ quantity }) => quantity > 0);
    if (receipts.some(({ quantity, remaining }) => !Number.isFinite(quantity) || quantity > remaining)) {
      showToast({ kind: 'error', title: 'Invalid receipt quantity', message: 'Each accepted quantity must be within the remaining issued amount.' });
      return;
    }
    if (!receipts.length) {
      showToast({ kind: 'error', title: 'Enter a quantity', message: 'Enter at least one quantity to accept.' });
      return;
    }
    try {
      for (const { assignment, quantity } of receipts) {
        await receiveAssignmentMutation.mutateAsync({ assignmentId: assignment.id, quantity });
      }
      setShowReceiveMaterialsModal(false);
      refetch();
    } catch { /* mutation errors are surfaced upstream */ }
  };

  const handleStartWork = async () => {
    const employeeId = batch?.workerAssignments?.[0]?.employeeId || departmentEmployees[0]?.id;
    if (!employeeId) {
      showToast({
        kind: 'error',
        title: 'Worker Assignment Required',
        message: 'Please assign a worker before starting this batch.',
      });
      return;
    }
    try {
      await startBatchMutation.mutateAsync({ batchId, employeeId });
      refetch();
    } catch { /* mutation errors are surfaced upstream */ }
  };

  const handlePauseWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pauseReason.trim()) {
      showToast({ kind: 'error', title: 'Reason Required', message: 'Please enter a reason for pausing.' });
      return;
    }
    const empId = batch?.workerAssignments?.[0]?.employeeId || departmentEmployees[0]?.id || user?.id || '';
    try {
      await pauseBatchMutation.mutateAsync({ batchId, employeeId: empId, reason: pauseReason.trim() });
      setShowPauseModal(false);
      setPauseReason('');
      refetch();
    } catch { /* mutation errors are surfaced upstream */ }
  };

  const handleResumeWork = async () => {
    const employeeId = batch?.workerAssignments?.[0]?.employeeId || departmentEmployees[0]?.id || user?.id || '';
    try {
      await resumeBatchMutation.mutateAsync({ batchId, employeeId });
      refetch();
    } catch { /* mutation errors are surfaced upstream */ }
  };

  const handleUnassignWorker = async (employeeId: string, employeeName: string) => {
    try {
      await unassignWorkerMutation.mutateAsync({ batchId, employeeId });
      showToast({
        kind: 'success',
        title: 'Operator Removed',
        message: `${employeeName} was unassigned from this batch.`,
      });
      refetch();
    } catch { /* mutation errors are surfaced upstream */ }
  };

  const handleRecordProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    const additionalUnits = Number(progressUnits);
    if (!additionalUnits || additionalUnits <= 0) {
      showToast({ kind: 'error', title: 'Invalid Quantity', message: 'Please enter a valid completed quantity.' });
      return;
    }
    if (additionalUnits > custodyAvailable) {
      showToast({
        kind: 'error',
        title: 'Exceeds Available Custody',
        message: `Cannot complete ${additionalUnits} ${uomSymbol}. Only ${custodyAvailable} ${uomSymbol} are currently ready in custody${awaitingUpstream > 0 ? ` (${awaitingUpstream} ${uomSymbol} awaiting delivery from ${upstreamDeptName})` : ''}.`
      });
      return;
    }
    const currentCompleted = Number(batch?.completed_qty || 0);
    const newTotalCompleted = Number((currentCompleted + additionalUnits).toFixed(6));

    const empId = progressWorkerId || batch?.workerAssignments?.[0]?.employeeId || departmentEmployees[0]?.id || user?.id || '';
    if (!empId) {
      showToast({ kind: 'error', title: 'Worker Required', message: 'Select worker recording this progress.' });
      return;
    }

    try {
      await recordProgressMutation.mutateAsync({
        batchId,
        employeeId: empId,
        quantityDelta: additionalUnits,
        completed_qty: newTotalCompleted,
        scrap_qty: progressScrap ? Number(progressScrap) : undefined,
        wastage_qty: progressWastage ? Number(progressWastage) : undefined,
        notes: progressNotes.trim() || undefined,
      });
      setShowProgressModal(false);
      setProgressUnits('');
      setProgressScrap('');
      setProgressWastage('');
      setProgressNotes('');
      refetch();
    } catch { /* mutation errors are surfaced upstream */ }
  };

  const handleCompleteBatch = async () => {
    const empId = batch?.workerAssignments?.[0]?.employeeId || departmentEmployees[0]?.id || user?.id || '';
    const completed_qty = Number(batch?.completed_qty ?? 0);
    try {
      await completeBatchMutation.mutateAsync({ batchId, employeeId: empId, completed_qty });
      refetch();
    } catch { /* mutation errors are surfaced upstream */ }
  };

  const fetchInspectionHistory = async () => {
    if (!batchId) return;
    setIsLoadingInspections(true);
    try {
      const res = await qualityApi.getBatchHistory(batchId);
      setInspectionHistory(Array.isArray(res) ? res : (res as any)?.inspections || []);
    } catch {
      // Non-blocking
    } finally {
      setIsLoadingInspections(false);
    }
  };

  const fetchQcCheckpoints = async () => {
    if (!batchId) return;
    setIsLoadingQc(true);
    try {
      const res = await qualityApi.resolveCheckpoints('BATCH', batchId);
      setQcCheckpoints(res.checkpoints || []);
      await fetchInspectionHistory();
    } catch {
      // Non-blocking
    } finally {
      setIsLoadingQc(false);
    }
  };

  useEffect(() => {
    fetchQcCheckpoints();
    fetchInspectionHistory();
  }, [batchId]);

  const handleAutoApproveDefaultInProcessQcRule = async () => {
    if (!batch) return;
    setIsAutoApprovingQc(true);
    try {
      const ruleCode = `QC-PROC-${batch.department?.code || 'DEPT'}-${Date.now().toString().slice(-4)}`;
      const ruleName = `${batch.department?.name || 'Department'} In-Process Tolerances Gate`;
      const created = await qualityApi.createRule({
        code: ruleCode,
        name: ruleName,
        description: `Standard in-process dimensional & visual inspection criteria for ${batch.department?.name || 'department'} workstation execution.`,
        targetType: 'DEPARTMENT',
        targetId: batch.departmentId || null,
        parameters: {
          templateId: 'IN_PROCESS_GENERIC',
          minPassingScore: 95,
          passingScoreThreshold: 95,
          samplingPercentage: 100,
          samplingRatePercentage: 100,
          defaultFailureAction: 'REWORK',
          criteriaChecklist: [
            {
              name: 'Dimensional Tolerances & Fitment Verification',
              type: 'NUMERIC',
              required: true,
              severity: 'CRITICAL',
              nominalValue: '10.0',
              minTolerance: '-0.1',
              maxTolerance: '+0.1',
              unit: 'mm',
              inspectionMethod: 'Digital Vernier Caliper / Micrometer'
            },
            {
              name: 'Surface Finish & Edge Deburring Inspection',
              type: 'VISUAL',
              required: true,
              severity: 'MAJOR',
              inspectionMethod: 'Visual inspection under 1000 lux illumination'
            },
            {
              name: 'Workpiece Structural Integrity & Crack Free',
              type: 'BOOLEAN',
              required: true,
              severity: 'CRITICAL',
              inspectionMethod: 'Physical tactile & non-destructive check'
            }
          ],
          criteria: [
            {
              name: 'Dimensional Tolerances & Fitment Verification',
              type: 'NUMERIC',
              required: true,
              severity: 'CRITICAL',
              nominalValue: '10.0',
              minTolerance: '-0.1',
              maxTolerance: '+0.1',
              unit: 'mm',
              inspectionMethod: 'Digital Vernier Caliper / Micrometer'
            },
            {
              name: 'Surface Finish & Edge Deburring Inspection',
              type: 'VISUAL',
              required: true,
              severity: 'MAJOR',
              inspectionMethod: 'Visual inspection under 1000 lux illumination'
            },
            {
              name: 'Workpiece Structural Integrity & Crack Free',
              type: 'BOOLEAN',
              required: true,
              severity: 'CRITICAL',
              inspectionMethod: 'Physical tactile & non-destructive check'
            }
          ]
        },
        effectiveFrom: new Date().toISOString()
      });
      if (created?.id) {
        await qualityApi.approveRule(created.id);
      }
      showToast({
        kind: 'success',
        title: 'QC Gate Criteria Approved',
        message: `Standard in-process QC criteria rule ${ruleCode} approved. Quality gate is unlocked.`
      });
      await fetchQcCheckpoints();
      refetch();
    } catch (err: unknown) {
      showToast({
        kind: 'error',
        title: 'QC Approval Failed',
        message: err instanceof Error ? err.message : 'Could not auto-approve QC rule.'
      });
    } finally {
      setIsAutoApprovingQc(false);
    }
  };

  const qcTargetItem = useMemo(() => {
    return {
      targetType: 'BATCH' as const,
      targetId: batchId,
      referenceNumber: batch?.batchNumber || batchId,
      checkpointType: currentCheckpoint?.checkpointType || ('IN_PROCESS' as any),
      itemDescription: `${outputItemName} (${batch?.department?.name || 'Department Workstation'})`,
      quantity: Number(batch?.completed_qty || batch?.received_qty || 1),
      qcRuleId: currentCheckpoint?.qcRuleId || null,
      hasApprovedCriteria: currentCheckpoint?.hasApprovedCriteria ?? false,
      missingCriteriaReason: currentCheckpoint?.missingCriteriaReason || null,
      latestInspectionStatus: (latestInspection?.status as any) || null,
      latestInspectionId: latestInspection?.id || null,
      requiresInspection: true,
      canInspect: true,
      createdAt: batch?.createdAt || new Date().toISOString(),
    };
  }, [batchId, batch, currentCheckpoint, outputItemName, latestInspection]);

  const handleExecuteQcScrapWriteOff = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!latestInspection || isWritingOffScrap) return;

    setIsWritingOffScrap(true);
    const defectQty = Number(latestInspection.defectiveQuantity || 1);
    const currentCompleted = Number(batch?.completed_qty || 0);
    const currentScrap = Number(batch?.scrap_qty || 0);
    const newCompleted = Math.max(0, currentCompleted - defectQty);
    const newScrap = currentScrap + defectQty;
    const empId = batch?.workerAssignments?.[0]?.employeeId || departmentEmployees[0]?.id || user?.id || '';

    try {
      // 1. Post to Scrap & Wastage module (register formal loss event)
      const targetMaterialId = (batch as any)?.materialAssignments?.[0]?.materialId || null;
      const targetProductId = batch?.productionPlan?.productId || (batch as any)?.productId || null;
      const targetUomId = batch?.productionPlan?.product?.uom?.id || (batch as any)?.uomId || (batch as any)?.product?.uomId;

      await lossApi.report({
        sourceType: 'DEPARTMENT_EXECUTION_EXCEPTION',
        sourceExceptionRecordId: null,
        materialId: targetProductId ? null : targetMaterialId,
        productId: targetProductId,
        uomId: targetUomId,
        departmentId: batch?.departmentId || null,
        quantity: defectQty,
        reason: `[In-Process QC Reject] Batch: ${batch?.batchNumber || batchId}. Inspection #${latestInspection.inspectionNumber}: ${qcScrapNotes.trim() || latestInspection.reason || 'Dimensional defect'}`,
      });

      // 2. Update Batch Execution WIP accounting (deduct from completed, add to scrap)
      if (empId) {
        await recordProgressMutation.mutateAsync({
          batchId,
          employeeId: empId,
          completed_qty: newCompleted,
          scrap_qty: newScrap,
          notes: `Defects (${defectQty} ${uomSymbol}) written off to scrap register.`
        });
      }

      // 3. Clear the Quality Gate for the remaining conforming lot
      if (currentCheckpoint?.qcRuleId) {
        await qualityApi.recordInspection({
          checkpointType: currentCheckpoint.checkpointType || 'IN_PROCESS',
          targetType: 'BATCH',
          targetId: batchId,
          inspectorEmployeeId: empId || departmentEmployees[0]?.id || user?.id || '',
          qcRuleId: currentCheckpoint.qcRuleId,
          sampledQuantity: newCompleted > 0 ? newCompleted : defectQty,
          defectiveQuantity: 0,
          status: 'PASS',
          reason: `Defective units (${defectQty} ${uomSymbol}) written off to scrap. Remaining conforming lot (${newCompleted} ${uomSymbol}) cleared for handover.`
        });
      }

      showToast({
        kind: 'success',
        title: 'Defects Written Off & QC Gate Cleared',
        message: `${defectQty} ${uomSymbol} logged into Scrap & Wastage register. Remaining ${newCompleted} ${uomSymbol} passed QC and unlocked for handover.`
      });

      setShowQcScrapModal(false);
      refetch();
      fetchQcCheckpoints();
      fetchInspectionHistory();
      refetchLossEvents();
    } catch (err: any) {
      showToast({
        kind: 'error',
        title: 'Write-off Failed',
        message: err?.message || 'Failed to complete scrap write-off.'
      });
    } finally {
      setIsWritingOffScrap(false);
    }
  };

  const handleProposeHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(handoverQty);
    if (!qty || qty <= 0) {
      showToast({ kind: 'error', title: 'Quantity Required', message: 'Enter a valid handover quantity.' });
      return;
    }
    if (qty > availableToHandover) {
      showToast({
        kind: 'error',
        title: 'Exceeds Available Qty',
        message: `Only ${availableToHandover} ${uomSymbol} is available to hand over.`,
      });
      return;
    }
    const targetDeptId = nextDepartmentId || handoverTargetDeptId;
    if (!targetDeptId) {
      showToast({ kind: 'error', title: 'Destination Required', message: 'Next department could not be resolved from floor route.' });
      return;
    }

    try {
      await proposeHandoverMutation.mutateAsync({
        batchId,
        incomingDepartmentId: targetDeptId,
        quantity: qty,
        idempotencyKey: `HANDOVER-${batchId}-${Date.now()}`,
        notes: handoverNotes.trim() || undefined,
      });
      setShowHandoverModal(false);
      setHandoverQty('');
      setHandoverNotes('');
      refetch();
    } catch { /* mutation errors are surfaced upstream */ }
  };

  const handleAcceptIncomingHandover = async (handoverId: string) => {
    try {
      await decideHandoverMutation.mutateAsync({
        handoverId,
        status: 'ACCEPTED',
        idempotencyKey: `ACCEPT-${handoverId}-${Date.now()}`,
      });
      refetch();
    } catch { /* mutation errors are surfaced upstream */ }
  };

  const handleRefuseIncomingHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refusingHandoverId || !refusalReason.trim()) {
      showToast({ kind: 'error', title: 'Reason Required', message: 'Please provide a refusal reason.' });
      return;
    }
    try {
      await decideHandoverMutation.mutateAsync({
        handoverId: refusingHandoverId,
        status: 'REFUSED',
        refusalReason: refusalReason.trim(),
        idempotencyKey: `REFUSE-${refusingHandoverId}-${Date.now()}`,
      });
      setShowRefuseModal(false);
      setRefusingHandoverId(null);
      setRefusalReason('');
      refetch();
    } catch { /* mutation errors are surfaced upstream */ }
  };

  if (isLoadingBatch) {
    return <LoadingState message="Loading department workstation..." />;
  }

  if (isError || !batch) {
    return <ErrorState error={(error as Error) || new Error('Batch not found')} retry={() => refetch()} />;
  }

  return (
    <div className="flex-1 min-h-screen bg-background p-4 sm:p-6 md:p-8 space-y-6 overflow-y-auto">
      {/* ── Top Header & Actions ──────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Link
              href={batch.productionPlanId ? `/production/execution/plans/${batch.productionPlanId}` : '/production/execution'}
              className="hover:text-foreground transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Schedule</span>
            </Link>
            <span>/</span>
            <span className="font-mono font-bold text-foreground flex items-center gap-1.5">
              {batch.batchNumber}
              <button
                type="button"
                onClick={handleCopyBatch}
                className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
                title="Copy Batch Number"
              >
                {copiedBatch ? <Check className="h-3.5 w-3.5 text-tone-green-text" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </span>
          </nav>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs font-semibold"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Assembly Department Scope Notice Banner */}
        {isUserAssemblyDept && (
          <div className="rounded-2xl border border-border bg-card p-4 text-foreground shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0 mt-0.5">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">Assembly Department Scope Notice</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This workstation belongs to <strong className="underline text-foreground">{batch.department?.name || 'a normal production department'}</strong>. As an Assembly department member, your operations take place in the dedicated Assembly & Convergence workspace and schedule assembly gate.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href="/production/assembly">
                  <Button size="sm" className="h-9 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs cursor-pointer">
                    Go to Assembly & Convergence
                  </Button>
                </Link>
                {batch.productionPlanId && (
                  <Link href={`/production/execution/plans/${batch.productionPlanId}?tab=assembly`}>
                    <Button size="sm" variant="outline" className="h-9 px-3.5 rounded-xl border border-border hover:bg-muted/80 text-foreground font-semibold text-xs transition-all">
                      Schedule Assembly Gate
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cross-Department Access Notice (Read-Only) */}
        {!isUserAssemblyDept && isDifferentDept && (
          <div className="rounded-2xl border border-tone-blue-solid/25 bg-tone-blue-bg p-4 text-tone-blue-text">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-tone-blue-text shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">Read-Only View · Department Scoping</h4>
                <p className="text-xs text-tone-blue-text mt-0.5">
                  You are viewing a <strong className="underline">{batch.department?.name || 'Department'}</strong> stage. You are assigned to <strong className="underline">{user?.assignedDepartment?.name || 'a different department'}</strong>. Execution actions are restricted to operators and supervisors of this department.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Executive Batch Header Card */}
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Factory className="h-5 w-5" />
                </span>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground font-mono">
                  {batch.batchNumber}
                </h1>
                <StatusBadge status={batch.status as any} />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  Department: <strong className="text-primary">{batch.department?.name || 'Department'}</strong>
                </span>
                <span>•</span>
                <span>
                  Operation:{' '}
                  <strong className="text-foreground">
                    Stage {batch.stageSequenceNumber} · {batch.routeStep?.stepName || 'Production Operation'}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Produced Component:{' '}
                  <strong className="text-foreground">{outputItemName}</strong>
                  {outputItemCode && <span className="font-mono text-muted-foreground ml-1">({outputItemCode})</span>}
                </span>
                <span>•</span>
                <span>
                  Plan Target:{' '}
                  <strong className="text-foreground">{planProductName}</strong>
                  {planProductSku && <span className="font-mono text-muted-foreground ml-1">({planProductSku})</span>}
                  {planQuantity > 0 && <span className="font-mono text-muted-foreground ml-1">· {planQuantity} {planUom}</span>}
                </span>
              </div>
            </div>

            {/* Contextual Primary Action Button */}
            <div className="flex flex-wrap items-center gap-2">
              {canExecuteBatch ? (
                <>
                  {!['COMPLETE', 'CANCELLED'].includes(batch.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAssignWorkerModal(true)}
                      className="text-xs font-semibold cursor-pointer border-border hover:bg-muted/30"
                    >
                      <Users className="h-3.5 w-3.5 mr-1.5 text-primary" />
                      Assign Worker
                    </Button>
                  )}

                  {!['CANCELLED'].includes(batch.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowReportLossModal(true)}
                      className="text-xs font-semibold cursor-pointer border-tone-red-solid/25 text-tone-red-text hover:bg-tone-red-bg"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5 text-tone-red-text" />
                      Report Loss &amp; Scrap
                    </Button>
                  )}

                  {currentCheckpoint?.hasApprovedCriteria ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowQcInspectionModal(true)}
                      className="h-9 px-3.5 text-xs font-semibold rounded-xl border border-primary/30 text-primary hover:bg-primary/10 transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>{currentCheckpoint.latestInspection ? 'QC Re-Inspection' : 'In-Process QC'}</span>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowQcRuleModal(true)}
                      className="h-9 px-3.5 text-xs font-semibold rounded-xl border border-border hover:bg-muted/80 text-foreground transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Scale className="h-3.5 w-3.5 text-primary" />
                      <span>Configure QC Rule</span>
                    </Button>
                  )}

                  {['AWAITING_RECEIPT', 'PENDING'].includes(batch.status) && (
                    <Button
                      size="sm"
                      onClick={handleReceiveAllMaterials}
                      disabled={receiveAssignmentMutation.isPending}
                      className="bg-action hover:bg-[color:var(--action-primary-bg-hover)] text-inverse font-semibold text-xs shadow-none cursor-pointer"
                    >
                      <PackageCheck className="h-3.5 w-3.5 mr-1.5" />
                      {receiveAssignmentMutation.isPending ? 'Recording receipt...' : 'Accept Allocated Materials'}
                    </Button>
                  )}

                  {['RECEIVED', 'ASSIGNED'].includes(batch.status) && (
                    <Button
                      size="sm"
                      onClick={handleStartWork}
                      disabled={startBatchMutation.isPending}
                      className="bg-primary text-primary-foreground font-semibold text-xs shadow-none cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      Start Production Work
                    </Button>
                  )}

                  {['IN_PROGRESS', 'PARTIAL'].includes(batch.status) && (
                    <>
                      {!isTargetFullyCompleted && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => setShowProgressModal(true)}
                            className={`${custodyAvailable > 0
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'
                              } font-semibold text-xs shadow-none cursor-pointer`}
                            title={
                              custodyAvailable > 0
                                ? `${custodyAvailable} ${uomSymbol} ready to complete in custody`
                                : `All received materials completed. Awaiting ${awaitingUpstream} ${uomSymbol} from ${upstreamDeptName}.`
                            }
                          >
                            {custodyAvailable > 0 ? (
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            ) : (
                              <Clock className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            {custodyAvailable > 0
                              ? `Record Progress (${custodyAvailable} ${uomSymbol} Ready)`
                              : `Record Progress (${awaitingUpstream} Awaiting Upstream)`}
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowPauseModal(true)}
                            className="text-xs font-semibold cursor-pointer border-border hover:bg-muted/80"
                          >
                            <Pause className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                            Pause Work
                          </Button>
                        </>
                      )}

                      {isTargetFullyCompleted && (
                        <Button
                          size="sm"
                          onClick={handleCompleteBatch}
                          disabled={completeBatchMutation.isPending}
                          className="bg-tone-green-solid hover:bg-[color:var(--tone-green-text)] text-inverse font-semibold text-xs shadow-none cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5 mr-1.5" />
                          Complete Stage
                        </Button>
                      )}
                    </>
                  )}

                  {batch.status === 'PAUSED' && (
                    <Button
                      size="sm"
                      onClick={handleResumeWork}
                      disabled={resumeBatchMutation.isPending}
                      className="bg-primary text-primary-foreground font-semibold text-xs shadow-none cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      Resume Work
                    </Button>
                  )}

                  <Button
                    size="sm"
                    disabled={!canExecuteBatch || availableToHandover <= 0 || isQcFailed}
                    onClick={() => {
                      if (isQcFailed) {
                        showToast({
                          kind: 'error',
                          title: 'Handover Blocked by Quality Gate',
                          message: `Downstream handover is held due to quality non-conformance (${defectiveQty} defective ${uomSymbol} flagged in inspection #${latestInspection?.inspectionNumber || ''}). Please write off defects to scrap or perform re-inspection to unlock handover.`
                        });
                        return;
                      }
                      setHandoverQty(String(availableToHandover));
                      setShowHandoverModal(true);
                    }}
                    className="bg-tone-green-solid hover:bg-tone-green-solid text-inverse font-semibold text-xs shadow-none cursor-pointer disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    <span>Hand Over ({availableToHandover} {uomSymbol})</span>
                  </Button>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs font-semibold text-muted-foreground border border-border">
                    {isUserAssemblyDept ? 'Assembly Workspace · Read-Only Workstation' : 'Station Scoped · Read-Only Workstation'}
                  </span>
                  {isUserAssemblyDept && (
                    <Link href="/production/assembly">
                      <Button size="sm" className="bg-tone-green-solid hover:bg-tone-green-solid text-inverse font-semibold text-xs shadow-none cursor-pointer">
                        Assembly & Convergence
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Key Metric Summary Cards ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="p-4 rounded-xl border border-border bg-card shadow-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Target Output</p>
            <p className="text-xl font-bold font-mono text-foreground mt-1">
              {expQty.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{uomSymbol}</span>
            </p>
            <p className="text-xs font-semibold text-foreground truncate mt-0.5" title={outputItemName}>
              {outputItemName}
            </p>
            {outputItemCode && (
              <p className="text-[10px] font-mono text-muted-foreground truncate">{outputItemCode}</p>
            )}
          </Card>

          <Card className="p-4 rounded-xl border border-border bg-card shadow-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Input Materials &amp; Custody</p>
            <p className="text-xl font-bold font-mono text-foreground mt-1">
              {recQty.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{uomSymbol}</span>
            </p>
            <p className="text-xs font-semibold text-foreground truncate mt-0.5" title={firstMaterialAssignment?.bomLine?.material?.name || firstMaterialAssignment?.bomLine?.componentProduct?.name || (batch.incomingHandovers?.[0] as any)?.itemName || 'Materials in Custody'}>
              {firstMaterialAssignment?.bomLine?.material?.name || firstMaterialAssignment?.bomLine?.componentProduct?.name || (batch.incomingHandovers?.[0] as any)?.itemName || 'Accepted in custody'}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
              {hasPartialMaterialReceipt ? (
                <span className="text-primary font-medium">Partially received</span>
              ) : ['AWAITING_RECEIPT', 'PENDING'].includes(batch.status) ? (
                <span className="text-primary font-medium">Awaiting acceptance</span>
              ) : allMaterialsReceived ? (
                <span className="text-tone-green-text font-medium">All materials received</span>
              ) : awaitingUpstream > 0 ? (
                <span className="text-muted-foreground font-medium">{awaitingUpstream} {uomSymbol} awaiting {upstreamDeptName}</span>
              ) : (
                <span className="text-tone-green-text font-medium">Accepted in custody</span>
              )}
              {firstMaterialAssignment?.issuedQty && (
                <span>• {Number(firstMaterialAssignment.receivedQty || 0)} / {Number(firstMaterialAssignment.issuedQty)} {firstMaterialAssignment.bomLine?.uom?.symbol || 'units'}</span>
              )}
            </p>
          </Card>

          <Card className="p-4 rounded-xl border border-border bg-card shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Completed WIP</p>
              <span className="font-mono text-xs font-bold text-primary">{progressPercent}%</span>
            </div>
            <p className="text-xl font-bold font-mono text-foreground mt-1">
              {compQty.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{uomSymbol}</span>
            </p>
            <p className="text-xs font-semibold text-foreground truncate mt-0.5" title={outputItemName}>
              {outputItemName}
            </p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </Card>

          <Card className="p-4 rounded-xl border border-border bg-card shadow-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pending Output (WIP)</p>
            <p className="text-xl font-bold font-mono text-foreground mt-1">
              {custodyAvailable.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{uomSymbol}</span>
            </p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {custodyAvailable > 0
                ? `Ready to process in custody`
                : awaitingUpstream > 0
                  ? `Awaiting: ${awaitingUpstream.toLocaleString()} ${uomSymbol} from ${upstreamDeptName}`
                  : `All ${expQty} ${uomSymbol} completed`}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {totalLoss > 0 ? (
                <span className="text-destructive font-medium">
                  Loss: {totalLoss} {uomSymbol}
                </span>
              ) : (
                <span>0 defects logged</span>
              )}
            </p>
          </Card>
        </div>

        {/* ── Tab Navigation ─────────────────────────────────────────────────── */}
        <div className="flex border-border-strong border-border/80">
          <button
            type="button"
            onClick={() => setActiveTab('workstation')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-border-strong-2 transition-colors cursor-pointer ${activeTab === 'workstation'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
          >
            <Factory className="h-4 w-4" />
            <span>Workstation &amp; Tasks</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('handovers')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-border-strong-2 transition-colors cursor-pointer ${activeTab === 'handovers'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
          >
            <Send className="h-4 w-4" />
            <span>
              Handovers ({((batch.outgoingHandovers?.length || 0) + (batch.incomingHandovers?.length || 0))})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-border-strong-2 transition-colors cursor-pointer ${activeTab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
          >
            <HistoryIcon className="h-4 w-4" />
            <span>Audit Timeline</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: WORKSTATION EXECUTION ────────────────────────────────────── */}
      {activeTab === 'workstation' && (
        <div className="space-y-6">
          {/* Card 1: Allocated BOM Materials (Intake) */}
          <Card className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-border-strong border-border/60 pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-primary" />
                  Allocated Input Materials
                </h3>
                <p className="text-xs text-muted-foreground">
                  Materials issued from warehouse or upstream department for this stage
                </p>
              </div>

            </div>

            {batch.materialAssignments && batch.materialAssignments.length > 0 ? (
              <div className="rounded-lg border border-border/80 overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/40 border-border-strong border-border/60 text-muted-foreground font-semibold">
                      <th className="py-2.5 px-3">Item / Material</th>
                      <th className="py-2.5 px-3">Required</th>
                      <th className="py-2.5 px-3">Issued</th>
                      <th className="py-2.5 px-3">Received</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {batch.materialAssignments.map((assignment: any) => {
                      const itemTitle =
                        assignment.bomLine?.material?.name ||
                        assignment.bomLine?.componentProduct?.name ||
                        assignment.itemId;
                      const itemCode =
                        assignment.bomLine?.material?.code ||
                        assignment.bomLine?.componentProduct?.sku;
                      const unit = assignment.bomLine?.uom?.symbol || 'units';
                      const receivedQty = Number(assignment.receivedQty || 0);
                      const issuedQty = Number(assignment.issuedQty || 0);
                      const isFullyReceived = receivedQty >= issuedQty;
                      const isPartiallyReceived = receivedQty > 0 && !isFullyReceived;

                      return (
                        <tr key={assignment.id} className="hover:bg-muted/10 transition-colors">
                          <td className="py-2 px-3 font-medium text-foreground">
                            <div>{itemTitle}</div>
                            {itemCode && <div className="text-[10px] font-mono text-muted-foreground">{itemCode}</div>}
                          </td>
                          <td className="py-2 px-3 font-mono">{Number(assignment.requiredQty || 0)} {unit}</td>
                          <td className="py-2 px-3 font-mono">{Number(assignment.issuedQty || 0)} {unit}</td>
                          <td className="py-2 px-3 font-mono font-semibold text-foreground">
                            {Number(assignment.receivedQty || 0)} {unit}
                          </td>
                          <td className="py-2 px-3">
                            {isFullyReceived ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-tone-green-text">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Received
                              </span>
                            ) : isPartiallyReceived ? (
                              <span className="inline-flex flex-col text-[11px] font-semibold text-tone-blue-text">
                                <span>Partially received</span>
                                <span className="font-mono text-[10px]">{receivedQty} / {issuedQty} {unit}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                                <Clock className="h-3.5 w-3.5 text-primary" /> Pending
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic py-2">
                No specific raw materials assigned to this batch (sourced from upstream handover or direct processing).
              </p>
            )}
          </Card>

          {/* Card 2: Department Workers Assignment */}
          <Card className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
            <div className="border-border-strong border-border/60 pb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Assigned Department Workers
              </h3>
              <p className="text-xs text-muted-foreground">
                Shop-floor operators working on this workstation operation
              </p>
            </div>

            {/* Currently assigned workers list */}
            {batch.workerAssignments && batch.workerAssignments.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {batch.workerAssignments.map((assignment: any) => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/80 bg-background shadow-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="h-8 w-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                        {(assignment.employee?.firstName?.[0] || 'W').toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">
                          {assignment.employee?.firstName} {assignment.employee?.lastName}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {assignment.subtaskDescription || assignment.employee?.employeeCode || 'Operator'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-medium text-muted-foreground font-mono">
                        {new Date(assignment.assignedAt).toLocaleDateString()}
                      </span>
                      {!['COMPLETE', 'CANCELLED'].includes(batch.status) && canExecuteBatch && (
                        <button
                          type="button"
                          onClick={() =>
                            handleUnassignWorker(
                              assignment.employeeId,
                              `${assignment.employee?.firstName || ''} ${assignment.employee?.lastName || ''}`.trim() || 'Operator'
                            )
                          }
                          disabled={unassignWorkerMutation.isPending}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                          title="Remove operator from batch"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center space-y-2 rounded-lg border border-dashed border-border/80 bg-muted/5">
                <Users className="h-6 w-6 text-muted-foreground/60" />
                <p className="text-xs font-medium text-foreground">No operators assigned yet</p>
                <p className="text-[11px] text-muted-foreground max-w-sm">
                  Click <strong>Assign Worker</strong> in the action bar above to assign active operators from {batch.department?.name || 'this department'}.
                </p>
              </div>
            )}
          </Card>

          {/* Card 3: Work in Progress (WIP) Tracking */}
          <Card className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-border-strong border-border/60 pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Work in Progress (WIP) &amp; Execution
                </h3>
                <p className="text-xs text-muted-foreground">
                  Track completed units, progress yield, and loss/scrap
                </p>
              </div>

              {!['CANCELLED'].includes(batch.status) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReportLossModal(true)}
                  className="h-8 text-xs font-semibold border-tone-red-solid/25 text-tone-red-text hover:bg-tone-red-bg cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5 text-tone-red-text" />
                  Report Loss &amp; Scrap
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg bg-muted/20 border border-border/60">
              <div>
                <span className="text-[11px] text-muted-foreground font-medium">Stage Progress</span>
                <p className="text-lg font-black font-mono text-foreground mt-0.5">
                  {compQty} / {expQty} <span className="text-xs font-normal text-muted-foreground">{uomSymbol}</span>
                </p>
                <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 truncate" title={outputItemName}>
                  Producing: {outputItemName}
                </p>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                  <span>Available to Hand Over</span>
                  {isQcFailed && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-tone-red-bg text-tone-red-text border border-tone-red-solid/25">
                      HELD
                    </span>
                  )}
                </span>
                <p className={`text-lg font-black font-mono mt-0.5 ${isQcFailed ? 'text-tone-red-text' : 'text-tone-green-text'}`}>
                  {availableToHandover} <span className="text-xs font-normal text-muted-foreground">{uomSymbol}</span>
                </p>
                <p className={`text-[11px] mt-1 truncate ${isQcFailed ? 'text-tone-red-text font-semibold' : 'text-muted-foreground'}`} title={isQcFailed ? `Quality Gate Non-Conformance (${defectiveQty} defective held)` : `Good ${outputItemName} ready for transfer`}>
                  {isQcFailed ? `Quality Gate Non-Conformance (${defectiveQty} defective held)` : `Good ${outputItemName} ready for transfer`}
                </p>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground font-medium">Logged Loss &amp; Scrap</span>
                <p className="text-lg font-black font-mono text-foreground mt-0.5">
                  {scrapQty + rejQty + wastageQty} <span className="text-xs font-normal text-muted-foreground">{uomSymbol}</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Scrap: {scrapQty} · Reject: {rejQty} · Wastage: {wastageQty}
                </p>
              </div>
            </div>

            {/* Reported Scrap & Loss Events Table */}
            <div className="rounded-xl border border-border overflow-hidden bg-card shadow-2xs">
              <div className="px-4 py-2.5 bg-muted/30 border-border-strong border-border flex items-center justify-between text-xs">
                <span className="font-bold text-foreground flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-tone-red-text" />
                  <span>Reported Scrap &amp; Loss Events ({batchLossEvents.length})</span>
                </span>
                <span className="text-muted-foreground text-[11px]">
                  Workstation Scrap Ledger &amp; Inventory Write-offs
                </span>
              </div>

              {batchLossEvents.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No loss or scrap reported for this workstation run yet. If any raw material is damaged or workpieces are defective, click <strong className="text-foreground">Report Loss &amp; Scrap</strong> above to record them.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-border-strong border-border bg-muted/20 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-2">Event #</th>
                        <th className="px-3 py-2">Classification</th>
                        <th className="px-3 py-2 text-right">Quantity</th>
                        <th className="px-3 py-2">Defect Reason</th>
                        <th className="px-3 py-2">Reported By</th>
                        <th className="px-3 py-2">Timestamp</th>
                        <th className="px-3 py-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {batchLossEvents.map((evt: any) => {
                        const isAbnormal = evt.classification === 'ABNORMAL';
                        const classificationBadgeColor = isAbnormal
                          ? 'bg-destructive/10 text-destructive border-destructive/20'
                          : 'bg-muted text-foreground border-border';

                        return (
                          <tr key={evt.id} className="hover:bg-muted/10 transition-colors">
                            <td className="px-4 py-2.5 font-mono font-bold text-foreground text-xs">
                              {evt.lossNumber || evt.id.slice(-8)}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${classificationBadgeColor}`}>
                                {isAbnormal ? 'ABNORMAL' : 'WITHIN TOLERANCE'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">
                              {Number(evt.quantity || 0)} <span className="text-[10px] font-normal text-muted-foreground">{evt.uomCode || uomSymbol}</span>
                            </td>
                            <td className="px-3 py-2.5 text-foreground max-w-xs truncate" title={evt.reason}>
                              {evt.reason || 'Defective workpiece'}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              {evt.reportedByActorName || evt.reportedBy?.name || 'Operator'}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                              {evt.reportedAt ? new Date(evt.reportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-muted text-foreground border border-border">
                                {evt.status || 'REPORTED'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>

          {/* Card 3.5: In-Process Quality Inspection Gate (QC Gate) */}
          <Card className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-border-strong border-border/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    In-Process Quality Inspection Gate (QC Gate)
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted font-bold text-muted-foreground border border-border">
                      {currentCheckpoint?.checkpointType || 'IN_PROCESS'}
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Enforce quality assurance tolerances, dimensional checks, and defect tracking before downstream dispatch.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {currentCheckpoint?.latestInspection ? (
                  <StatusBadge status={currentCheckpoint.latestInspection.status as any} />
                ) : currentCheckpoint?.hasApprovedCriteria ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold shadow-2xs">
                    <FileCheck2 className="w-3.5 h-3.5" />
                    <span>Inspection Ready</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-muted text-muted-foreground border border-border text-xs font-semibold shadow-2xs">
                    <ShieldAlert className="w-3.5 h-3.5 text-primary" />
                    <span>Pending QC Criteria</span>
                  </span>
                )}
              </div>
            </div>

            {currentCheckpoint?.hasApprovedCriteria ? (
              <div className="space-y-4">
                {/* 1. Rule Identity & Target Header */}
                <div className="p-4 sm:p-5 rounded-2xl border border-border bg-card space-y-3.5 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground">
                          {currentCheckpoint.qcRuleName || currentCheckpoint.qcRuleCode || 'Approved Quality Specification'}
                        </span>
                        <span className="font-mono text-xs text-primary font-bold px-2.5 py-0.5 rounded-lg bg-primary/10 border border-primary/20">
                          {currentCheckpoint.qcRuleCode || 'QC-ACTIVE'}
                        </span>
                        {isQcFailed ? (
                          <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg bg-tone-red-bg text-tone-red-text border border-tone-red-solid/25 flex items-center gap-1.5 shadow-2xs">
                            <ShieldAlert className="w-3.5 h-3.5 text-tone-red-text" />
                            <span>GATE BLOCKED · NON-CONFORMANCE ({latestInspection?.status})</span>
                          </span>
                        ) : isQcPassed ? (
                          <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg bg-tone-green-bg text-tone-green-text border border-tone-green-solid/25 flex items-center gap-1.5 shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-tone-green-text" />
                            <span>GATE CLEARED · PASSED (V-009)</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            <span>CRITERIA CONFIGURED · INSPECTION REQUIRED</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Quality assurance checkpoints enforced for {batch.department?.name || 'this workstation'}. Verify workpiece tolerances before downstream handover.
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                      <Button
                        size="sm"
                        onClick={() => setShowQcInspectionModal(true)}
                        className="h-10 px-4.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        <span>{latestInspection ? 'Perform Re-Inspection' : 'Perform QC Inspection'}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowQcRuleModal(true)}
                        className="h-10 px-4 text-xs font-semibold rounded-xl border border-border bg-background hover:bg-muted/80 text-foreground transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Tune Criteria</span>
                      </Button>
                    </div>
                  </div>

                  {/* Thresholds Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-border/60 text-xs">
                    <div className="p-2.5 rounded-xl bg-muted/40 border border-border/50">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Passing Threshold</span>
                      <span className="font-mono font-bold text-tone-green-text text-xs mt-0.5 block">
                        {(currentCheckpoint.qcRuleParameters as any)?.minPassingScore ?? (currentCheckpoint.qcRuleParameters as any)?.passingScoreThreshold ?? 95}% Minimum
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-muted/40 border border-border/50">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Sampling Rate</span>
                      <span className="font-mono font-bold text-primary text-xs mt-0.5 block">
                        {(currentCheckpoint.qcRuleParameters as any)?.samplingPercentage ?? (currentCheckpoint.qcRuleParameters as any)?.samplingRatePercentage ?? 100}% Sampling
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-muted/40 border border-border/50">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Defect Action</span>
                      <span className="font-bold text-foreground text-xs mt-0.5 block">
                        {(currentCheckpoint.qcRuleParameters as any)?.defaultFailureAction === 'SCRAP' ? 'Scrap & Loss Hub' : 'Loop to Rework'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-muted/40 border border-border/50">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Inspection Method</span>
                      <span className="font-semibold text-muted-foreground text-xs mt-0.5 block">
                        Metrology &amp; Visual Audit
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Interactive Configured Criteria Checklist */}
                {(() => {
                  const checklist = ((currentCheckpoint.qcRuleParameters as any)?.criteriaChecklist ||
                    (currentCheckpoint.qcRuleParameters as any)?.criteria ||
                    []) as Array<any>;

                  if (checklist.length === 0) return null;

                  return (
                    <div className="rounded-2xl border border-border overflow-hidden bg-card shadow-2xs">
                      <div className="px-4 py-3 bg-muted/30 border-border-strong border-border flex items-center justify-between text-xs">
                        <span className="font-bold text-foreground flex items-center gap-2">
                          <FileCheck2 className="w-4 h-4 text-primary" />
                          <span>Configured Quality Criteria Checklist ({checklist.length})</span>
                        </span>
                        <span className="text-muted-foreground text-[11px] font-medium">
                          Active Workstation Tolerances
                        </span>
                      </div>
                      <div className="divide-y divide-border/60">
                        {checklist.map((crit: any, idx: number) => (
                          <div key={idx} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-muted/10 transition-colors">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary font-mono font-bold text-[11px] flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <span className="font-bold text-foreground block text-xs truncate">{crit.name}</span>
                                {crit.type === 'NUMERIC' && crit.nominalValue !== undefined && (
                                  <span className="text-[11px] font-mono text-muted-foreground block">
                                    Nominal: <strong className="text-foreground">{crit.nominalValue} {crit.unit}</strong> (Tolerance: {crit.minTolerance} - {crit.maxTolerance} {crit.unit})
                                  </span>
                                )}
                                {crit.inspectionMethod && (
                                  <span className="text-[11px] text-muted-foreground block mt-0.5">
                                    Tool: {crit.inspectionMethod}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold bg-muted text-foreground border border-border">
                                {crit.type}
                              </span>
                              <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${crit.severity === 'CRITICAL'
                                  ? 'bg-destructive/10 text-destructive border border-destructive/20'
                                  : crit.severity === 'MAJOR'
                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                    : 'bg-muted text-muted-foreground border border-border'
                                }`}>
                                {crit.severity || 'MAJOR'}
                              </span>
                              <span className={`px-2.5 py-1 rounded-md text-[10px] font-semibold ${crit.required !== false
                                  ? 'bg-primary/10 text-primary border border-primary/20'
                                  : 'bg-muted text-muted-foreground border border-border'
                                }`}>
                                {crit.required !== false ? 'Required' : 'Optional'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* 3. Non-Conformance Disposition Hub or Cleared Banner */}
                {latestInspection && (
                  isQcFailed ? (
                    <div className="p-5 rounded-2xl border border-tone-red-solid/25 bg-tone-red-bg space-y-4 shadow-xs">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-tone-red-bg text-tone-red-text border border-tone-red-solid/25 shrink-0 mt-0.5">
                            <ShieldAlert className="h-6 w-6" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-foreground">
                                Quality Non-Conformance Active · Handover Blocked
                              </h4>
                              <span className="px-2 py-0.5 text-[10px] font-mono font-extrabold rounded-md bg-tone-red-bg text-tone-red-text border border-tone-red-solid/25 uppercase">
                                {latestInspection.status}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Inspection #{latestInspection.inspectionNumber} recorded{' '}
                              <strong className="font-mono text-tone-red-text font-bold">{latestInspection.defectiveQuantity} defective {uomSymbol}</strong> out of{' '}
                              <strong className="font-mono text-foreground font-bold">{latestInspection.sampledQuantity} {uomSymbol} sampled</strong>.
                              Downstream handover is held under Invariant V-009 until non-conformance is dispositioned.
                            </p>
                            {latestInspection.reason && (
                              <p className="text-xs italic text-tone-red-text bg-tone-red-bg border border-tone-red-solid/25 rounded-lg p-2 mt-1.5">
                                Defect Observation: &quot;{latestInspection.reason}&quot;
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 3-Way Segregation Metrics */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                        <div className="p-3 rounded-xl bg-background border border-border/80">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                            Total Sampled Lot
                          </span>
                          <span className="font-mono text-base font-bold text-foreground mt-0.5 block">
                            {latestInspection.sampledQuantity} {uomSymbol}
                          </span>
                          <span className="text-[10px] text-muted-foreground">Workpieces inspected</span>
                        </div>

                        <div className="p-3 rounded-xl bg-background border border-border/80">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                            Conforming / Good WIP
                          </span>
                          <span className="font-mono text-base font-bold text-tone-green-text mt-0.5 block">
                            {Math.max(0, Number(latestInspection.sampledQuantity) - Number(latestInspection.defectiveQuantity))} {uomSymbol}
                          </span>
                          <span className="text-[10px] text-tone-green-text font-medium">Passed specification</span>
                        </div>

                        <div className="p-3 rounded-xl bg-background border border-tone-red-solid/25 bg-tone-red-bg">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-tone-red-text block">
                            Defective / Non-Conforming
                          </span>
                          <span className="font-mono text-base font-bold text-tone-red-text mt-0.5 block">
                            {latestInspection.defectiveQuantity} {uomSymbol}
                          </span>
                          <span className="text-[10px] text-tone-red-text font-semibold">Held in Quarantine</span>
                        </div>
                      </div>

                      {/* Interactive Resolution Action Bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-tone-red-solid/25">
                        <div className="text-xs text-muted-foreground">
                          <strong className="text-foreground">Required Action:</strong> Route defective units to Scrap &amp; Loss ledger, or re-inspect after rework to unlock handover.
                        </div>

                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          {/* 1. Write off defective to scrap */}
                          <Button
                            size="sm"
                            onClick={() => {
                              setQcScrapNotes(latestInspection.reason ? `QC defect: ${latestInspection.reason}` : 'Defective tolerances flagged in in-process QC');
                              setShowQcScrapModal(true);
                            }}
                            className="h-9 px-3.5 text-xs font-bold rounded-xl bg-tone-red-solid hover:bg-[color:var(--tone-red-text)] text-inverse shadow-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Write Off {latestInspection.defectiveQuantity} to Scrap</span>
                          </Button>

                          {/* 2. Re-Inspect */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowQcInspectionModal(true)}
                            className="h-9 px-3.5 text-xs font-semibold rounded-xl border border-border bg-background hover:bg-muted/80 text-foreground flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          >
                            <RefreshCw className="h-3.5 w-3.5 text-primary" />
                            <span>Re-Inspect Sample</span>
                          </Button>

                          {/* 3. QC Override */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowOverrideModal(true)}
                            className="h-9 px-3 text-xs font-semibold rounded-xl border border-border bg-background hover:bg-muted/80 text-muted-foreground hover:text-foreground flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                            <span>Apply QC Override</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-tone-green-solid/25 bg-tone-green-bg space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-tone-green-bg text-tone-green-text shrink-0 mt-0.5">
                            <CheckCircle2 className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-foreground">
                              In-Process Inspection Passed · Quality Gate Cleared
                            </h4>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Inspection #{latestInspection.inspectionNumber} · Sampled:{' '}
                              <strong className="font-mono text-foreground">{latestInspection.sampledQuantity} {uomSymbol}</strong> · Defective:{' '}
                              <strong className="font-mono text-foreground">{latestInspection.defectiveQuantity} {uomSymbol}</strong> · Conforming WIP is released for downstream transfer.
                            </p>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowQcInspectionModal(true)}
                          className="h-9 px-3.5 text-xs font-semibold rounded-xl border border-border hover:bg-muted/80 text-foreground shrink-0 cursor-pointer"
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                          Re-Inspect Sample
                        </Button>
                      </div>
                    </div>
                  )
                )}

                {/* 4. Recorded Quality Inspections (History & Audit Log) */}
                <div className="rounded-2xl border border-border overflow-hidden bg-card shadow-2xs">
                  <div className="px-4 py-3 bg-muted/30 border-border-strong border-border flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      <span>Recorded Quality Inspections &amp; Audit Log ({inspectionHistory.length})</span>
                    </span>
                    <span className="text-muted-foreground text-[11px] font-medium">
                      In-Process Gate Sign-offs
                    </span>
                  </div>

                  {inspectionHistory.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      No inspections recorded for this workstation batch yet. Click <strong className="text-foreground">Perform QC Inspection</strong> above to record sampled quality measurements.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-border-strong border-border bg-muted/20 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            <th className="px-4 py-2">Inspection #</th>
                            <th className="px-3 py-2">Inspector</th>
                            <th className="px-3 py-2">Timestamp</th>
                            <th className="px-3 py-2 text-right">Sampled</th>
                            <th className="px-3 py-2 text-right">Defective</th>
                            <th className="px-3 py-2 text-center">Result Disposition</th>
                            <th className="px-3 py-2">Notes &amp; Observations</th>
                            <th className="px-3 py-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {inspectionHistory.map((insp: any) => {
                            const isPass = insp.status === 'PASS';
                            const isRework = insp.status === 'REWORK';
                            const isFail = insp.status === 'FAIL' || insp.status === 'REJECT' || insp.status === 'REJECT_SCRAP';

                            const statusColor = isPass
                              ? 'bg-tone-green-bg text-tone-green-text border-tone-green-solid/25'
                              : isRework
                                ? 'bg-primary/10 text-primary border-primary/20'
                                : isFail
                                  ? 'bg-destructive/10 text-destructive border-destructive/20'
                                  : 'bg-muted text-muted-foreground border-border';

                            return (
                              <tr key={insp.id} className="hover:bg-muted/10 transition-colors">
                                <td className="px-4 py-2.5 font-mono font-bold text-foreground text-xs">
                                  {insp.inspectionNumber || insp.id.slice(-8)}
                                </td>
                                <td className="px-3 py-2.5 font-semibold text-foreground">
                                  {insp.inspectorEmployeeName || insp.inspector?.name || 'Inspector'}
                                </td>
                                <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                                  {insp.createdAt ? new Date(insp.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">
                                  {Number(insp.sampledQuantity)} <span className="text-[10px] font-normal text-muted-foreground">{uomSymbol}</span>
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">
                                  {Number(insp.defectiveQuantity)} <span className="text-[10px] font-normal text-muted-foreground">{uomSymbol}</span>
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold border ${statusColor}`}>
                                    {insp.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-muted-foreground max-w-xs truncate" title={insp.reason || ''}>
                                  {insp.reason || <span className="italic text-muted-foreground/60">No defects noted</span>}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setShowQcInspectionModal(true)}
                                    className="h-7 text-[11px] px-2 font-semibold cursor-pointer"
                                  >
                                    Re-Inspect
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <BlockedCheckpointBanner
                  checkpointName={batch.department?.name || 'This stage'}
                  missingReason="Inspection criteria not yet defined for this department workstation (V-009 Gate). Standard operating procedure requires approved criteria before inspection can proceed."
                  onConfigureClick={() => setShowQcRuleModal(true)}
                />
                <div className="p-4 rounded-2xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-foreground block">Quick Gate Resolution</span>
                    <span className="text-muted-foreground text-[11px] block">
                      Auto-generate and approve standard in-process QC criteria checklist for {batch.department?.name || 'this department'} to immediately satisfy invariant V-009.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAutoApproveDefaultInProcessQcRule}
                    disabled={isAutoApprovingQc}
                    className="h-9.5 px-4 font-bold rounded-xl shadow-xs bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 cursor-pointer flex items-center gap-2 active:scale-[0.99]"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isAutoApprovingQc ? 'Approving...' : '1-Click Approve QC Criteria'}</span>
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── TAB 2: HANDOVERS HISTORY ────────────────────────────────────────── */}
      {activeTab === 'handovers' && (
        <div className="space-y-6">
          {/* Outgoing Handovers */}
          <Card className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" />
                <span>Outgoing Transfers to Next Department</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Output components produced by this workstation and transferred to downstream departments or assembly.
              </p>
            </div>

            {batch.outgoingHandovers && batch.outgoingHandovers.length > 0 ? (
              <div className="rounded-xl border border-border/80 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-muted/40 border-border-strong border-border/60 text-muted-foreground font-semibold">
                      <th className="py-2.5 px-3">Destination Department</th>
                      <th className="py-2.5 px-3">Component / Item Sent</th>
                      <th className="py-2.5 px-3 text-right">Quantity</th>
                      <th className="py-2.5 px-3">Dispatched Date</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {batch.outgoingHandovers.map((h: any) => (
                      <tr key={h.id} className="hover:bg-muted/10 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-foreground">
                          {h.incomingDepartment?.name || 'Department'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-foreground block">{h.itemName || outputItemName}</span>
                          {(h.itemCode || outputItemCode) && (
                            <span className="font-mono text-[10px] text-muted-foreground block">{h.itemCode || outputItemCode}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">
                          {Number(h.quantity || 0).toLocaleString()} {h.unitName || uomSymbol}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground font-mono">
                          {new Date(h.proposedAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusBadge status={h.status as any} />
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">{h.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic py-2">
                No outgoing handovers dispatched yet.
              </p>
            )}
          </Card>

          {/* Incoming Handovers */}
          <Card className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-primary" />
                <span>Incoming Transfers from Upstream Department</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upstream WIP components transferred into this workstation to be processed.
              </p>
            </div>

            {batch.incomingHandovers && batch.incomingHandovers.length > 0 ? (
              <div className="rounded-xl border border-border/80 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-muted/40 border-border-strong border-border/60 text-muted-foreground font-semibold">
                      <th className="py-2.5 px-3">Origin Department</th>
                      <th className="py-2.5 px-3">Component / Item Received</th>
                      <th className="py-2.5 px-3 text-right">Quantity</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {batch.incomingHandovers.map((h: any) => (
                      <tr key={h.id} className="hover:bg-muted/10 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-foreground">
                          {h.outgoingDepartment?.name || 'Upstream Department'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-foreground block">{h.itemName || 'WIP Component'}</span>
                          {h.itemCode && (
                            <span className="font-mono text-[10px] text-muted-foreground block">{h.itemCode}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">
                          {Number(h.quantity || 0).toLocaleString()} {h.unitName || uomSymbol}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground font-mono">
                          {new Date(h.proposedAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusBadge status={h.status as any} />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {h.status === 'PROPOSED' && (
                            canExecuteBatch ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  onClick={() => handleAcceptIncomingHandover(h.id)}
                                  disabled={decideHandoverMutation.isPending}
                                  className="h-7 text-xs bg-tone-green-solid hover:bg-tone-green-solid text-inverse font-semibold cursor-pointer shadow-none"
                                >
                                  Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setRefusingHandoverId(h.id);
                                    setShowRefuseModal(true);
                                  }}
                                  disabled={decideHandoverMutation.isPending}
                                  className="h-7 text-xs text-destructive border-destructive/40 font-semibold cursor-pointer shadow-none"
                                >
                                  Refuse
                                </Button>
                              </div>
                            ) : (
                              <span className="text-[11px] font-medium text-muted-foreground italic">
                                Station decision required
                              </span>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic py-2">
                No incoming handovers awaiting this workstation.
              </p>
            )}
          </Card>
        </div>
      )}

      {/* ── TAB 3: AUDIT TIMELINE ───────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <Card className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <HistoryIcon className="h-4 w-4 text-primary" />
            Batch Activity History
          </h3>

          {historyData?.timeline && historyData.timeline.length > 0 ? (
            <div className="space-y-3">
              {historyData.timeline.map((event: any, idx: number) => (
                <div key={idx} className="flex items-start gap-3 text-xs border-border-strong border-border/50 pb-2.5 last:border-accent">
                  <span className="p-1 rounded-full bg-primary/10 text-primary mt-0.5">
                    <Clock className="h-3 w-3" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">
                      {event.type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {event.details?.notes || event.details?.subtaskDescription || event.details?.reason || 'Event recorded.'}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {new Date(event.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-2">
              No audit timeline events logged yet.
            </p>
          )}
        </Card>
      )}

      {/* ── MODAL 1: Assign Department Worker ───────────────────────────────── */}
      <AssignWorkerModal
        open={showAssignWorkerModal}
        onClose={() => setShowAssignWorkerModal(false)}
        batchId={batchId}
        batchNumber={batch.batchNumber}
        departmentId={batch.departmentId}
        departmentName={batch.department?.name}
        departmentHead={(batch.department as any)?.departmentHead}
        departmentEmployees={departmentEmployees}
        assignedEmployeeIds={(batch.workerAssignments || []).map((w: any) => w.employeeId)}
        onAssigned={() => {
          refetch();
          refetchEmployees();
        }}
      />

      {/* ── MODAL 2: Record WIP Progress ────────────────────────────────────── */}
      <Dialog
        open={showProgressModal}
        onClose={() => setShowProgressModal(false)}
        title="Record Production Progress"
        description={`Log additional completed output for ${batch.batchNumber}.`}
        className="max-w-md"
      >
        <form onSubmit={handleRecordProgress} className="space-y-4 pt-2">
          {/* Progress Overview Grid */}
          <div className="grid grid-cols-4 gap-2 p-3 rounded-lg border border-border/80 bg-muted/20 text-center">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase">Schedule Target</p>
              <p className="text-xs font-bold font-mono text-foreground mt-0.5">{expQty} {uomSymbol}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase">In Custody</p>
              <p className="text-xs font-bold font-mono text-foreground mt-0.5">{recQty} {uomSymbol}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase">Completed</p>
              <p className="text-xs font-bold font-mono text-tone-green-text mt-0.5">{compQty} {uomSymbol}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase">Ready to Work</p>
              <p className={`text-xs font-bold font-mono mt-0.5 ${custodyAvailable > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                {custodyAvailable} {uomSymbol}
              </p>
            </div>
          </div>

          {custodyAvailable <= 0 && awaitingUpstream > 0 ? (
            <div className="p-3.5 rounded-xl border border-border bg-muted/40 text-foreground text-xs space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-1.5 font-bold text-foreground">
                <Clock className="w-4 h-4 text-primary shrink-0" />
                <span>All Received Materials Completed ({compQty} / {recQty} {uomSymbol})</span>
              </div>
              <p className="leading-relaxed text-muted-foreground">
                This workstation has already completed all physical materials delivered so far. The remaining <strong className="font-mono text-foreground">{awaitingUpstream} {uomSymbol}</strong> must be produced and transferred by <strong className="font-semibold text-foreground">{upstreamDeptName}</strong>.
              </p>
              <p className="text-[11px] text-muted-foreground">
                Please wait for {upstreamDeptName} to send more components before logging further progress.
              </p>
            </div>
          ) : custodyAvailable <= 0 ? (
            <div className="p-3 rounded-lg border border-tone-green-solid/25 bg-tone-green-solid text-tone-green-text text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-tone-green-text">
                <CheckCircle2 className="w-4 h-4 text-tone-green-text shrink-0" />
                <span>Batch Target Fully Completed ({compQty} / {expQty} {uomSymbol})</span>
              </div>
              <p className="leading-relaxed">
                All scheduled units have been completed. You can dispatch them to the next stage in the Handovers tab.
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Additional Completed Good Output ({uomSymbol}) <span className="text-destructive">*</span></span>
              <span className="text-[10px] text-muted-foreground font-normal">
                Max ready now: <strong className="font-mono text-foreground">{custodyAvailable} {uomSymbol}</strong>
                {awaitingUpstream > 0 && <span className="text-muted-foreground ml-1 font-sans">({awaitingUpstream} awaiting {upstreamDeptName})</span>}
              </span>
            </label>
            <Input
              type="number"
              min="0.000001"
              max={custodyAvailable > 0 ? custodyAvailable : 0}
              step="any"
              value={progressUnits}
              onChange={(e) => setProgressUnits(e.target.value)}
              placeholder={custodyAvailable > 0 ? `e.g. ${Math.min(10, custodyAvailable)}` : '0 (awaiting materials)'}
              disabled={custodyAvailable <= 0}
              required
              className="text-xs font-mono"
            />
            {progressUnits && Number(progressUnits) > 0 && (
              <p className="text-[11px] text-tone-green-text font-medium">
                Cumulative progress: {compQty} + {progressUnits} = <strong className="font-mono">{Number((compQty + Number(progressUnits)).toFixed(4))}</strong> / {expQty} {uomSymbol}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                <span>Scrap Units</span>
                <span className="text-[10px] text-muted-foreground font-normal">Defective</span>
              </label>
              <Input
                type="number"
                min="0"
                step="any"
                value={progressScrap}
                onChange={(e) => setProgressScrap(e.target.value)}
                placeholder="0"
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                <span>Wastage Units</span>
                <span className="text-[10px] text-muted-foreground font-normal">Process loss</span>
              </label>
              <Input
                type="number"
                min="0"
                step="any"
                value={progressWastage}
                onChange={(e) => setProgressWastage(e.target.value)}
                placeholder="0"
                className="text-xs font-mono"
              />
            </div>
          </div>

          {(Number(progressScrap || 0) > 0 || Number(progressWastage || 0) > 0) && (
            <div className="p-3 rounded-xl border border-border bg-muted/40 text-[11px] text-foreground space-y-1">
              <span className="font-bold text-primary">Scrap Accounting: </span>
              <span className="text-muted-foreground">
                Logging {Number(progressScrap || 0) + Number(progressWastage || 0)} {uomSymbol} as loss will deduct from physical custody and be logged in Scrap &amp; Wastage ledger. Once all input material is accounted for, this stage will complete.
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Operator</label>
            <SearchableSelector
              size="sm"
              options={workerOptions}
              value={progressWorkerId || batch?.workerAssignments?.[0]?.employeeId || ''}
              onChange={(val) => setProgressWorkerId(val)}
              placeholder="Select operator..."
              className="w-full text-xs font-normal"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Notes (Optional)</label>
            <Input
              value={progressNotes}
              onChange={(e) => setProgressNotes(e.target.value)}
              placeholder="Progress remarks or observations"
              className="text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowProgressModal(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={recordProgressMutation.isPending || !progressUnits || Number(progressUnits) <= 0 || custodyAvailable <= 0}
              className="text-xs font-semibold"
            >
              {recordProgressMutation.isPending ? 'Logging...' : custodyAvailable <= 0 ? 'No Materials in Custody' : `Record Progress (+${progressUnits || 0} ${uomSymbol})`}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ── MODAL 3: Handover to Next Department ────────────────────────────── */}
      <Dialog
        open={showHandoverModal}
        onClose={() => setShowHandoverModal(false)}
        title={`Hand Over to ${nextDepartmentName}`}
        description={`Transfer completed ${outputItemName} from ${batch.department?.name || 'this department'} directly to ${nextDepartmentName}.`}
        className="max-w-md"
      >
        <form onSubmit={handleProposeHandover} className="space-y-4 pt-2">
          {/* Component Item Being Handed Over */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary block">
              Produced Component Being Handed Over
            </span>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold text-xs text-foreground">{outputItemName}</span>
              <span className="font-mono text-xs font-bold text-primary">{uomSymbol}</span>
            </div>
            {outputItemCode && (
              <span className="text-[10px] font-mono text-muted-foreground block">Code / SKU: {outputItemCode}</span>
            )}
          </div>

          {/* Destination Department (From Floor Route) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground block">
              Destination Department (Pre-Configured by Floor Route)
            </label>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-muted/20">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">{nextDepartmentName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Floor Route Sequence Step {nextDepartmentCode ? `· ${nextDepartmentCode}` : ''}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-tone-green-bg text-tone-green-text shrink-0">
                Auto-Routed
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Handover Quantity ({uomSymbol}) <span className="text-destructive">*</span></span>
              <span className="text-[10px] text-muted-foreground font-normal">
                Available: {availableToHandover} {uomSymbol}
              </span>
            </label>
            <Input
              type="number"
              min="0.000001"
              max={availableToHandover}
              step="any"
              value={handoverQty}
              onChange={(e) => setHandoverQty(e.target.value)}
              placeholder={`Available: ${availableToHandover}`}
              required
              className="text-xs font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Handover Notes (Optional)</label>
            <Input
              value={handoverNotes}
              onChange={(e) => setHandoverNotes(e.target.value)}
              placeholder="Instructions or remarks for the incoming department"
              className="text-xs"
            />
          </div>

          <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5 text-[11px] text-muted-foreground">
            Yield Item: <strong className="text-foreground">{outputItemName}</strong>. {nextDepartmentName} will be notified immediately to accept custody.
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowHandoverModal(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={proposeHandoverMutation.isPending || !handoverQty || Number(handoverQty) <= 0 || Number(handoverQty) > availableToHandover}
              className="text-xs font-semibold bg-tone-green-solid hover:bg-tone-green-solid text-inverse"
            >
              {proposeHandoverMutation.isPending ? 'Dispatching...' : `Dispatch Handover (${handoverQty || 0} ${uomSymbol})`}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ── MODAL 4: Pause Work ──────────────────────────────────────────────── */}
      <Dialog
        open={showPauseModal}
        onClose={() => setShowPauseModal(false)}
        title="Pause Workstation Operation"
        description="Provide a reason for temporarily pausing work on this batch."
        className="max-w-md"
      >
        <form onSubmit={handlePauseWork} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Pause Reason <span className="text-destructive">*</span>
            </label>
            <Input
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              placeholder="e.g. Machine maintenance, shift handover, tooling check"
              required
              className="text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPauseModal(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pauseBatchMutation.isPending || !pauseReason.trim()}
              className="text-xs font-semibold"
            >
              {pauseBatchMutation.isPending ? 'Pausing...' : 'Confirm Pause'}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={showReceiveMaterialsModal}
        onClose={() => setShowReceiveMaterialsModal(false)}
        title="Accept Allocated Materials"
        description="Enter the quantity physically received for each material. The amount adds to what this department has already received."
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmitMaterialReceipt} className="space-y-4">
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {(batch?.materialAssignments || []).filter((assignment: any) =>
              Number(assignment.issuedQty || 0) > Number(assignment.receivedQty || 0)
            ).map((assignment: any) => {
              const itemTitle = assignment.bomLine?.material?.name || assignment.bomLine?.componentProduct?.name || assignment.itemId;
              const unit = assignment.bomLine?.uom?.symbol || 'units';
              const remaining = Math.max(0, Number(assignment.issuedQty || 0) - Number(assignment.receivedQty || 0));
              return (
                <div key={assignment.id} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{itemTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      Already received {Number(assignment.receivedQty || 0)} {unit} · {remaining} {unit} remaining of {Number(assignment.issuedQty || 0)} {unit} issued
                    </p>
                  </div>
                  <label className="space-y-1 text-xs font-medium">
                    <span>Accept now ({unit})</span>
                    <Input
                      type="number"
                      min="0"
                      max={remaining}
                      step="any"
                      value={receiptQuantities[assignment.id] ?? ''}
                      onChange={(event) => setReceiptQuantities((previous) => ({ ...previous, [assignment.id]: event.target.value }))}
                      aria-label={`Quantity of ${itemTitle} to accept now`}
                    />
                  </label>
                </div>
              );
            })}
            {!(batch?.materialAssignments || []).some((assignment: any) => Number(assignment.issuedQty || 0) > Number(assignment.receivedQty || 0)) && (
              <p className="py-4 text-sm text-muted-foreground">All issued materials have been received.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-border/60 pt-3">
            <Button type="button" variant="outline" onClick={() => setShowReceiveMaterialsModal(false)}>Cancel</Button>
            <Button type="submit" disabled={receiveAssignmentMutation.isPending} className="bg-tone-green-solid text-inverse hover:bg-tone-green-solid">
              {receiveAssignmentMutation.isPending ? 'Recording...' : 'Confirm Receipt'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ── MODAL 5: Refuse Handover ─────────────────────────────────────────── */}
      <Dialog
        open={showRefuseModal}
        onClose={() => {
          setShowRefuseModal(false);
          setRefusingHandoverId(null);
        }}
        title="Refuse Incoming Handover"
        description="Provide a reason for refusing this transfer back to the upstream department."
        className="max-w-md"
      >
        <form onSubmit={handleRefuseIncomingHandover} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Refusal Reason <span className="text-destructive">*</span>
            </label>
            <Input
              value={refusalReason}
              onChange={(e) => setRefusalReason(e.target.value)}
              placeholder="e.g. Quantity discrepancy, visual defects, incorrect item"
              required
              className="text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowRefuseModal(false);
                setRefusingHandoverId(null);
              }}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={decideHandoverMutation.isPending || !refusalReason.trim()}
              className="text-xs font-semibold bg-destructive hover:bg-destructive/90 text-inverse"
            >
              Confirm Refusal
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ── MODAL 6: Report Loss & Scrap (Module 11) ────────────────────────── */}
      <ReportLossModal
        open={showReportLossModal}
        onClose={() => {
          setShowReportLossModal(false);
          setLossModalDefaults({});
        }}
        defaultScenario={lossModalDefaults.scenario || "PRODUCTION_WIP_DEFECT"}
        contextType="PRODUCTION_SCHEDULE"
        batchId={batchId}
        batchNumber={batch.batchNumber}
        departmentId={batch.departmentId}
        departmentName={batch.department?.name}
        productId={batch.productionPlan?.productId}
        productName={outputItemName}
        productSku={outputItemCode}
        uomId={batch.productionPlan?.product?.uom?.id}
        uomSymbol={uomSymbol}
        initialQuantity={lossModalDefaults.qty}
        initialReason={lossModalDefaults.notes}
        onSuccess={() => {
          refetch();
          fetchQcCheckpoints();
          fetchInspectionHistory();
          refetchLossEvents();
          setLossModalDefaults({});
        }}
      />

      {/* ── MODAL 7: In-Process Quality Inspection ────────────────────────────── */}
      <InspectionModal
        isOpen={showQcInspectionModal}
        onClose={() => setShowQcInspectionModal(false)}
        targetItem={qcTargetItem as any}
        onSuccess={() => {
          setShowQcInspectionModal(false);
          refetch();
          fetchQcCheckpoints();
          fetchInspectionHistory();
          refetchLossEvents();
        }}
      />

      {/* ── MODAL 7b: Supervisor QC Override (Invariant V-009 Waiver) ──────── */}
      <OverrideModal
        isOpen={showOverrideModal}
        onClose={() => setShowOverrideModal(false)}
        targetItem={qcTargetItem as any}
        onSuccess={() => {
          setShowOverrideModal(false);
          refetch();
          fetchQcCheckpoints();
          fetchInspectionHistory();
          refetchLossEvents();
        }}
      />

      {/* ── MODAL 7c: QC Defect Write-Off to Scrap Confirmation ──────── */}
      <Dialog
        open={showQcScrapModal}
        onClose={() => setShowQcScrapModal(false)}
        title="Write Off Defective Items to Scrap"
        description="Quarantine non-conforming workpieces, write them off to the Scrap & Wastage register, and clear the conforming lot."
        className="max-w-md"
      >
        <form onSubmit={handleExecuteQcScrapWriteOff} className="space-y-4 pt-2">
          <div className="p-3.5 bg-tone-red-bg border border-tone-red-solid/25 rounded-xl space-y-2 text-xs">
            <div className="flex justify-between font-semibold">
              <span className="text-muted-foreground">Workstation Batch:</span>
              <span className="font-mono text-foreground font-bold">{batch?.batchNumber}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-muted-foreground">Produced Item:</span>
              <span className="text-foreground">{outputItemName}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-muted-foreground">Defective Quantity:</span>
              <span className="font-mono font-bold text-tone-red-text">
                {latestInspection?.defectiveQuantity || 0} {uomSymbol}
              </span>
            </div>
            <div className="flex justify-between font-semibold border-t border-tone-red-solid/25 pt-2 text-tone-green-text">
              <span>Conforming Lot to Release:</span>
              <span className="font-mono font-bold">
                {Math.max(0, Number(batch?.completed_qty || 0) - Number(latestInspection?.defectiveQuantity || 0))} {uomSymbol}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Defect Reason / Root Cause Notes
            </label>
            <Input
              value={qcScrapNotes}
              onChange={(e) => setQcScrapNotes(e.target.value)}
              placeholder="e.g. Kerf tolerance deviation, cutting burr..."
              className="text-xs rounded-xl h-10"
              required
            />
          </div>

          <div className="p-3 bg-muted/40 rounded-xl text-[11px] text-muted-foreground space-y-1">
            <strong className="text-foreground block">System Effect on Confirmation:</strong>
            <p>1. Writes off {latestInspection?.defectiveQuantity || 0} {uomSymbol} to the Scrap &amp; Loss ledger.</p>
            <p>2. Adjusts batch WIP accounting ({Math.max(0, Number(batch?.completed_qty || 0) - Number(latestInspection?.defectiveQuantity || 0))} good units remaining).</p>
            <p>3. Clears Quality Gate for conforming units and unlocks downstream handover.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowQcScrapModal(false)}
              disabled={isWritingOffScrap}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isWritingOffScrap}
              className="bg-tone-red-solid hover:bg-[color:var(--tone-red-text)] text-inverse font-bold shadow-none"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              <span>{isWritingOffScrap ? 'Writing Off...' : 'Confirm & Write Off to Scrap'}</span>
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ── MODAL 8: Configure QC Rule (V-009) ───────────────────────────────── */}
      <QcRuleModal
        isOpen={showQcRuleModal}
        onClose={() => setShowQcRuleModal(false)}
        initialTargetType="DEPARTMENT"
        initialTargetId={batch.departmentId}
        initialName={`${batch.department?.name || 'Department'} In-Process Gate`}
        initialCode={`QC-PROC-${batch.department?.code || 'DEPT'}`}
        autoApproveOnCreate={true}
        batchId={batchId}
        onSuccess={() => {
          setShowQcRuleModal(false);
          refetch();
          fetchQcCheckpoints();
          fetchInspectionHistory();
        }}
      />
    </div>
  );
}
