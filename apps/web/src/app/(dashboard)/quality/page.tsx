'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  QcQueueItemDto,
  QcCheckpointType,
} from '@synergy/types';
import { qualityApi, CheckpointResolutionData } from '@/features/quality/api';
import { BlockedCheckpointBanner } from '@/features/quality/components/BlockedCheckpointBanner';
import { InspectionModal } from '@/features/quality/components/InspectionModal';
import { OverrideModal } from '@/features/quality/components/OverrideModal';
import { QcRuleModal } from '@/features/quality/components/QcRuleModal';
import { Button, Input } from '@synergy/ui';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  Plus,
  History,
  Clock,
  Layers,
  AlertTriangle,
  ChevronRight,
  Truck,
  ShieldAlert,
  Scale,
  CheckCircle2,
  MousePointerClick,
} from 'lucide-react';

export default function QualityQueuePage() {
  const [targetFilter, setTargetFilter] = useState<'ALL' | 'BATCH' | 'GRN_LINE'>('ALL');
  const [checkpointFilter, setCheckpointFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queueItems, setQueueItems] = useState<QcQueueItemDto[]>([]);

  // Selected for Inspect / Override / Checkpoint Details
  const [activeItem, setActiveItem] = useState<QcQueueItemDto | null>(null);
  const [checkpointData, setCheckpointData] = useState<CheckpointResolutionData | null>(null);
  const [isResolvingCheckpoints, setIsResolvingCheckpoints] = useState(false);

  // Modals state
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: Parameters<typeof qualityApi.getQueue>[0] = {};
      if (targetFilter !== 'ALL') {
        filters.targetType = targetFilter;
      }
      if (checkpointFilter !== 'ALL') {
        filters.checkpointType = checkpointFilter as QcCheckpointType;
      }
      const data = await qualityApi.getQueue(filters);
      setQueueItems(data.items || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch inspection queue');
    } finally {
      setLoading(false);
    }
  }, [targetFilter, checkpointFilter]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Load checkpoint resolution when selecting an item
  const handleSelectItem = async (item: QcQueueItemDto) => {
    setActiveItem(item);
    setIsResolvingCheckpoints(true);
    try {
      const res = await qualityApi.resolveCheckpoints(item.targetType, item.targetId);
      setCheckpointData(res);
    } catch (err: unknown) {
      console.error('Failed to resolve checkpoints:', err);
    } finally {
      setIsResolvingCheckpoints(false);
    }
  };

  // Filter queue items by search term
  const filteredItems = useMemo(() => {
    return queueItems.filter((item) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();
      return (
        item.referenceNumber.toLowerCase().includes(term) ||
        (item.itemDescription && item.itemDescription.toLowerCase().includes(term)) ||
        (item.departmentName && item.departmentName.toLowerCase().includes(term))
      );
    });
  }, [queueItems, searchTerm]);

  // Derived stats
  const stats = useMemo(() => {
    const total = queueItems.length;
    const batches = queueItems.filter((i) => i.targetType === 'BATCH').length;
    const grnLines = queueItems.filter((i) => i.targetType === 'GRN_LINE').length;
    const inProcess = queueItems.filter((i) => i.checkpointType === 'IN_PROCESS' || i.checkpointType === 'INTERMEDIATE' || i.checkpointType === 'ASSEMBLY').length;
    return { total, batches, grnLines, inProcess };
  }, [queueItems]);

  const blockedCheckpoints = useMemo(() => {
    return (checkpointData?.checkpoints || []).filter((cp) => !cp.hasApprovedCriteria);
  }, [checkpointData]);

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-6 lg:p-8 dark:bg-[#070b14]/70 font-manrope">
      <div className="mx-auto max-w-[1680px] space-y-5">
        
        {/* ======================================================== */}
        {/* 1. STREAMLINED PAGE HEADER & ACTIONS                     */}
        {/* ======================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span className="text-primary font-semibold uppercase tracking-wider text-[11px]">
                Quality Assurance &amp; Compliance
              </span>
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-foreground font-semibold">Inspection Queue</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-2xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Quality Inspection Queue
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Real-time quality gates, in-process stage checks, receiving GRN verifications, and compliance enforcement.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <Button
              variant="outline"
              size="sm"
              onClick={loadQueue}
              className="h-9.5 px-3.5 text-xs font-semibold rounded-xl shadow-2xs hover:bg-muted/80 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
              <span>Live Sync</span>
            </Button>

            <Link href="/quality/history">
              <Button
                variant="outline"
                size="sm"
                className="h-9.5 px-3.5 text-xs font-semibold rounded-xl shadow-2xs hover:bg-muted/80 transition-all flex items-center gap-2 cursor-pointer"
              >
                <History className="w-3.5 h-3.5 text-primary" />
                <span>Inspection History</span>
              </Button>
            </Link>

            <Link href="/quality/rules">
              <Button
                variant="outline"
                size="sm"
                className="h-9.5 px-3.5 text-xs font-semibold rounded-xl shadow-2xs hover:bg-muted/80 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Scale className="w-3.5 h-3.5 text-primary" />
                <span>QC Rules</span>
              </Button>
            </Link>

            <Button
              size="sm"
              onClick={() => setShowRuleModal(true)}
              className="h-9.5 px-4 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs hover:shadow transition-all flex items-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              <Plus className="w-4 h-4" />
              <span>Configure QC Rule</span>
            </Button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. COMPACT 4-CARD METRIC SUMMARY STRIP                   */}
        {/* ======================================================== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Pending Inspection
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Clock className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {stats.total}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                gate queue
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Production Batches
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Layers className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {stats.batches}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                shopfloor
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                GRN Inward Lines
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Truck className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {stats.grnLines}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                dock receiving
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Stage Gate Checks
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <ShieldAlert className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {stats.inProcess}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                in-process
              </span>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 3. UNIFIED SEGMENTED TOOLBAR (TARGETS, CHECKPOINTS, SEARCH) */}
        {/* ======================================================== */}
        <div className="rounded-2xl border border-border bg-card p-3 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              {/* Target Scope Switcher */}
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted/70 border border-border/50">
                <button
                  type="button"
                  onClick={() => setTargetFilter('ALL')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    targetFilter === 'ALL'
                      ? 'bg-card text-primary shadow-xs border border-border/40'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All Targets ({stats.total})
                </button>
                <button
                  type="button"
                  onClick={() => setTargetFilter('BATCH')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    targetFilter === 'BATCH'
                      ? 'bg-card text-primary shadow-xs border border-border/40'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Production Batches ({stats.batches})
                </button>
                <button
                  type="button"
                  onClick={() => setTargetFilter('GRN_LINE')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    targetFilter === 'GRN_LINE'
                      ? 'bg-card text-primary shadow-xs border border-border/40'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  GRN Inward Lines ({stats.grnLines})
                </button>
              </div>

              {/* Checkpoint Dropdown */}
              <select
                aria-label="Filter by checkpoint"
                value={checkpointFilter}
                onChange={(e) => setCheckpointFilter(e.target.value)}
                className="h-9.5 rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer"
              >
                <option value="ALL">All Checkpoint Gates</option>
                <option value="INCOMING_MATERIAL">Incoming Material (GRN Dock)</option>
                <option value="IN_PROCESS">In-Process (Stage Gate)</option>
                <option value="INTERMEDIATE">Intermediate Gate</option>
                <option value="ASSEMBLY">Assembly Check</option>
                <option value="PRE_FG">Pre-FG Gate</option>
                <option value="FINAL_FG">Final FG Release Gate</option>
              </select>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search batch #, GRN, item code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9.5 text-xs rounded-xl shadow-2xs border-border bg-background focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 4. SPLIT MASTER-DETAIL INSPECTION WORKSPACE              */}
        {/* ======================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* Left Column: Queue Items List (5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Pending Inspection Queue ({filteredItems.length})
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">
                Click to inspect checkpoints
              </span>
            </div>

            {loading ? (
              <div className="rounded-3xl border border-border bg-card p-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                <span>Loading quality queue items...</span>
              </div>
            ) : error ? (
              <div className="rounded-3xl border border-border bg-card p-8 text-center text-xs text-destructive space-y-2">
                <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
                <p>{error}</p>
                <Button variant="outline" size="sm" onClick={loadQueue} className="text-xs">
                  Retry
                </Button>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-3xl border border-border bg-card p-12 text-center space-y-2.5">
                <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
                <h3 className="text-sm font-bold text-foreground">
                  No Pending Quality Gates
                </h3>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  All active manufacturing batches and receiving lines have satisfied quality criteria.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredItems.map((item) => {
                  const isSelected = activeItem?.targetId === item.targetId;
                  const isBatch = item.targetType === 'BATCH';

                  return (
                    <div
                      key={`${item.targetType}-${item.targetId}`}
                      onClick={() => handleSelectItem(item)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-2.5 ${
                        isSelected
                          ? 'border-primary bg-card shadow-xs ring-1 ring-primary/30'
                          : 'border-border bg-card hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-foreground">
                              {item.referenceNumber}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-md font-bold bg-muted text-foreground border border-border">
                              {isBatch ? 'BATCH' : 'GRN LINE'}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-foreground mt-0.5 line-clamp-1">
                            {item.itemDescription || 'Manufacturing Item'}
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="font-mono text-xs font-bold text-foreground block">
                            {item.quantity} units
                          </span>
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {item.departmentName || 'General Floor'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-border text-[11px]">
                        <span className="font-mono text-muted-foreground text-[10px]">
                          Checkpoint: {item.checkpointType}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                          <AlertTriangle className="w-3 h-3" />
                          <span>QC Gate Required</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Active Inspection Workspace & Checkpoints (7 cols) */}
          <div className="lg:col-span-7">
            {activeItem ? (
              <div className="rounded-3xl border border-border bg-card p-6 shadow-xs space-y-6">
                {/* Active Item Title Bar */}
                <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-black text-foreground">
                        {activeItem.referenceNumber}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-lg bg-primary/10 text-primary font-bold">
                        {activeItem.targetType === 'BATCH' ? 'Production Batch Gate' : 'GRN Inward Line Gate'}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-foreground mt-1">
                      {activeItem.itemDescription || 'Production Component'}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      Quantity: {activeItem.quantity} units · Department: {activeItem.departmentName || 'Shopfloor'}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-xl border border-primary/20">
                      <Clock className="w-3.5 h-3.5" />
                      Pending Inspection
                    </span>
                  </div>
                </div>

                {/* Checkpoint Resolution Body */}
                {isResolvingCheckpoints ? (
                  <div className="py-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                    <span>Resolving checkpoint rules &amp; checklist criteria...</span>
                  </div>
                ) : checkpointData ? (
                  <div className="space-y-4">
                    {/* Overall Checkpoint Status */}
                    {blockedCheckpoints.length > 0 && (
                      <BlockedCheckpointBanner
                        checkpointName={blockedCheckpoints[0]?.stageName || blockedCheckpoints[0]?.checkpointType}
                        missingReason={blockedCheckpoints[0]?.missingCriteriaReason}
                        ruleCode={blockedCheckpoints[0]?.qcRuleCode}
                        onConfigureClick={() => setShowRuleModal(true)}
                      />
                    )}

                    {/* Resolved Checkpoint Gates List */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Resolved Checkpoint Gates ({checkpointData.checkpoints.length})
                      </h3>

                      <div className="space-y-2.5">
                        {checkpointData.checkpoints.map((cp, idx) => {
                          const isBlocked = !cp.hasApprovedCriteria;

                          return (
                            <div
                              key={`${cp.checkpointType}-${idx}`}
                              className="p-4 rounded-2xl border border-border bg-muted/40 space-y-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-foreground">
                                      {cp.stageName || cp.checkpointType}
                                    </span>
                                    {cp.stageSequenceNumber && (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-mono font-bold">
                                        Stage {cp.stageSequenceNumber}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    {cp.qcRuleCode ? `Rule: ${cp.qcRuleCode}` : 'No active QC rule linked'}
                                  </p>
                                </div>

                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    isBlocked
                                      ? 'bg-muted text-foreground border-border'
                                      : 'bg-primary/10 text-primary border-primary/20'
                                  }`}
                                >
                                  {isBlocked ? 'Criteria Missing' : 'Ready for QC'}
                                </span>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
                                <span className="text-[11px] text-muted-foreground font-mono">
                                  Gate Type: {cp.checkpointType}
                                </span>

                                <div className="flex items-center gap-2">
                                  {isBlocked ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setShowOverrideModal(true)}
                                      className="h-9 px-3.5 text-xs font-semibold rounded-xl border border-border hover:bg-muted/80 transition-all cursor-pointer"
                                    >
                                      Manager Override
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      onClick={() => setShowInspectionModal(true)}
                                      className="h-9 px-4 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.99]"
                                    >
                                      <ShieldCheck className="w-4 h-4" />
                                      <span>Execute Inspection</span>
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-3xl border border-border bg-card p-16 text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                  <MousePointerClick className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Select a Queue Item
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                    Choose a manufacturing batch or receiving line from the queue to view resolved quality checkpoints and execute gate inspections.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* INSPECTION MODAL */}
      {showInspectionModal && activeItem && (
        <InspectionModal
          isOpen={showInspectionModal}
          onClose={() => setShowInspectionModal(false)}
          targetItem={activeItem}
          onSuccess={() => {
            setShowInspectionModal(false);
            loadQueue();
            if (activeItem) handleSelectItem(activeItem);
          }}
        />
      )}

      {/* OVERRIDE MODAL */}
      {showOverrideModal && activeItem && (
        <OverrideModal
          isOpen={showOverrideModal}
          onClose={() => setShowOverrideModal(false)}
          targetItem={activeItem}
          onSuccess={() => {
            setShowOverrideModal(false);
            loadQueue();
            if (activeItem) handleSelectItem(activeItem);
          }}
        />
      )}

      {/* QC RULE CONFIGURATION MODAL */}
      {showRuleModal && (
        <QcRuleModal
          isOpen={showRuleModal}
          onClose={() => setShowRuleModal(false)}
          onSuccess={() => {
            setShowRuleModal(false);
            loadQueue();
            if (activeItem) handleSelectItem(activeItem);
          }}
        />
      )}
    </main>
  );
}
