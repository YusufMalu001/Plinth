'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Trash2,
  Info,
  Layers,
  PackageCheck,
  Play,
  Plus,
  RefreshCw,
  Scale,
  Send,
  ShieldCheck,
  TrendingUp,
  Users,
  Warehouse,
  X
} from 'lucide-react';
import { Button, Card, Dialog, Input } from '@plinth/ui';
import {
  useProductionScheduleDetail,
  useReceiveAssignment,
  useDecideHandover,
  useCreateAssemblyWave
} from '@/features/production/execution-hooks';
import {
  useAssemblyBatch,
  useAllocateAssemblyComponents,
  useStartAssemblyBatch,
  useAssignAssemblyWorker,
  useUnassignAssemblyWorker,
  useRecordAssemblyProgress,
  useCompleteAssemblyBatch,
  useQcDispositionAssemblyBatch
} from '@/features/assembly/hooks';
import { useEmployees, useDepartments, Employee } from '@/hooks/useMasterData';
import { useWarehouseLocations } from '@/features/master-data/hooks';
import { useReceiveFgThroughGate } from '@/features/finished-goods/hooks';
import { useLossEvents } from '@/features/loss-management/hooks';
import { AssignWorkerModal } from '@/features/production/components/AssignWorkerModal';
import { ReportLossModal } from '@/features/loss-management/components/ReportLossModal';
import { QcRuleModal } from '@/features/quality/components/QcRuleModal';
import { qualityApi } from '@/features/quality/api';
import { StatusBadge } from '@/components/StatusBadge';
import { SearchableSelector, type SearchableOption } from '@/components/ui/SearchableSelector';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { VersionHistory } from '@/components/VersionHistory';
import { GateBlockedState } from '@/features/assembly/components/GateBlockedState';
import { useCurrentUser } from '@/features/auth/hooks';
import { normalizeRole } from '@/features/auth/access-control';
import { showToast } from '@/components/toast-store';
import { generateUUID } from '@/lib/uuid';
import type {
  ProgressEventType,
  AssemblyBatchDto,
  AssemblyBatchComponentDto,
  AssemblyWorkerAssignmentDto,
  AssemblyProgressEventDto,
  LossEventDto
} from '@plinth/types';

interface TabItem {
  id: 'intake' | 'execution' | 'completion' | 'qc' | 'inventory' | 'rework' | 'history';
  label: string;
  badge?: string;
}

interface StartAssemblyModalProps {
  open: boolean;
  onClose: () => void;
  planId: string;
  planNumber: string;
  productName: string;
  maxKits: number;
  remainingPlanned: number;
  intakeItems?: any[];
  onSuccess?: () => void;
}

function StartAssemblyModal({
  open,
  onClose,
  planId,
  planNumber,
  productName,
  maxKits,
  remainingPlanned,
  intakeItems = [],
  onSuccess
}: StartAssemblyModalProps) {
  const [quantity, setQuantity] = useState<string>(String(maxKits > 0 ? maxKits : 0));
  const createWaveMutation = useCreateAssemblyWave();

  useEffect(() => {
    if (open) {
      setQuantity(String(maxKits > 0 ? Math.min(maxKits, remainingPlanned || maxKits) : 0));
    }
  }, [open, maxKits, remainingPlanned]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      showToast({ kind: 'error', title: 'Invalid Quantity', message: 'Quantity must be greater than zero.' });
      return;
    }
    if (qty > maxKits) {
      showToast({
        kind: 'error',
        title: 'Insufficient Kits',
        message: `Only ${maxKits} complete kit(s) are ready from feeder departments.`
      });
      return;
    }
    try {
      await createWaveMutation.mutateAsync({
        planId,
        quantity: qty,
        idempotencyKey: `ASM_WAVE:${planId}:${Date.now()}`
      });
      onClose();
      onSuccess?.();
    } catch {
      // Handled by mutation hook
    }
  };

  // Identify which departments are missing parts for complete kits
  const blockingIntakes = useMemo(() => {
    return intakeItems.filter((i) => {
      const avail = Math.max(0, Number(i.acceptedQty || 0) - Number(i.allocatedQty || 0));
      const ratio = Number(i.requiredPerUnit || 1);
      return Math.floor(avail / (ratio > 0 ? ratio : 1)) === 0;
    });
  }, [intakeItems]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Launch Assembly Work Run"
      description={`Allocate complete kits for ${planNumber} (${productName}) and spin up a dedicated assembly workstation run.`}
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5 pt-1">
        <div className="grid gap-3 rounded-xl border border-border/80 bg-muted/20 p-4 text-xs sm:grid-cols-2">
          <div className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Schedule Plan</span>
            <span className="font-mono font-bold text-foreground">{planNumber}</span>
          </div>
          <div className="space-y-1 sm:text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product</span>
            <span className="font-semibold text-foreground">{productName}</span>
          </div>
          <div className="space-y-1 border-t border-border/70 pt-3">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Complete Kits Ready</span>
            <span className={`font-mono text-base font-bold ${maxKits > 0 ? 'text-tone-green-text' : 'text-destructive'}`}>
              {maxKits.toLocaleString()} kits
            </span>
          </div>
          <div className="space-y-1 border-t border-border/70 pt-3 sm:text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Remaining Scheduled</span>
            <span className="font-mono text-base font-bold text-foreground">{remainingPlanned.toLocaleString()} units</span>
          </div>
        </div>

        {maxKits === 0 ? (
          <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4 space-y-3">
            <div className="flex items-start gap-3 text-foreground">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Info className="h-4 w-4" />
              </div>
              <div className="space-y-1.5 flex-1">
                <p className="text-sm font-bold">Assembly run unavailable</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  No complete kits are ready yet. A kit becomes available when every feeder department has delivered its required components and the intake team has accepted them.
                </p>
                {blockingIntakes.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Outstanding feeder deliveries
                    </span>
                    {blockingIntakes.map((i) => {
                      const req = Number(i.requiredQty || 0);
                      const acc = Number(i.acceptedQty || 0);
                      const dept = i.sourceStep?.department?.name || 'Feeder Department';
                      const hasPending = (i.handovers || []).some((h: any) => h.status === 'PROPOSED');
                      return (
                        <div key={i.id} className="flex items-center justify-between gap-3 text-xs bg-card border border-border/70 px-3 py-2 rounded-lg">
                          <div>
                            <span className="font-semibold text-foreground">{dept}: </span>
                            <span className="text-muted-foreground">{i.itemName}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-foreground">
                              {acc} / {req} {i.unitName}
                            </span>
                            {hasPending && (
                              <span className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                Handover awaiting intake
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Number of Units to Assemble <span className="text-destructive">*</span>
            </label>
            <Input
              type="number"
              min="1"
              max={maxKits}
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-10 rounded-xl font-mono text-base font-bold"
              autoFocus
            />
            <p className="text-[11px] text-tone-green-text font-medium">
              All feeder components are ready! You can assemble up to {maxKits.toLocaleString()} finished unit(s) in this run.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={createWaveMutation.isPending}>
            Close
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={createWaveMutation.isPending || maxKits === 0 || Number(quantity) <= 0 || Number(quantity) > maxKits}
            className="gap-1.5 font-bold shadow-none"
          >
            <Play className="h-3.5 w-3.5" />
            <span>
              {createWaveMutation.isPending
                ? 'Creating Run...'
                : maxKits === 0
                  ? 'Awaiting Feeder Deliveries (0 Kits)'
                  : `Launch Assembly Run (${quantity} Units)`}
            </span>
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

interface RefuseHandoverModalProps {
  open: boolean;
  onClose: () => void;
  handoverId: string;
  quantity: number;
  unitName: string;
  itemName: string;
  onSuccess?: () => void;
}

function RefuseHandoverModal({
  open,
  onClose,
  handoverId,
  quantity,
  unitName,
  itemName,
  onSuccess
}: RefuseHandoverModalProps) {
  const [reason, setReason] = useState('');
  const decideMutation = useDecideHandover();

  const handleRefuse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      showToast({ kind: 'error', title: 'Reason Required', message: 'Please specify the reason for refusing this handover.' });
      return;
    }
    try {
      await decideMutation.mutateAsync({
        handoverId,
        status: 'REFUSED',
        refusalReason: reason.trim(),
        idempotencyKey: `REFUSED:${handoverId}:${Date.now()}`
      });
      setReason('');
      onClose();
      onSuccess?.();
    } catch {
      // Handled by mutation hook
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Refuse Handover Transfer"
      description={`Return ${quantity.toLocaleString()} ${unitName} of "${itemName}" back to the upstream department.`}
    >
      <form onSubmit={handleRefuse} className="space-y-4 pt-2">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Refusal Reason <span className="text-destructive">*</span>
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Dimensions out of tolerance, surface defects, count mismatch..."
            className="w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20"
            required
            autoFocus
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={decideMutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            disabled={decideMutation.isPending || !reason.trim()}
            className="gap-1.5 font-bold shadow-none"
          >
            <X className="h-3.5 w-3.5" />
            <span>{decideMutation.isPending ? 'Submitting...' : 'Confirm Refusal'}</span>
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function AssemblyStationDetailPage() {
  const params = useParams();
  const id = String(params.id);

  // 1. First attempt to load as Schedule Detail (planId)
  const {
    data: primaryScheduleDetail,
    isLoading: isLoadingPrimarySchedule,
    isError: isPrimaryScheduleError,
    refetch: refetchPrimarySchedule,
    isFetching: isFetchingPrimarySchedule
  } = useProductionScheduleDetail(id);

  // 2. Only query as direct AssemblyBatch if schedule detail lookup fails (in case id is directly an AssemblyBatch ID)
  const isDirectBatchCandidate = !!id && !primaryScheduleDetail && !isLoadingPrimarySchedule && isPrimaryScheduleError;
  const {
    data: directBatchData,
    refetch: refetchDirectBatch
  } = useAssemblyBatch(id, {
    enabled: isDirectBatchCandidate,
    meta: { silentError: true }
  });

  // 3. If directBatchData is loaded and has productionPlanId, load that plan's schedule
  const secondaryPlanId = directBatchData?.productionPlanId;
  const {
    data: secondaryScheduleDetail,
    refetch: refetchSecondarySchedule,
    isFetching: isFetchingSecondarySchedule
  } = useProductionScheduleDetail(secondaryPlanId || '');

  const scheduleDetail = primaryScheduleDetail || secondaryScheduleDetail;
  const isScheduleError = isPrimaryScheduleError && !directBatchData && !secondaryScheduleDetail;
  const isLoadingSchedule = isLoadingPrimarySchedule && !directBatchData;
  const isFetchingSchedule = isFetchingPrimarySchedule || isFetchingSecondarySchedule;

  const refetchSchedule = () => {
    refetchPrimarySchedule();
    if (secondaryPlanId) refetchSecondarySchedule();
  };

  // Active run / batch resolution
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');

  useEffect(() => {
    if (scheduleDetail?.assemblyBatches?.length) {
      if (!selectedBatchId || !scheduleDetail.assemblyBatches.some((b) => b.id === selectedBatchId)) {
        setSelectedBatchId(scheduleDetail.assemblyBatches[0].id);
      }
    }
  }, [scheduleDetail?.assemblyBatches, selectedBatchId]);

  const effectiveBatchId = useMemo(() => {
    if (directBatchData) return directBatchData.id;
    return selectedBatchId;
  }, [directBatchData, selectedBatchId]);

  // Load detailed batch for workstation execution
  const {
    data: activeBatchData,
    refetch: refetchActiveBatch
  } = useAssemblyBatch(effectiveBatchId);

  const batch = (directBatchData || activeBatchData) as AssemblyBatchDto | undefined;

  // Plan info resolution
  const planNumber = scheduleDetail?.planNumber || batch?.productionPlanNumber || 'PLAN';
  const productName = scheduleDetail?.product?.name || batch?.productName || 'Product';
  const productSku = scheduleDetail?.product?.sku || batch?.productSku || '';
  const scheduledQty = Number(scheduleDetail?.quantity || batch?.targetOutputQuantity || 0);
  const uomSymbol = scheduleDetail?.quantityUom?.symbol || scheduleDetail?.quantityUom?.name || 'units';

  // Active Tab State
  const [activeTab, setActiveTab] = useState<
    'intake' | 'execution' | 'completion' | 'qc' | 'inventory' | 'rework' | 'history'
  >('intake');

  // Modals state
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isAssignWorkerModalOpen, setIsAssignWorkerModalOpen] = useState(false);
  const [reportLossModalOpen, setReportLossModalOpen] = useState(false);
  const [showCreateQcRuleModal, setShowCreateQcRuleModal] = useState(false);
  const [qcGateBlockedError, setQcGateBlockedError] = useState<string | null>(null);
  const [refuseModalData, setRefuseModalData] = useState<{
    open: boolean;
    handoverId: string;
    quantity: number;
    unitName: string;
    itemName: string;
  }>({ open: false, handoverId: '', quantity: 0, unitName: '', itemName: '' });

  // Finished Goods Inventory State
  const { data: locationsData } = useWarehouseLocations({ limit: 100 });
  const locations = useMemo(() => locationsData?.items || [], [locationsData?.items]);
  const [receiveLocationId, setReceiveLocationId] = useState('');
  const [receiveNotes, setReceiveNotes] = useState('');
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const receiveThroughGateMutation = useReceiveFgThroughGate();

  const effectiveLocationId = useMemo(() => {
    if (receiveLocationId) return receiveLocationId;
    if (locations.length > 0) {
      const defaultLoc =
        locations.find(
          (l) =>
            l.code?.toUpperCase() === 'WH-FG' ||
            l.name?.toLowerCase().includes('finished goods') ||
            l.type === 'FINISHED_GOODS'
        ) || locations[0];
      return defaultLoc?.id || '';
    }
    return '';
  }, [receiveLocationId, locations]);

  useEffect(() => {
    if (locations.length > 0 && !receiveLocationId) {
      const defaultLoc =
        locations.find(
          (l) =>
            l.code?.toUpperCase() === 'WH-FG' ||
            l.name?.toLowerCase().includes('finished goods') ||
            l.type === 'FINISHED_GOODS'
        ) || locations[0];
      if (defaultLoc) setReceiveLocationId(defaultLoc.id);
    }
  }, [locations, receiveLocationId]);

  // Master data for department & workers
  const { data: deptsData } = useDepartments('ACTIVE');
  const assemblyDepartment = useMemo(() => {
    const routeAssyId = scheduleDetail?.route?.assemblyDepartmentId || scheduleDetail?.route?.assemblyDepartment?.id;
    if (routeAssyId) {
      const found = (deptsData?.items || []).find((d: any) => d.id === routeAssyId);
      if (found) return found;
    }
    if (scheduleDetail?.route?.assemblyDepartment) {
      return scheduleDetail.route.assemblyDepartment;
    }
    return (deptsData?.items || []).find((d: any) =>
      Boolean(d.isAssembly) ||
      d.name?.toLowerCase().includes('assembly') ||
      d.code?.toLowerCase().includes('assembly') ||
      d.code?.toLowerCase().includes('assm')
    );
  }, [scheduleDetail?.route, deptsData?.items]);

  const assemblyDepartmentId = useMemo(() => {
    return (
      scheduleDetail?.route?.assemblyDepartmentId ||
      scheduleDetail?.route?.assemblyDepartment?.id ||
      assemblyDepartment?.id
    );
  }, [scheduleDetail?.route, assemblyDepartment?.id]);

  const { data: employeesData, refetch: refetchEmployees } = useEmployees(assemblyDepartmentId, 'ACTIVE');
  const departmentEmployees = useMemo(() => {
    const list = (employeesData?.items || []) as Employee[];
    if (!assemblyDepartmentId) return [];
    return list.filter((e) => e.departmentId === assemblyDepartmentId);
  }, [employeesData?.items, assemblyDepartmentId]);

  const getEmployeeLabel = (empId: string, empName?: string | null) => {
    if (empName && !empName.includes('-')) return empName;
    const emp = departmentEmployees.find((e) => e.id === empId);
    if (emp) return `${emp.firstName} ${emp.lastName} (${emp.employeeCode})`;
    return empName || empId;
  };

  const assignedWorkerOptions = useMemo<SearchableOption[]>(() => {
    const assignments = batch?.workerAssignments || [];
    if (assignments.length > 0) {
      return assignments.map((w) => ({
        id: w.employeeId,
        name: getEmployeeLabel(w.employeeId, w.employeeName),
      }));
    }
    return [];
  }, [batch?.workerAssignments, departmentEmployees]);

  // Active QC Rule and Checklist State
  const [activeQcRule, setActiveQcRule] = useState<any | null>(null);
  const [criteriaChecked, setCriteriaChecked] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!batch?.productId) return;
    qualityApi.listRules({ targetType: 'PRODUCT', status: 'APPROVED' as any }).then((rules) => {
      const match = rules.find((r) => r.targetId === batch.productId || r.code?.includes('ASM'));
      if (match) {
        setActiveQcRule(match);
      }
    }).catch(() => {});
  }, [batch?.productId]);

  const qcCriteriaList = useMemo(() => {
    const params = activeQcRule?.parameters as any;
    const list = params?.criteria || params?.criteriaChecklist || [];
    if (Array.isArray(list) && list.length > 0) return list;
    return [
      { name: 'Visual Dimension Verification & Assembly Fitment', required: true, type: 'BOOLEAN', severity: 'CRITICAL', inspectionMethod: 'Vernier caliper & visual alignment' },
      { name: 'Surface Finish, Aesthetics & Scratch-Free Check', required: true, type: 'VISUAL', severity: 'MAJOR', inspectionMethod: 'Visual inspection under white LED' },
      { name: 'Fastener Torques & Structural Joint Integrity', required: true, type: 'NUMERIC', severity: 'CRITICAL', nominalValue: '12', minTolerance: '-1', maxTolerance: '+1', unit: 'Nm', inspectionMethod: 'Calibrated digital torque wrench' },
      { name: 'Operational Functional Test & Free Motion Check', required: true, type: 'BOOLEAN', severity: 'CRITICAL', inspectionMethod: 'Full mechanical cycle test' }
    ];
  }, [activeQcRule]);

  const verifiedChecksCount = useMemo(() => {
    return Object.values(criteriaChecked).filter(Boolean).length;
  }, [criteriaChecked]);

  const handlePassAllChecks = () => {
    const allChecks: Record<number, boolean> = {};
    qcCriteriaList.forEach((_, idx) => {
      allChecks[idx] = true;
    });
    setCriteriaChecked(allChecks);
    setQcDisposition('PASSED_TO_FG');
    setQcInspectionNotes(`All ${qcCriteriaList.length} assembly quality criteria inspected & verified (100% compliance with ${activeQcRule?.code || 'QC-ASM-GATE'}).`);
  };

  // Role permissions
  const { data: currentUser } = useCurrentUser();
  const rawRoles = useMemo(() => [
    currentUser?.role,
    currentUser?.roleDefinition?.key,
    currentUser?.roleDefinition?.name,
    ...(currentUser?.roles?.map((r) => r.key) ?? []),
    ...(currentUser?.roles?.map((r) => r.name) ?? [])
  ].filter(Boolean) as string[], [currentUser]);

  const canConfigureQcRule = useMemo(() => {
    const normalized = new Set(rawRoles.map((r) => normalizeRole(r)));
    return (
      normalized.has('admin') ||
      normalized.has('super_admin') ||
      normalized.has('system_admin') ||
      normalized.has('store_manager') ||
      normalized.has('department_incharge') ||
      normalized.has('department_head') ||
      normalized.has('production_manager') ||
      normalized.has('qa_inspector') ||
      normalized.has('quality_inspector')
    );
  }, [rawRoles]);

  const [isAutoCreatingQcRule, setIsAutoCreatingQcRule] = useState(false);

  const handleAutoApproveDefaultQcRule = async () => {
    if (!batch?.productId) return;
    setIsAutoCreatingQcRule(true);
    try {
      const code = `QC-ASM-${((productName || 'PROD').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)).toUpperCase()}`;
      const rule = await qualityApi.createRule({
        code,
        name: `${productName} Assembly QC Criteria`,
        description: 'Standard Assembly Quality Control and Inspection Criteria (V-009 compliant)',
        targetType: 'PRODUCT',
        targetId: batch.productId,
        parameters: {
          minPassingScore: 95,
          samplingPercentage: 100,
          criteriaChecklist: [
            { name: 'Visual Dimension Verification', required: true, type: 'BOOLEAN' },
            { name: 'Surface Finish & Defect Check', required: true, type: 'BOOLEAN' },
            { name: 'Assembly Integrity & Alignment', required: true, type: 'BOOLEAN' }
          ]
        },
        effectiveFrom: new Date().toISOString()
      });
      if (rule?.id) {
        await qualityApi.approveRule(rule.id);
      }
      setQcGateBlockedError(null);
      showToast({
        title: 'QC Criteria Activated',
        message: 'Approved QC rule created. You can now execute QC disposition.',
        kind: 'success'
      });
      refetchAll();
    } catch (err: any) {
      showToast({
        title: 'QC Setup Failed',
        message: err?.message || 'Failed to auto-configure QC rule',
        kind: 'error'
      });
    } finally {
      setIsAutoCreatingQcRule(false);
    }
  };

  // Loss events for active batch
  const { data: batchLossEventsData, refetch: refetchLossEvents } = useLossEvents({
    search: batch?.batchNumber,
    take: 50,
  });
  const batchLossEvents = useMemo(() => {
    const list: LossEventDto[] = Array.isArray(batchLossEventsData)
      ? batchLossEventsData
      : (batchLossEventsData?.items ?? []);
    if (!batch) return [];
    return list.filter(
      (e) =>
        e.reason?.includes(batch.id) ||
        (batch.batchNumber && e.reason?.includes(batch.batchNumber))
    );
  }, [batchLossEventsData, batch]);

  // Progress calculations
  const totalLoggedFG = useMemo(() => {
    return (batch?.progressEvents || []).reduce((sum, ev) => sum + Number(ev.quantityDelta || 0), 0);
  }, [batch?.progressEvents]);

  // Finished Goods Ready Output
  const fgReadyOutputs = useMemo(() => (batch as any)?.fgReadyOutputs || [], [batch]);
  const primaryFgOutput = fgReadyOutputs[0];
  const isReceivedInInventory = Boolean(primaryFgOutput?.fgReceipt);
  const fgReceipt = primaryFgOutput?.fgReceipt;

  // Mutations
  const receiveAssignmentMutation = useReceiveAssignment();
  const handoverMutation = useDecideHandover();
  const allocateMutation = useAllocateAssemblyComponents();
  const startMutation = useStartAssemblyBatch();
  const assignWorkerMutation = useAssignAssemblyWorker();
  const unassignWorkerMutation = useUnassignAssemblyWorker();
  const recordProgressMutation = useRecordAssemblyProgress();
  const completeMutation = useCompleteAssemblyBatch();
  const qcMutation = useQcDispositionAssemblyBatch();

  // Tab 2: Progress Form State
  const [progressEmployeeId, setProgressEmployeeId] = useState('');
  const [progressEventType, setProgressEventType] = useState<ProgressEventType>('PARTIAL_RECORDED');
  const [progressDelta, setProgressDelta] = useState('1');
  const [progressNotes, setProgressNotes] = useState('');

  // Tab 3: Completion State
  const [actualOutputQty, setActualOutputQty] = useState('');
  const [scrapQty, setScrapQty] = useState('0');
  const [consumptions, setConsumptions] = useState<Record<string, { consumedQuantity: number; scrapQuantity: number }>>({});

  // Tab 4: QC Form State
  const [qcDisposition, setQcDisposition] = useState<'PASSED_TO_FG' | 'REWORK' | 'REJECTED'>('PASSED_TO_FG');
  const [qcInspectionNotes, setQcInspectionNotes] = useState('');
  const [qcRejectionReason, setQcRejectionReason] = useState('');

  // Auto-sync progress and completion defaults
  useEffect(() => {
    if (batch) {
      const loggedProgress = (batch.progressEvents || []).reduce((sum, ev) => sum + Number(ev.quantityDelta || 0), 0);
      const totalLossScrap = batchLossEvents.reduce((sum, e) => sum + Number(e.quantity || 0), 0);

      const resolvedOutput = loggedProgress > 0
        ? loggedProgress
        : Number(batch.actualOutputQuantity) > 0
          ? Number(batch.actualOutputQuantity)
          : Number(batch.targetOutputQuantity || 0);

      setActualOutputQty(String(resolvedOutput));

      const resolvedScrap = totalLossScrap > 0
        ? totalLossScrap
        : Number(batch.scrapQuantity || 0);

      setScrapQty(String(resolvedScrap));

      if (batch.components) {
        const initial: Record<string, { consumedQuantity: number; scrapQuantity: number }> = {};
        const targetQuantity = resolvedOutput || Number(batch.targetOutputQuantity || 1);
        batch.components.forEach((c: AssemblyBatchComponentDto) => {
          const required = Number(c.requiredQuantity || (Number(c.unitRatio) * targetQuantity));
          initial[c.id] = {
            consumedQuantity: Number(c.consumedQuantity) > 0 ? Number(c.consumedQuantity) : required,
            scrapQuantity: Number(c.scrapQuantity || 0),
          };
        });
        setConsumptions(initial);
      }
    }
    if (batch?.workerAssignments && batch.workerAssignments.length > 0) {
      if (!progressEmployeeId || !batch.workerAssignments.some((w) => w.employeeId === progressEmployeeId)) {
        setProgressEmployeeId(batch.workerAssignments[0].employeeId);
      }
    }
  }, [batch, batchLossEvents, progressEmployeeId]);

  // Overall schedule stats
  const intakeItems = scheduleDetail?.assemblyIntakeRequirements || [];
  const directMaterials = (scheduleDetail?.taskMaterialAssignments || []).filter(
    (item) => item.destinationDepartmentId === (scheduleDetail?.route?.assemblyDepartmentId || scheduleDetail?.route?.assemblyDepartment?.id || assemblyDepartment?.id)
  );
  const assemblyBatches = scheduleDetail?.assemblyBatches || [];
  const totalPlanned = Number(scheduleDetail?.quantity || batch?.targetOutputQuantity || 0);
  const totalCompleted = Number(scheduleDetail?.completedQuantity || 0);
  const overallProgress = totalPlanned > 0 ? Math.min(100, Math.round((totalCompleted / totalPlanned) * 100)) : 0;
  const buildableKits = useMemo(() => {
    if (intakeItems.length > 0 && intakeItems.every((row) => Number(row.requiredPerUnit) > 0)) {
      const perItem = intakeItems.map((i) => {
        const avail = Math.max(0, Number(i.acceptedQty || 0) - Number(i.allocatedQty || 0));
        const ratio = Number(i.requiredPerUnit || 1);
        return Math.floor(avail / (ratio > 0 ? ratio : 1));
      });
      return Math.max(0, Math.min(...perItem));
    }
    return Number((scheduleDetail as any)?.buildableQuantity ?? 0);
  }, [intakeItems, scheduleDetail]);
  const remainingPlanned = Math.max(0, totalPlanned - totalCompleted);

  // Pending proposed handovers across all intake requirements
  const pendingHandovers = useMemo(() => {
    return intakeItems.flatMap((item) =>
      (item.handovers || [])
        .filter((h) => h.status === 'PROPOSED')
        .map((h) => ({ ...h, itemName: item.itemName, unitName: item.unitName }))
    );
  }, [intakeItems]);

  const [isAcceptingAll, setIsAcceptingAll] = useState(false);
  const handleAcceptAllPending = async () => {
    if (pendingHandovers.length === 0) return;
    setIsAcceptingAll(true);
    let accepted = 0;
    try {
      for (const h of pendingHandovers) {
        await handoverMutation.mutateAsync({
          handoverId: h.id,
          status: 'ACCEPTED',
          idempotencyKey: `ACCEPTED:${h.id}:${Date.now()}`
        });
        accepted++;
      }
      showToast({
        kind: 'success',
        title: 'All Deliveries Accepted',
        message: `${accepted} pending component handovers accepted into Assembly custody.`
      });
      refetchSchedule();
      if (batch) refetchActiveBatch();
    } catch (err: any) {
      showToast({ kind: 'error', title: 'Acceptance Error', message: err?.message || 'Failed to accept handovers.' });
    } finally {
      setIsAcceptingAll(false);
    }
  };

  const refetchAll = () => {
    refetchSchedule();
    refetchActiveBatch();
    if (directBatchData) refetchDirectBatch();
  };

  // Execution checks
  const targetQty = Number(batch?.targetOutputQuantity || 0);
  const isTargetFulfilled = targetQty > 0 && totalLoggedFG >= targetQty;
  const remainingToLog = Math.max(0, targetQty - totalLoggedFG);
  const isSetupLocked = batch && batch.status !== 'PLANNED' && batch.status !== 'ALLOCATED' && batch.status !== 'REWORK';
  const isAssignmentLocked = !batch || ['COMPLETE', 'CANCELLED', 'PASSED_TO_FG'].includes(batch.status);
  const isStarted = batch && batch.status !== 'PLANNED' && batch.status !== 'ALLOCATED';
  const isQcPending = batch?.status === 'QC_PENDING';
  const isQcPassed = batch?.status === 'PASSED_TO_FG';
  const isRework = batch?.status === 'REWORK';
  const isRejected = batch?.status === 'REJECTED';

  // Batch actions
  const handleAllocateComponents = async () => {
    if (!batch || isSetupLocked) return;
    const lines = (batch.bomVersion as any)?.lines || [];
    if (lines.length === 0) return;
    const targetQuantity = Number(batch.targetOutputQuantity || 1);
    const allocations = lines.map((line: any) => {
      const isSfg =
        Boolean(line.componentProductId) ||
        line.lineType === 'SUB_ASSEMBLY' ||
        line.material?.materialType === 'SEMI_FINISHED' ||
        line.material?.materialType === 'SFG' ||
        line.material?.materialType === 'WIP';

      return {
        bomLineId: line.id,
        componentType: (isSfg ? 'BATCH_SOURCED' : 'ISSUE_LINE_SOURCED') as 'BATCH_SOURCED' | 'ISSUE_LINE_SOURCED',
        uomId: line.uomId || line.uom?.id || line.material?.uomId || '',
        unitRatio: Number(line.quantity || line.ratio || 1),
        requiredQuantity: Number(line.quantity || line.ratio || 1) * targetQuantity,
      };
    });
    await allocateMutation.mutateAsync({
      id: batch.id,
      payload: { allocations },
    });
    refetchAll();
    setActiveTab('execution');
  };

  const handleStartExecution = async () => {
    if (!batch) return;
    try {
      await startMutation.mutateAsync({
        id: batch.id,
        actualStartDate: new Date().toISOString(),
      });
      refetchAll();
      setActiveTab('execution');
    } catch {
      // Handled by hook
    }
  };

  const handleRecordProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batch || !progressEmployeeId) return;
    const delta = Number(progressDelta || 0);
    if (delta <= 0) {
      showToast({ title: 'Invalid Delta Quantity', message: 'Delta units must be greater than zero.', kind: 'error' });
      return;
    }
    if (targetQty > 0 && totalLoggedFG + delta > targetQty) {
      showToast({
        title: 'Target Quantity Exceeded',
        message: `Only up to ${targetQty} units planned can be logged. Already logged: ${totalLoggedFG}, attempted: +${delta}.`,
        kind: 'error',
      });
      return;
    }
    await recordProgressMutation.mutateAsync({
      id: batch.id,
      payload: {
        employeeId: progressEmployeeId,
        eventType: progressEventType,
        quantityDelta: delta,
        notes: progressNotes || null,
      },
    });
    setProgressNotes('');
    setProgressDelta('1');
    refetchAll();
  };

  const handleCompleteBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batch) return;
    const outQty = Number(actualOutputQty || 0);
    const scQty = Number(scrapQty || 0);

    const pendingLoss = batchLossEvents.find((e) => ['REPORTED', 'REVIEWED', 'INVESTIGATED'].includes(e.status));
    if (pendingLoss) {
      showToast({
        title: 'Completion Gated by Scrap Proposal',
        message: `Scrap proposal [${pendingLoss.lossNumber}] is awaiting Store Manager approval.`,
        kind: 'error',
      });
      return;
    }

    if (outQty < targetQty && scQty > 0) {
      showToast({
        title: 'Production Quantity Shortfall',
        message: `Output quantity (${outQty}) is less than scheduled quantity (${targetQty}).`,
        kind: 'error',
      });
      return;
    }

    const componentConsumptions = (batch.components || []).map((c: AssemblyBatchComponentDto) => {
      const entry = consumptions[c.id] || { consumedQuantity: Number(c.consumedQuantity || 0), scrapQuantity: 0 };
      return {
        componentId: c.id,
        consumedQuantity: entry.consumedQuantity,
        scrapQuantity: entry.scrapQuantity,
      };
    });

    try {
      await completeMutation.mutateAsync({
        id: batch.id,
        payload: {
          actualOutputQuantity: outQty,
          scrapQuantity: scQty,
          idempotencyKey: generateUUID(),
          componentConsumptions,
          notes: null,
        },
      });
      refetchAll();
      setActiveTab('qc');
    } catch {
      // Handled by hook
    }
  };

  const handleQcSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batch) return;
    setQcGateBlockedError(null);
    try {
      await qcMutation.mutateAsync({
        id: batch.id,
        payload: {
          disposition: qcDisposition,
          inspectionNotes: qcInspectionNotes || null,
          rejectionReason: qcRejectionReason || null,
        },
      });
      refetchAll();
      if (qcDisposition === 'PASSED_TO_FG') {
        setActiveTab('inventory');
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err || '');
      if (errMsg.includes('MISSING_ASSEMBLY_QC_CRITERIA') || errMsg.includes('V-009')) {
        setQcGateBlockedError(errMsg);
        if (canConfigureQcRule) setShowCreateQcRuleModal(true);
      }
    }
  };

  const handleExecuteReceive = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!primaryFgOutput?.id) return;
    const locId = effectiveLocationId;
    if (!locId) {
      showToast({
        kind: 'error',
        title: 'Inventory Storage Unavailable',
        message: 'Default finished goods inventory storage location could not be resolved.'
      });
      return;
    }
    try {
      await receiveThroughGateMutation.mutateAsync({
        fgReadyOutputId: primaryFgOutput.id,
        locationId: locId,
        notes: receiveNotes.trim() || `Received from completed assembly batch ${batch?.batchNumber}`
      });
      showToast({
        kind: 'success',
        title: 'Finished Goods Received',
        message: 'Batch posted to authoritative inventory and Stock Ledger Entry created (GRN_RECEIPT · IN).'
      });
      setIsReceiveModalOpen(false);
      refetchAll();
    } catch (err: any) {
      showToast({ kind: 'error', title: 'Receipt Failed', message: err?.message || 'Failed to receive goods into inventory.' });
    }
  };

  if (isLoadingSchedule && !batch) {
    return <LoadingState message="Loading Assembly Station and schedule details..." />;
  }

  if (isScheduleError && !batch) {
    return (
      <ErrorState
        title="Schedule Not Found"
        description="Could not locate production schedule or assembly batch."
        retry={() => refetchAll()}
      />
    );
  }

  const tabs: TabItem[] = [
    { id: 'intake', label: `1. Component Intake & Handovers (${intakeItems.length})` },
    { id: 'execution', label: `2. Workstation Execution (${batch?.workerAssignments?.length || 0})` },
    { id: 'completion', label: '3. Completion & Reconciliation' },
    { id: 'qc', label: '4. Assembly QC Gate', badge: isQcPending ? 'Pending' : isQcPassed ? 'Passed' : undefined },
    ...(isQcPassed ? [{
      id: 'inventory' as const,
      label: '5. Finished Goods Inventory',
      badge: isReceivedInInventory ? 'Received' : 'Ready to Post'
    }] : []),
    ...(isRework || isRejected ? [{ id: 'rework' as const, label: 'Rework & Loss Hub' }] : []),
    { id: 'history', label: 'Timeline & History' },
  ];

  return (
    <div className="flex-1 w-full min-h-screen overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="mx-auto max-w-[1600px] space-y-6 pb-16">
        {/* Breadcrumb & Navigation */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <Link href="/production/assembly" className="hover:underline flex items-center gap-1 font-semibold text-primary">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Assembly Queue</span>
          </Link>
          <span>/</span>
          <span className="font-bold text-foreground">{planNumber}</span>
          {batch && (
            <>
              <span>/</span>
              <span className="font-mono text-muted-foreground">{batch.batchNumber}</span>
            </>
          )}
        </div>

        {/* Top Header Card */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-border-strong border-border/80 pb-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">
                {planNumber}
              </h1>
              <StatusBadge status={batch?.status || (scheduleDetail?.status as any) || 'IN_PROGRESS'} />
              {buildableKits > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-tone-green-bg border border-tone-green-solid/25 text-xs font-bold text-tone-green-text">
                  {buildableKits.toLocaleString()} kits ready to assemble
                </span>
              )}
              {isReceivedInInventory && (
                <span className="px-2.5 py-0.5 rounded-full bg-tone-green-bg border border-tone-green-solid/25 text-xs font-bold text-tone-green-text flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Received in Inventory ({fgReceipt?.receiptNumber || 'FGR'})</span>
                </span>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Target Product: <strong className="text-foreground">{productName}</strong> {productSku ? `(${productSku})` : ''} · Scheduled Output: <strong>{scheduledQty.toLocaleString()} {uomSymbol}</strong>
            </p>
          </div>

          {/* Action Header Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              onClick={refetchAll}
              disabled={isFetchingSchedule}
              className="gap-1.5 font-bold shadow-none"
            >
              Refresh
            </Button>

            {pendingHandovers.length > 0 && (
              <Button
                size="sm"
                onClick={handleAcceptAllPending}
                disabled={isAcceptingAll || handoverMutation.isPending}
                className="gap-1.5 font-bold bg-action hover:bg-[color:var(--action-primary-bg-hover)] text-inverse shadow-none text-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Accept All Transfers ({pendingHandovers.length})</span>
              </Button>
            )}

            <Button
              size="sm"
              onClick={() => setIsStartModalOpen(true)}
              className="gap-1.5 font-bold shadow-none text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Start Assembly Run</span>
            </Button>

            {isQcPassed && !isReceivedInInventory && (
              <Button
                size="sm"
                onClick={() => {
                  setActiveTab('inventory');
                  setIsReceiveModalOpen(true);
                }}
                className="gap-1.5 font-bold bg-tone-green-solid hover:bg-[color:var(--tone-green-text)] text-inverse shadow-none text-xs"
              >
                <PackageCheck className="h-3.5 w-3.5" />
                <span>Receive into FG Inventory</span>
              </Button>
            )}
          </div>
        </div>

        {/* 4 Header Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 rounded-2xl border border-border/80 bg-card shadow-none space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
              Target Output
            </span>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xl font-bold text-foreground">
                {scheduledQty.toLocaleString()} {uomSymbol}
              </span>
              <span className="text-xs text-muted-foreground">{productName}</span>
            </div>
          </Card>

          <Card className="p-4 rounded-2xl border border-border/80 bg-card shadow-none space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
              Component Intake
            </span>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xl font-bold text-foreground">
                {intakeItems.filter((i) => Number(i.acceptedQty) >= Number(i.requiredQty)).length} / {intakeItems.length} Parts
              </span>
              <span className="font-bold text-xs text-tone-green-text">
                {buildableKits} kits buildable
              </span>
            </div>
          </Card>

          <Card className="p-4 rounded-2xl border border-border/80 bg-card shadow-none space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
              Completed WIP
            </span>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xl font-bold text-foreground">
                {totalCompleted.toLocaleString()} {uomSymbol}
              </span>
              <span className="font-mono text-xs text-primary font-bold">
                {overallProgress}% complete
              </span>
            </div>
          </Card>

          <Card className="p-4 rounded-2xl border border-border/80 bg-card shadow-none space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
              Finished Goods Inventory
            </span>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xl font-bold text-tone-green-text">
                {isReceivedInInventory ? `${totalCompleted} NOS Received` : '0 NOS in FG'}
              </span>
              <span className="text-xs text-muted-foreground">
                {isQcPassed && !isReceivedInInventory ? 'Ready for Receipt' : isReceivedInInventory ? 'Ledger Posted' : 'Awaiting Assembly'}
              </span>
            </div>
          </Card>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center gap-2 border-border-strong border-border pb-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${isActive
                    ? 'bg-primary text-primary-foreground font-extrabold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`}
              >
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-foreground'
                    }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ==============================================================================
            TAB 1: COMPONENT CONVERGENCE & INTAKE (UPSTREAM HANDOVERS)
           ============================================================================== */}
        {activeTab === 'intake' && (
          <div className="space-y-6">
            <Card className="p-5 rounded-2xl border border-border bg-card shadow-none space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-border-strong border-border/60 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Boxes className="h-4 w-4 text-primary" />
                    <span>Upstream Component Intake &amp; Handovers</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Components transferred from floor route feeder departments required to assemble {productName}.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {pendingHandovers.length > 0 ? (
                    <span className="px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
                      {pendingHandovers.length} incoming {pendingHandovers.length === 1 ? 'handover' : 'handovers'} pending acceptance
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg bg-tone-green-bg border border-tone-green-solid/25 text-xs font-semibold text-tone-green-text flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>All components in custody · {buildableKits} kits buildable</span>
                    </span>
                  )}
                </div>
              </div>

              {intakeItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground rounded-xl border border-dashed border-border">
                  No upstream feeder departments are configured for this assembly route.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {intakeItems.map((item) => {
                    const req = Number(item.requiredQty || 0);
                    const acc = Number(item.acceptedQty || 0);
                    const alloc = Number(item.allocatedQty || 0);
                    const ratio = Number(item.requiredPerUnit || 1);
                    const avail = Math.max(0, acc - alloc);
                    const buildableFromThis = Math.floor(avail / (ratio > 0 ? ratio : 1));
                    const percent = req > 0 ? Math.min(100, Math.round((acc / req) * 100)) : 0;
                    const isFullyReceived = acc >= req;

                    const pendingForThis = (item.handovers || []).filter((h: any) => h.status === 'PROPOSED');
                    const acceptedForThis = (item.handovers || []).filter((h: any) => h.status === 'ACCEPTED');
                    const deptName = item.sourceStep?.department?.name || 'Upstream Department';
                    const stepLabel = item.sourceStep?.stepName ? `Step: ${item.sourceStep.stepName}` : 'Feeder Stage';

                    return (
                      <Card
                        key={item.id}
                        className={`p-4 sm:p-5 rounded-2xl border transition-all shadow-none flex flex-col justify-between space-y-4 ${
                          isFullyReceived
                            ? 'border-tone-green-solid/25 bg-card'
                            : pendingForThis.length > 0
                              ? 'border-primary/40 bg-card'
                              : 'border-border/80 bg-card'
                        }`}
                      >
                        {/* 1. Header: Department & Feeder Step */}
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border ${
                                isFullyReceived
                                  ? 'bg-tone-green-bg border-tone-green-solid/25 text-tone-green-text'
                                  : 'bg-primary/10 border-primary/20 text-primary'
                              }`}>
                                <Building2 className="h-5 w-5" />
                              </div>
                              <div>
                                <h4 className="font-bold text-sm text-foreground">
                                  {deptName}
                                </h4>
                                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                  <span className="font-mono">{stepLabel}</span>
                                  <span>•</span>
                                  <span>Floor Route Feeder</span>
                                </p>
                              </div>
                            </div>

                            {/* Status Pill */}
                            {pendingForThis.length > 0 ? (
                              <span className="px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs font-semibold text-primary flex items-center gap-1.5 shrink-0">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Pending Acceptance</span>
                              </span>
                            ) : isFullyReceived ? (
                              <span className="px-2.5 py-1 rounded-lg bg-tone-green-bg border border-tone-green-solid/25 text-xs font-semibold text-tone-green-text flex items-center gap-1.5 shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Fulfilled (100%)</span>
                              </span>
                            ) : acc > 0 ? (
                              <span className="px-2.5 py-1 rounded-lg bg-muted border border-border text-xs font-semibold text-foreground shrink-0">
                                Partial ({percent}%)
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-lg bg-muted border border-border text-xs font-semibold text-muted-foreground shrink-0">
                                Awaiting Delivery
                              </span>
                            )}
                          </div>

                          {/* Component Identity & BOM Ratio Pill */}
                          <div className="rounded-xl bg-muted/40 border border-border/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                                Component Produced
                              </span>
                              <span className="font-bold text-xs text-foreground truncate block">
                                {item.itemName}
                              </span>
                            </div>
                            <div className="sm:text-right shrink-0">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                                Assembly Ratio
                              </span>
                              <span className="font-mono text-xs font-bold text-primary">
                                {ratio} {item.unitName} / unit
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 2. Three Clean Quantitative Columns (No stale colors!) */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-xl border border-border/80 bg-muted/20 p-2.5 flex flex-col justify-center">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Required
                            </span>
                            <span className="font-mono text-base font-bold text-foreground mt-0.5">
                              {req.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{item.unitName}</span>
                          </div>

                          <div className={`rounded-xl border p-2.5 flex flex-col justify-center ${
                            acc > 0
                              ? 'border-tone-green-solid/25 bg-tone-green-bg'
                              : 'border-border/80 bg-muted/20'
                          }`}>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              In Custody
                            </span>
                            <span className={`font-mono text-base font-bold mt-0.5 ${
                              acc > 0 ? 'text-tone-green-text' : 'text-foreground'
                            }`}>
                              {acc.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{item.unitName}</span>
                          </div>

                          <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 flex flex-col justify-center">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                              Buildable
                            </span>
                            <span className="font-mono text-base font-bold text-primary mt-0.5">
                              {buildableFromThis.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-muted-foreground">kits</span>
                          </div>
                        </div>

                        {/* 3. Feeder Fulfillment Progress Bar */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-medium text-muted-foreground">
                            <span>Feeder Fulfillment</span>
                            <span className="font-mono font-bold text-foreground">
                              {acc.toLocaleString()} / {req.toLocaleString()} {item.unitName} ({percent}%)
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isFullyReceived ? 'bg-tone-green-solid' : 'bg-primary'
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>

                        {/* 4. Handover Transfers Section */}
                        <div className="pt-2 border-t border-border/60">
                          {pendingForThis.length > 0 ? (
                            <div className="space-y-2.5">
                              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <Send className="w-3.5 h-3.5 text-primary" />
                                <span>Incoming Dispatches Awaiting Receipt ({pendingForThis.length})</span>
                              </span>

                              <div className="space-y-2">
                                {pendingForThis.map((handover: any) => {
                                  const dispatchBatch = handover.outgoingBatch?.batchNumber || 'Upstream Batch';
                                  const dispatchDept = handover.outgoingDepartment?.name || deptName;
                                  const dispatchTime = handover.proposedAt
                                    ? new Date(handover.proposedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                    : '';

                                  return (
                                    <div
                                      key={handover.id}
                                      className="p-3 rounded-xl border border-primary/20 bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                                    >
                                      <div className="space-y-0.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-bold text-foreground">
                                            {Number(handover.quantity).toLocaleString()} {item.unitName}
                                          </span>
                                          <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                                            {dispatchBatch}
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                          Dispatched by <strong>{dispatchDept}</strong>{dispatchTime ? ` at ${dispatchTime}` : ''}
                                        </p>
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0">
                                        <Button
                                          size="sm"
                                          className="h-8 px-3.5 text-xs bg-tone-green-solid hover:bg-tone-green-solid text-inverse font-bold rounded-xl shadow-xs cursor-pointer"
                                          disabled={handoverMutation.isPending}
                                          onClick={() =>
                                            handoverMutation.mutate(
                                              {
                                                handoverId: handover.id,
                                                status: 'ACCEPTED',
                                                idempotencyKey: `ACCEPTED:${handover.id}:${Date.now()}`
                                              },
                                              {
                                                onSuccess: () => {
                                                  showToast({
                                                    kind: 'success',
                                                    title: 'Transfer Accepted',
                                                    message: `${Number(handover.quantity).toLocaleString()} ${item.unitName} from ${dispatchDept} accepted into custody.`
                                                  });
                                                  refetchAll();
                                                }
                                              }
                                            )
                                          }
                                        >
                                          <Check className="mr-1 h-3.5 w-3.5" />
                                          <span>Accept ({Number(handover.quantity).toLocaleString()} {item.unitName})</span>
                                        </Button>

                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 font-semibold border-destructive/30 rounded-xl cursor-pointer"
                                          disabled={handoverMutation.isPending}
                                          onClick={() =>
                                            setRefuseModalData({
                                              open: true,
                                              handoverId: handover.id,
                                              quantity: Number(handover.quantity),
                                              unitName: item.unitName,
                                              itemName: item.itemName
                                            })
                                          }
                                        >
                                          <X className="mr-1 h-3.5 w-3.5" />
                                          <span>Refuse</span>
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : acceptedForThis.length > 0 ? (
                            <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/20 px-3.5 py-2.5 rounded-xl border border-border/60">
                              <span className="flex items-center gap-2 font-medium text-foreground">
                                <CheckCircle2 className="w-4 h-4 text-tone-green-text" />
                                <span>Accepted in Assembly Custody</span>
                              </span>
                              <span className="font-mono font-bold text-tone-green-text">
                                {acceptedForThis.reduce((s: number, h: any) => s + Number(h.quantity), 0).toLocaleString()} {item.unitName}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[11px] text-muted-foreground bg-muted/10 px-3 py-2 rounded-xl text-center">
                              No dispatches sent by {deptName} yet.
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Direct Raw Materials Allocations */}
            {directMaterials.length > 0 && (
              <Card className="p-5 rounded-2xl border border-border bg-card shadow-none space-y-4">
                <h3 className="text-sm font-bold text-foreground">Direct Warehouse Inventory Issues</h3>
                <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="border-border-strong border-border/70 bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="p-3">Material</th>
                        <th className="p-3 text-right">Issued</th>
                        <th className="p-3 text-right">Received</th>
                        <th className="p-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {directMaterials.map((item) => {
                        const pending = Number(item.receivedQty) < Number(item.issuedQty);
                        return (
                          <tr key={item.id} className="hover:bg-muted/10">
                            <td className="p-3 font-semibold text-foreground">{item.itemName}</td>
                            <td className="p-3 text-right font-mono">{Number(item.issuedQty).toLocaleString()} {item.unitName}</td>
                            <td className="p-3 text-right font-mono font-bold">{Number(item.receivedQty).toLocaleString()} {item.unitName}</td>
                            <td className="p-3">
                              {pending ? (
                                <Button
                                  size="sm"
                                  className="h-7 px-2 text-[11px] font-bold shadow-none"
                                  disabled={receiveAssignmentMutation.isPending}
                                  onClick={() => receiveAssignmentMutation.mutate(item.id)}
                                >
                                  <ArrowDown className="mr-1 h-3 w-3" />
                                  Receive
                                </Button>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-semibold text-tone-green-text">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Received
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

        {/* ==============================================================================
            TAB 2: WORKSTATION EXECUTION & WORKER ASSIGNMENT
           ============================================================================== */}
        {activeTab === 'execution' && (
          <div className="space-y-6">
            {/* Run Switcher if multiple runs exist */}
            {assemblyBatches.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1">
                  Select Work Run:
                </span>
                {assemblyBatches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBatchId(b.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${effectiveBatchId === b.id
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    {b.batchNumber} ({b.status})
                  </button>
                ))}
              </div>
            )}

            {!batch ? (
              <Card className="p-8 rounded-2xl border border-border bg-card text-center space-y-3">
                <Boxes className="mx-auto h-10 w-10 text-muted-foreground" />
                <h3 className="text-base font-bold text-foreground">No Assembly Work Runs Active</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  {buildableKits > 0
                    ? `You have ${buildableKits} complete kit(s) ready! Launch an assembly work run to assign workstation operators and start assembling.`
                    : 'Awaiting component handovers from upstream departments before an assembly run can be started.'}
                </p>
                {buildableKits > 0 && (
                  <Button
                    size="sm"
                    onClick={() => setIsStartModalOpen(true)}
                    className="gap-1.5 font-bold shadow-none mx-auto"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Launch Assembly Run</span>
                  </Button>
                )}
              </Card>
            ) : (
              <>
                {/* Active Run Banner */}
                <div className="p-4 rounded-2xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Active Assembly Work Run
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-base font-bold text-primary">{batch.batchNumber}</span>
                      <StatusBadge status={batch.status} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase font-bold">Output Progress</span>
                      <span className="font-bold text-foreground">
                        {totalLoggedFG} / {targetQty} units ({targetQty > 0 ? Math.round((totalLoggedFG / targetQty) * 100) : 0}%)
                      </span>
                    </div>
                    {!isAssignmentLocked && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsAssignWorkerModalOpen(true)}
                        className="gap-1.5 font-bold shadow-none text-xs border-border hover:bg-muted/30 cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5 text-primary" />
                        <span>Assign Worker</span>
                      </Button>
                    )}
                    {batch.status === 'PLANNED' && (
                      <Button
                        size="sm"
                        onClick={handleAllocateComponents}
                        disabled={allocateMutation.isPending}
                        className="gap-1.5 font-bold shadow-none text-xs"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Allocate Kit Components</span>
                      </Button>
                    )}
                    {(batch.status === 'ALLOCATED' || batch.status === 'REWORK') && (
                      <Button
                        size="sm"
                        onClick={handleStartExecution}
                        disabled={startMutation.isPending}
                        className="gap-1.5 font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-none text-xs"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Start Assembly</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Worker Assignment Section */}
                <Card className="p-5 rounded-2xl border border-border bg-card shadow-none space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-border-strong border-border/60 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-muted text-foreground">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground">
                          Workstation Operators &amp; Technicians
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Personnel assigned to this assembly workstation from {assemblyDepartment?.name || 'Assembly Department'}.
                        </p>
                      </div>
                    </div>

                    {!isAssignmentLocked ? (
                      <Button
                        size="sm"
                        onClick={() => setIsAssignWorkerModalOpen(true)}
                        className="gap-1.5 font-bold shadow-none shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Assign Worker</span>
                      </Button>
                    ) : (
                      <span className="font-mono text-[11px] font-bold px-2.5 py-1 rounded-md bg-muted text-muted-foreground border border-border">
                        ASSIGNMENTS LOCKED
                      </span>
                    )}
                  </div>

                  {/* Worker List */}
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-border-strong border-border bg-muted/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          <th className="px-4 py-2">Worker Name &amp; Code</th>
                          <th className="px-3 py-2">Station Subtask</th>
                          <th className="px-3 py-2">Assigned At</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {(batch.workerAssignments || []).length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-6 text-center text-muted-foreground text-xs">
                              <p>No operators assigned to this station yet.</p>
                              {!isAssignmentLocked && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setIsAssignWorkerModalOpen(true)}
                                  className="mt-2 text-xs font-bold"
                                >
                                  <Plus className="mr-1 h-3 w-3" />
                                  Assign Shop Floor Operator
                                </Button>
                              )}
                            </td>
                          </tr>
                        ) : (
                          (batch.workerAssignments || []).map((w: AssemblyWorkerAssignmentDto) => (
                            <tr key={w.id} className="hover:bg-muted/10 transition-colors">
                              <td className="px-4 py-2.5 font-bold text-foreground">
                                {getEmployeeLabel(w.employeeId, w.employeeName)}
                              </td>
                              <td className="px-3 py-2.5 text-foreground">
                                {w.subtaskDescription || 'General Assembly'}
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground font-mono">
                                {w.assignedAt ? new Date(w.assignedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                {!isAssignmentLocked && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      unassignWorkerMutation.mutate({
                                        id: batch.id,
                                        employeeId: w.employeeId
                                      })
                                    }
                                    disabled={unassignWorkerMutation.isPending}
                                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                    title="Remove operator from assembly station"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Progress Delta Events */}
                {isStarted && (
                  <Card className="p-5 rounded-2xl border border-border bg-card shadow-none space-y-4">
                    <div className="flex items-center justify-between border-border-strong border-border/60 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-muted text-foreground">
                          <TrendingUp className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-foreground">
                            Work in Progress (WIP) &amp; Execution Progress
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Record incremental finished assembly output towards the scheduled target.
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setReportLossModalOpen(true)}
                        className="h-7 text-[11px] gap-1 px-2.5 font-bold"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                        <span>Report Loss &amp; Scrap</span>
                      </Button>
                    </div>

                    {!isTargetFulfilled ? (
                      <form onSubmit={handleRecordProgress} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                              Logging Worker <span className="text-destructive">*</span>
                            </label>
                            {assignedWorkerOptions.length > 0 ? (
                              <SearchableSelector
                                value={progressEmployeeId}
                                onChange={(val) => setProgressEmployeeId(val)}
                                options={assignedWorkerOptions}
                                placeholder="-- Choose Assigned Operator --"
                                className="w-full text-xs"
                              />
                            ) : (
                              <div className="text-[11px] text-tone-amber-text font-semibold py-1.5 px-2 rounded-lg bg-tone-amber-bg border border-tone-amber-solid/25">
                                Assign operator above first
                              </div>
                            )}
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                              Event State
                            </label>
                            <select
                              value={progressEventType}
                              onChange={(e) => setProgressEventType(e.target.value as ProgressEventType)}
                              className="w-full rounded-xl border border-border bg-background p-2.5 text-xs text-foreground font-mono"
                            >
                              <option value="PARTIAL_RECORDED">PARTIAL_RECORDED</option>
                              <option value="COMPLETED">COMPLETED</option>
                              <option value="STARTED">STARTED</option>
                              <option value="PAUSED">PAUSED</option>
                              <option value="RESUMED">RESUMED</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                              Delta Completed Units (FG) <span className="text-destructive">*</span>
                            </label>
                            <Input
                              type="number"
                              min="1"
                              max={Math.max(1, remainingToLog)}
                              step="1"
                              value={progressDelta}
                              onChange={(e) => setProgressDelta(e.target.value)}
                              className="rounded-xl h-9 text-xs font-mono font-bold"
                            />
                          </div>

                          <Button
                            type="submit"
                            size="sm"
                            disabled={!progressEmployeeId || recordProgressMutation.isPending || Number(progressDelta) <= 0}
                            className="gap-1.5 font-bold shadow-none h-9"
                          >
                            <Check className="w-4 h-4" />
                            <span>Log Progress Delta</span>
                          </Button>
                        </div>

                        <div className="p-2.5 rounded-lg border border-border/80 bg-muted/20 text-xs flex items-center justify-between">
                          <div className="font-mono text-muted-foreground">
                            Current progress: <strong className="text-foreground">{totalLoggedFG}</strong> / {targetQty} units · Remaining: <strong className="text-foreground">{remainingToLog}</strong> units
                          </div>
                          <div className="font-mono text-xs text-primary font-bold">
                            Advance to: {Math.min(targetQty, totalLoggedFG + Number(progressDelta || 0))} / {targetQty} units
                          </div>
                        </div>
                      </form>
                    ) : (
                      <div className="p-4 rounded-xl border border-tone-green-solid/25 bg-tone-green-bg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 font-semibold text-tone-green-text">
                          <CheckCircle2 className="w-4 h-4 text-tone-green-text shrink-0" />
                          <span>All {targetQty} planned finished goods units have been logged. Workstation execution is complete.</span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setActiveTab('completion')}
                          className="gap-1.5 font-bold shadow-none shrink-0 bg-tone-green-solid hover:bg-tone-green-solid text-inverse"
                        >
                          <Scale className="w-4 h-4" />
                          <span>Proceed to Completion &amp; QC →</span>
                        </Button>
                      </div>
                    )}

                    {/* Progress Stream Table */}
                    <div className="rounded-xl border border-border overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-border-strong border-border bg-muted/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            <th className="px-4 py-2">Timestamp</th>
                            <th className="px-3 py-2">Operator</th>
                            <th className="px-3 py-2">Event Type</th>
                            <th className="px-3 py-2 text-right">Delta Units</th>
                            <th className="px-3 py-2">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {(batch.progressEvents || []).length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-4 text-center text-muted-foreground text-xs">
                                No progress events recorded yet.
                              </td>
                            </tr>
                          ) : (
                            (batch.progressEvents || []).map((ev: AssemblyProgressEventDto) => (
                              <tr key={ev.id} className="hover:bg-muted/10">
                                <td className="px-4 py-2.5 font-mono text-muted-foreground">
                                  {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </td>
                                <td className="px-3 py-2.5 font-semibold text-foreground">
                                  {getEmployeeLabel(ev.employeeId, ev.employeeName)}
                                </td>
                                <td className="px-3 py-2.5 font-mono font-semibold text-foreground">
                                  {ev.eventType}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-bold text-tone-green-text">
                                  +{Number(ev.quantityDelta)}
                                </td>
                                <td className="px-3 py-2.5 text-muted-foreground">
                                  {ev.notes || '-'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Reported Scrap & Loss Events Table */}
                    <div className="rounded-xl border border-border overflow-hidden bg-background/50">
                      <div className="px-4 py-2.5 bg-muted/40 border-border-strong border-border flex items-center justify-between text-xs">
                        <span className="font-bold text-foreground flex items-center gap-2">
                          <Trash2 className="w-4 h-4 text-tone-red-text" />
                          <span>Reported Scrap &amp; Loss Events ({batchLossEvents.length})</span>
                        </span>
                        <span className="text-muted-foreground text-[11px]">
                          Assembly Defect Ledger &amp; Inventory Write-offs
                        </span>
                      </div>

                      {batchLossEvents.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          No loss or scrap reported for this assembly run yet. If any sub-components or finished units are damaged, click <strong className="text-foreground">Report Loss &amp; Scrap</strong> to record them.
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
                              {batchLossEvents.map((evt: LossEventDto) => {
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
                                      {evt.reason || 'Assembly defect'}
                                    </td>
                                    <td className="px-3 py-2.5 text-muted-foreground">
                                      {evt.reportedByActorName || 'Operator'}
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
                )}
              </>
            )}
          </div>
        )}

        {/* ==============================================================================
            TAB 3: COMPLETION & CONSERVATION CHECK
           ============================================================================== */}
        {activeTab === 'completion' && (
          <form onSubmit={handleCompleteBatch} className="space-y-6">
            {!batch ? (
              <Card className="p-8 text-center text-xs text-muted-foreground">
                No active assembly run selected to reconcile.
              </Card>
            ) : (
              <>
                {isQcPending && (
                  <div className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">
                        Assembly Completed — QC Inspection Pending
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Output recorded for {batch.actualOutputQuantity || batch.targetOutputQuantity} units. Proceed directly to Assembly QC Gate for final inspection.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => setActiveTab('qc')}
                      className="shrink-0 gap-1.5 font-bold"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Open Assembly QC Gate →</span>
                    </Button>
                  </div>
                )}

                <Card className="p-6 rounded-2xl border border-border bg-card shadow-none space-y-5">
                  <div className="flex items-center gap-2.5 border-border-strong border-border/60 pb-3">
                    <div className="p-2 rounded-xl bg-muted text-foreground">
                      <Scale className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">
                        Final Output Declarations &amp; Deductions
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Declare final acceptable finished output and scrap deductions.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Good Finished Goods Output (Units) <span className="text-destructive">*</span>
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        disabled={batch.status !== 'IN_ASSEMBLY' && batch.status !== 'PARTIAL'}
                        value={actualOutputQty}
                        onChange={(e) => setActualOutputQty(e.target.value)}
                        className="rounded-xl font-mono font-bold text-base h-10"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Scrap / Defective Assembly Units
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        disabled={batch.status !== 'IN_ASSEMBLY' && batch.status !== 'PARTIAL'}
                        value={scrapQty}
                        onChange={(e) => setScrapQty(e.target.value)}
                        className="rounded-xl font-mono font-bold text-base h-10"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                    {batch.status === 'IN_ASSEMBLY' || batch.status === 'PARTIAL' ? (
                      <Button
                        type="submit"
                        disabled={completeMutation.isPending || Number(actualOutputQty || 0) <= 0}
                        className="gap-2 font-bold min-w-44 shadow-none"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{completeMutation.isPending ? 'Submitting...' : 'Submit For Assembly QC'}</span>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => setActiveTab('qc')}
                        className="gap-2 font-bold min-w-44 shadow-none"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>Inspect in QC Gate →</span>
                      </Button>
                    )}
                  </div>
                </Card>
              </>
            )}
          </form>
        )}

        {/* ==============================================================================
            TAB 4: ASSEMBLY QC GATE (V-009)
           ============================================================================== */}
        {activeTab === 'qc' && (
          <div className="space-y-6">
            {!batch ? (
              <Card className="p-8 text-center text-xs text-muted-foreground">
                No active assembly run selected for QC inspection.
              </Card>
            ) : (
              <>
                {!isQcPending && !isQcPassed && !isRework && !isRejected && (
                  <GateBlockedState
                    gate="V-009"
                    title="QC Gate Blocked Until Assembly Completed"
                    message="This assembly batch has not completed workstation execution. It cannot undergo QC inspection until status moves to QC_PENDING."
                    resolutionLabel="Go to Completion Tab"
                    onRetry={() => setActiveTab('completion')}
                  />
                )}

                {qcGateBlockedError && (
                  <div className="space-y-3">
                    <GateBlockedState
                      gate="V-009"
                      title="Assembly QC Criteria Gate Blocked (V-009)"
                      message={qcGateBlockedError}
                      missingDetails={[
                        { label: 'Product', value: productName },
                        { label: 'Gate Rule', value: 'Approved Assembly QC Criteria (V-009)' }
                      ]}
                      resolutionLabel="Configure & Approve QC Rule"
                      onResolutionClick={() => setShowCreateQcRuleModal(true)}
                      onRetry={() => {
                        setQcGateBlockedError(null);
                        refetchAll();
                      }}
                    />
                    <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="font-bold text-foreground block">Quick Gate Resolution</span>
                        <span className="text-muted-foreground text-[11px]">
                          Auto-generate and approve standard assembly QC criteria checklist for {productName} to immediately satisfy invariant V-009.
                        </span>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleAutoApproveDefaultQcRule}
                        disabled={isAutoCreatingQcRule}
                        className="gap-1.5 font-bold shadow-none bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isAutoCreatingQcRule ? 'Approving...' : '1-Click Approve QC Criteria'}</span>
                      </Button>
                    </div>
                  </div>
                )}

                <Card className="p-6 rounded-2xl border border-border bg-card shadow-none space-y-5">
                  <div className="flex items-center justify-between border-border-strong border-border/60 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-muted text-foreground">
                        <ShieldCheck className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground">
                          Assembly Quality Control Inspection Gate (V-009)
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Execute formal quality gate disposition before finished goods inventory entry.
                        </p>
                      </div>
                    </div>

                    <StatusBadge status={batch.status} />
                  </div>

                  {isQcPending ? (
                    <form onSubmit={handleQcSubmit} className="space-y-4">
                      {/* Interactive QC Criteria Checklist */}
                      <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-3.5">
                        <div className="flex items-center justify-between pb-2 border-border-strong border-border/60">
                          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            {activeQcRule?.name || `${productName} Quality Criteria Gate`}
                            <span className="font-mono text-[10px] text-primary px-1.5 py-0.5 rounded-md bg-primary/10">
                              {activeQcRule?.code || 'QC-ASM-GATE'}
                            </span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-muted-foreground">
                              {verifiedChecksCount} / {qcCriteriaList.length} Verified
                            </span>
                            <button
                              type="button"
                              onClick={handlePassAllChecks}
                              className="text-xs font-bold text-tone-green-text hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Verify All (100%)
                            </button>
                          </div>
                        </div>

                        <div className="divide-y divide-border/60">
                          {qcCriteriaList.map((crit: any, idx: number) => {
                            const isChecked = !!criteriaChecked[idx];
                            return (
                              <div
                                key={idx}
                                onClick={() => {
                                  setCriteriaChecked((prev) => ({ ...prev, [idx]: !prev[idx] }));
                                }}
                                className="py-2 flex items-center justify-between gap-3 hover:bg-muted/30 px-2 rounded-lg cursor-pointer transition-colors"
                              >
                                <div className="flex items-start gap-2.5 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {}} // handled by row click
                                    className="mt-0.5 h-4 w-4 rounded border-border text-primary cursor-pointer"
                                  />
                                  <div className="min-w-0">
                                    <p className={`text-xs font-semibold ${isChecked ? 'text-foreground' : 'text-foreground/80'}`}>
                                      {crit.name}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground truncate">
                                      {crit.inspectionMethod || 'Standard QA inspection'}
                                      {crit.nominalValue && (
                                        <span className="font-mono ml-2 font-medium">
                                          Nominal: {crit.nominalValue} {crit.unit || ''} ({crit.minTolerance || '-0'} / {crit.maxTolerance || '+0'})
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    crit.severity === 'CRITICAL'
                                      ? 'bg-tone-red-bg text-tone-red-text'
                                      : crit.severity === 'MAJOR'
                                        ? 'bg-tone-amber-bg text-tone-amber-text'
                                        : 'bg-tone-blue-bg text-tone-blue-text'
                                  }`}>
                                    {crit.severity || 'STANDARD'}
                                  </span>
                                  <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                                    isChecked
                                      ? 'bg-tone-green-bg text-tone-green-text'
                                      : 'bg-muted text-muted-foreground'
                                  }`}>
                                    {isChecked ? 'PASS' : 'PENDING'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Inspection Gate Disposition <span className="text-destructive">*</span>
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {[
                            { id: 'PASSED_TO_FG', label: 'PASS → Transfer to Finished Goods', desc: 'Accept batch and post to FG stock' },
                            { id: 'REWORK', label: 'REWORK → Loop Back to Prior Stage', desc: 'Return batch to workstation for corrective action' },
                            { id: 'REJECTED', label: 'REJECT → Route to Loss & Scrap', desc: 'Reject full batch to Module 11 loss hub' },
                          ].map((disp) => (
                            <button
                              key={disp.id}
                              type="button"
                              onClick={() => setQcDisposition(disp.id as 'PASSED_TO_FG' | 'REWORK' | 'REJECTED')}
                              className={`p-4 rounded-xl text-left border-border transition-all cursor-pointer ${qcDisposition === disp.id
                                  ? 'border-primary bg-primary/10 text-foreground font-bold'
                                  : 'border-border bg-muted/20 text-muted-foreground hover:border-border/80'
                                }`}
                            >
                              <span className="font-bold text-xs text-foreground block">{disp.label}</span>
                              <span className="text-[11px] text-muted-foreground mt-1 block">{disp.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          QC Inspection Notes &amp; Criteria Checklist
                        </label>
                        <textarea
                          value={qcInspectionNotes}
                          onChange={(e) => setQcInspectionNotes(e.target.value)}
                          placeholder="Dimensional tolerances, surface finish, fastener torques, assembly integrity..."
                          rows={3}
                          className="w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                        />
                      </div>

                      {qcDisposition !== 'PASSED_TO_FG' && (
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-destructive">
                            Reason for Rework / Rejection <span className="text-destructive">*</span>
                          </label>
                          <Input
                            value={qcRejectionReason}
                            onChange={(e) => setQcRejectionReason(e.target.value)}
                            placeholder="Specify defect code or root cause failure..."
                            className="rounded-xl text-xs h-10 border-destructive/40"
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                        <Button
                          type="submit"
                          disabled={qcMutation.isPending || !isQcPending}
                          className="gap-2 font-bold min-w-44 shadow-none"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          <span>Execute QC Disposition</span>
                        </Button>
                      </div>
                    </form>
                  ) : isQcPassed ? (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl border border-tone-green-solid/25 bg-tone-green-bg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 font-semibold text-tone-green-text">
                          <CheckCircle2 className="w-4 h-4 text-tone-green-text shrink-0" />
                          <span>
                            Assembly batch passed QC Gate with status <strong>PASSED_TO_FG</strong>. The batch is cleared and ready for Finished Goods warehouse intake.
                          </span>
                        </div>
                        {!isReceivedInInventory && (
                          <Button
                            size="sm"
                            onClick={() => setActiveTab('inventory')}
                            className="gap-1.5 font-bold shadow-none bg-tone-green-solid hover:bg-tone-green-solid text-inverse shrink-0"
                          >
                            <PackageCheck className="w-4 h-4" />
                            <span>Post to Inventory Ledger →</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </Card>
              </>
            )}
          </div>
        )}

        {/* ==============================================================================
            TAB 5: FINISHED GOODS & AUTHORITATIVE INVENTORY LEDGER POSTING
           ============================================================================== */}
        {activeTab === 'inventory' && (
          <div className="space-y-6">
            {isReceivedInInventory ? (
              <Card className="p-6 rounded-2xl border border-tone-green-solid/25 bg-card shadow-none space-y-5">
                <div className="flex items-center justify-between border-border-strong border-border/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-tone-green-bg text-tone-green-text">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">
                        Finished Goods Received into Inventory
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Immutable stock ledger entry posted and on-hand balance updated in warehouse.
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-tone-green-bg border border-tone-green-solid/25 text-xs font-mono font-bold text-tone-green-text">
                    RECEIVED
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Receipt Number
                    </span>
                    <span className="font-mono text-sm font-bold text-primary block">
                      {fgReceipt?.receiptNumber || 'FGR-XXXX'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Inventory Status
                    </span>
                    <span className="text-xs font-bold text-tone-green-text block">
                      Posted to Finished Goods Stock
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Quantity Received
                    </span>
                    <span className="font-mono text-sm font-bold text-tone-green-text block">
                      {fgReceipt?.quantity || batch?.actualOutputQuantity} {uomSymbol}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-tone-green-solid/25 bg-tone-green-bg text-xs text-tone-green-text flex items-center gap-3">
                  <PackageCheck className="w-5 h-5 text-tone-green-text shrink-0" />
                  <div>
                    <strong className="block text-tone-green-text">
                      Authoritative Stock Ledger Entry Posted (GRN_RECEIPT · Direction: IN)
                    </strong>
                    <span>
                      Inventory on-hand balance has been updated in the stock ledger. This stock is now available for sales dispatch.
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                  <Link href="/inventory/fg-receipts">
                    <Button variant="outline" size="sm" className="gap-1.5 font-bold">
                      <span>View in Finished Goods Register</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                  <Link href="/inventory">
                    <Button size="sm" className="gap-1.5 font-bold shadow-none">
                      <Warehouse className="w-4 h-4" />
                      <span>View Finished Goods Stock</span>
                    </Button>
                  </Link>
                </div>
              </Card>
            ) : (
              <Card className="p-6 rounded-2xl border border-border bg-card shadow-none space-y-5">
                <div className="flex items-center justify-between border-border-strong border-border/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                      <PackageCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">
                        Post Finished Goods to Inventory
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Post this completed and QC-approved assembly batch directly into Finished Goods stock.
                      </p>
                    </div>
                  </div>

                  <span className="px-3 py-1 rounded-full bg-tone-green-bg border border-tone-green-solid/25 text-xs font-mono font-bold text-tone-green-text">
                    READY FOR INVENTORY
                  </span>
                </div>

                {/* Output Ready Details */}
                <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-2 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span className="text-muted-foreground">Output Reference:</span>
                    <span className="font-mono text-foreground font-bold">{primaryFgOutput?.outputNumber || 'FGO-READY'}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span className="text-muted-foreground">Product &amp; SKU:</span>
                    <span className="text-foreground">{productName} {productSku ? `(${productSku})` : ''}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span className="text-muted-foreground">Approved Finished Goods Quantity:</span>
                    <span className="font-mono text-tone-green-text font-bold text-sm">
                      {primaryFgOutput?.quantity || batch?.actualOutputQuantity || targetQty} {uomSymbol}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span className="text-muted-foreground">Quality Inspection Gate:</span>
                    <span className="font-bold text-tone-green-text">PASSED (V-009 Cleared)</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span className="text-muted-foreground">Target Destination:</span>
                    <span className="font-bold text-foreground">Finished Goods Inventory (Authoritative Stock Ledger)</span>
                  </div>
                </div>

                <form onSubmit={handleExecuteReceive} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Receipt Notes (Optional)
                    </label>
                    <Input
                      value={receiveNotes}
                      onChange={(e) => setReceiveNotes(e.target.value)}
                      placeholder="Optional notes for the stock ledger entry..."
                      className="rounded-xl text-xs h-10"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                    <Button
                      type="submit"
                      disabled={receiveThroughGateMutation.isPending || !effectiveLocationId}
                      className="gap-2 font-bold min-w-56 shadow-none bg-tone-green-solid hover:bg-tone-green-solid text-inverse"
                    >
                      <PackageCheck className="w-4 h-4" />
                      <span>{receiveThroughGateMutation.isPending ? 'Posting to Inventory...' : 'Post to Finished Goods Inventory'}</span>
                    </Button>
                  </div>
                </form>
              </Card>
            )}
          </div>
        )}

        {/* ==============================================================================
            TAB 6: TIMELINE & HISTORY
           ============================================================================== */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <VersionHistory
              versions={[
                {
                  id: scheduleDetail?.id || id,
                  status: (scheduleDetail?.status as any) || 'IN_PROGRESS',
                  createdAt: scheduleDetail?.scheduleDate || new Date().toISOString(),
                  actor: 'Production Planner',
                  action: `Production Schedule ${planNumber} created for ${productName}`,
                },
                ...(batch?.progressEvents || []).map((ev: AssemblyProgressEventDto) => ({
                  id: ev.id,
                  status: (batch?.status as any) || 'IN_ASSEMBLY',
                  createdAt: ev.timestamp,
                  actor: ev.employeeName || 'Operator',
                  action: `Progress Event: ${ev.eventType} (+${Number(ev.quantityDelta)} FG units)`,
                  summary: ev.notes || undefined,
                })),
              ]}
            />
          </div>
        )}

        {/* ==============================================================================
            MODALS
           ============================================================================== */}

        {/* Universal Assign Worker Modal */}
        {batch && (
          <AssignWorkerModal
            open={isAssignWorkerModalOpen}
            onClose={() => setIsAssignWorkerModalOpen(false)}
            batchId={batch.id}
            batchNumber={batch.batchNumber}
            departmentId={assemblyDepartmentId || ''}
            departmentName={assemblyDepartment?.name || 'Assembly Department'}
            departmentHead={(assemblyDepartment as any)?.departmentHead}
            departmentEmployees={departmentEmployees.map((e) => ({
              id: e.id,
              firstName: e.firstName,
              lastName: e.lastName,
              employeeCode: e.employeeCode,
              designation: (e as any).designation || undefined,
              role: e.role
            }))}
            assignedEmployeeIds={(batch.workerAssignments || []).map((w) => w.employeeId)}
            customAssign={async (employeeId, subtaskDescription) => {
              await assignWorkerMutation.mutateAsync({
                id: batch.id,
                payload: {
                  employeeId,
                  subtaskDescription: subtaskDescription || null
                }
              });
            }}
            onAssigned={() => {
              refetchAll();
              refetchEmployees();
            }}
          />
        )}

        {/* Start Assembly Wave Modal */}
        <StartAssemblyModal
          open={isStartModalOpen}
          onClose={() => setIsStartModalOpen(false)}
          planId={scheduleDetail?.id || batch?.productionPlanId || id}
          planNumber={planNumber}
          productName={productName}
          maxKits={buildableKits}
          remainingPlanned={remainingPlanned}
          intakeItems={intakeItems}
          onSuccess={() => {
            refetchAll();
            setActiveTab('execution');
          }}
        />

        {/* Refuse Handover Modal */}
        <RefuseHandoverModal
          open={refuseModalData.open}
          onClose={() => setRefuseModalData((prev) => ({ ...prev, open: false }))}
          handoverId={refuseModalData.handoverId}
          quantity={refuseModalData.quantity}
          unitName={refuseModalData.unitName}
          itemName={refuseModalData.itemName}
          onSuccess={() => refetchAll()}
        />

        {/* Fast FG Receipt Modal */}
        <Dialog
          open={isReceiveModalOpen}
          onClose={() => setIsReceiveModalOpen(false)}
          title="Post Finished Goods to Inventory"
          description={`Post completed goods for ${batch?.batchNumber || planNumber} directly into authoritative inventory.`}
        >
          <form onSubmit={handleExecuteReceive} className="space-y-4 pt-2">
            <div className="p-3 bg-muted/40 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between font-bold">
                <span className="text-muted-foreground">Product:</span>
                <span className="text-foreground">{productName} {productSku ? `(${productSku})` : ''}</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground">Approved Output Qty:</span>
                <span className="font-bold text-tone-green-text">
                  {primaryFgOutput?.quantity || batch?.actualOutputQuantity || targetQty} {uomSymbol}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Output Reference:</span>
                <span className="font-mono text-foreground font-semibold">{primaryFgOutput?.outputNumber || 'FGO-READY'}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Inventory Ledger:</span>
                <span className="font-semibold text-tone-green-text">Finished Goods Stock Ledger (GRN_RECEIPT · IN)</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Receipt Notes (Optional)
              </label>
              <Input
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                placeholder="Optional notes for the stock ledger entry..."
                className="rounded-xl text-xs h-10"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsReceiveModalOpen(false)}
                disabled={receiveThroughGateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={receiveThroughGateMutation.isPending || !effectiveLocationId}
                className="bg-tone-green-solid hover:bg-tone-green-solid text-inverse font-bold shadow-none"
              >
                <PackageCheck className="w-4 h-4 mr-1" />
                <span>{receiveThroughGateMutation.isPending ? 'Posting...' : 'Confirm & Post to Inventory'}</span>
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Report Loss Modal */}
        {batch && (
          <ReportLossModal
            open={reportLossModalOpen}
            onClose={() => setReportLossModalOpen(false)}
            defaultScenario="FINAL_GOODS_QC_DEFECT"
            contextType="ASSEMBLY_BATCH"
            batchId={batch.id}
            batchNumber={batch.batchNumber}
            productId={batch.productId}
            productName={productName}
            uomId={(batch as any).product?.uomId || (batch as any).productionPlan?.product?.uomId || (batch as any).uomId}
            uomSymbol={uomSymbol}
            components={(batch.components || []).map((c: AssemblyBatchComponentDto) => ({
              id: c.id,
              materialId: (c as any).bomLine?.materialId || (c as any).materialIssueLine?.materialId,
              productId: (c as any).bomLine?.componentProductId || (c as any).materialIssueLine?.componentProductId,
              materialName: c.materialName,
              productName: c.productName,
              itemCode: c.itemCode,
              uomId: c.uomId,
              uomCode: c.uomCode
            }))}
            onSuccess={() => {
              refetchAll();
              refetchLossEvents();
            }}
          />
        )}

        {/* QC Rule Creation Modal */}
        {showCreateQcRuleModal && batch && (
          <QcRuleModal
            isOpen={showCreateQcRuleModal}
            onClose={() => setShowCreateQcRuleModal(false)}
            initialTargetType="PRODUCT"
            initialTargetId={batch.productId}
            initialName={`${productName} Assembly QC Criteria`}
            initialCode={`QC-ASM-${((productName || 'PROD').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)).toUpperCase()}`}
            autoApproveOnCreate={true}
            onSuccess={() => {
              setShowCreateQcRuleModal(false);
              setQcGateBlockedError(null);
              showToast({
                title: 'QC Criteria Activated',
                message: 'Approved QC rule created. You can now execute QC disposition.',
                kind: 'success'
              });
              refetchAll();
            }}
          />
        )}
      </div>
    </div>
  );
}
