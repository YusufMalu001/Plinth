'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { InspectionResultDto, CorrectiveActionDto } from '@synergy/types';
import { qualityApi } from '@/features/quality/api';
import { QualityTimeline } from '@/features/quality/components/QualityTimeline';
import { CorrectiveActionModal } from '@/features/quality/components/CorrectiveActionModal';
import { Button, Input } from '@synergy/ui';
import {
  History,
  Search,
  RefreshCw,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  Clock,
  Layers,
  FileCheck2,
  AlertTriangle,
} from 'lucide-react';

export default function QualityHistoryPage() {
  const searchParams = useSearchParams();
  const initialTargetType = searchParams?.get('targetType') || 'BATCH';
  const initialTargetId = searchParams?.get('targetId') || '';

  const [targetType, setTargetType] = useState<'BATCH' | 'GRN_LINE'>(
    initialTargetType === 'GRN_LINE' ? 'GRN_LINE' : 'BATCH'
  );
  const [targetId, setTargetId] = useState(initialTargetId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<InspectionResultDto[]>([]);

  // Corrective action modal
  const [selectedActionToUpdate, setSelectedActionToUpdate] = useState<CorrectiveActionDto | null>(null);

  const fetchHistory = useCallback(async (type: 'BATCH' | 'GRN_LINE', id: string) => {
    if (!id.trim()) {
      setHistoryItems([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (type === 'BATCH') {
        const results = await qualityApi.getBatchHistory(id.trim());
        setHistoryItems(results);
      } else {
        const results = await qualityApi.getGrnLineHistory(id.trim());
        setHistoryItems(results);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch quality history');
      setHistoryItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialTargetId) {
      fetchHistory(targetType, initialTargetId);
    }
  }, [initialTargetId, targetType, fetchHistory]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchHistory(targetType, targetId);
  };

  return (
    <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8 font-sans">
      <div className="mx-auto max-w-[1680px] space-y-6">
        
        {/* ======================================================== */}
        {/* 1. STREAMLINED PAGE HEADER                               */}
        {/* ======================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
              <Link href="/quality" className="hover:text-primary transition-colors font-medium">
                Quality Assurance
              </Link>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-foreground font-semibold">Quality History & Traceability</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-2xs">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Batch Quality History &amp; Traceability
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Chronological inspection progression, failure dispositions, corrective actions, and reinspection loops.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/quality">
              <Button variant="outline" size="sm" className="h-9 px-3.5 text-xs font-semibold shadow-2xs gap-1.5 border-border">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Inspection Queue</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. TARGET LOOKUP FORM TOOLBAR                            */}
        {/* ======================================================== */}
        <form onSubmit={handleSearch} className="rounded-2xl border border-border bg-card p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Search Quality Records
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              Traceability Audit Trail
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="w-full sm:w-48">
              <select
                aria-label="Target lookup type"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as 'BATCH' | 'GRN_LINE')}
                className="w-full h-9 rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="BATCH">Production Batch</option>
                <option value="GRN_LINE">GRN Inward Line</option>
              </select>
            </div>

            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                type="text"
                required
                placeholder={targetType === 'BATCH' ? 'Enter Batch Number (e.g. BATCH-2026-0001) or UUID...' : 'Enter GRN Line UUID or Item Code...'}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="pl-8.5 h-9 text-xs rounded-xl border-input bg-background shadow-2xs font-mono"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !targetId.trim()}
              className="h-9 px-4 text-xs font-bold shadow-2xs shrink-0 gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{loading ? 'Searching...' : 'Load History'}</span>
            </Button>
          </div>
        </form>

        {/* ======================================================== */}
        {/* 3. MAIN HISTORY TIMELINE OR EMPTY PROMPT STATE           */}
        {/* ======================================================== */}
        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-16 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-3 shadow-2xs">
            <RefreshCw className="w-5 h-5 animate-spin text-primary" />
            <span>Retrieving quality inspection timeline &amp; audit history...</span>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center text-xs text-destructive space-y-2 shadow-2xs">
            <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
            <p className="font-semibold">{error}</p>
            <p className="text-muted-foreground">Verify the batch number or ID and try again.</p>
          </div>
        ) : historyItems.length > 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-2xs space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <FileCheck2 className="w-4.5 h-4.5 text-primary" />
                  <span>Quality Audit Trail for <span className="font-mono">{targetId}</span></span>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {historyItems.length} inspection events recorded across manufacturing checkpoints.
                </p>
              </div>

              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-xl bg-primary/10 text-primary border border-primary/20">
                Verified Traceability Log
              </span>
            </div>

            <QualityTimeline
              inspections={historyItems}
              onUpdateAction={(action) => setSelectedActionToUpdate(action)}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-16 text-center space-y-4 shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto border border-primary/20">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Enter a Target Reference to View History
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
                Inspect the chronological end-to-end quality events, evidence attachments, corrective actions, and stage transitions for any batch or inward receipt.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto pt-2 text-left">
              <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Gate Audits
                </span>
                <p className="text-xs font-semibold text-foreground">
                  Pass, Fail &amp; Override Records
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-primary" /> Dispositions
                </span>
                <p className="text-xs font-semibold text-foreground">
                  Rework, Scrap &amp; Deviation Sign-Off
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-primary" /> Reinspections
                </span>
                <p className="text-xs font-semibold text-foreground">
                  Post-rework Re-testing Cycles
                </p>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* CORRECTIVE ACTION MODAL */}
      {selectedActionToUpdate && (
        <CorrectiveActionModal
          isOpen={Boolean(selectedActionToUpdate)}
          onClose={() => setSelectedActionToUpdate(null)}
          action={selectedActionToUpdate}
          onSuccess={() => {
            setSelectedActionToUpdate(null);
            fetchHistory(targetType, targetId);
          }}
        />
      )}
    </main>
  );
}
