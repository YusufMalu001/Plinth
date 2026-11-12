'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Calendar,
  Layers,
  ClipboardList,
  BarChart3,
  ChevronRight,
  Clock
} from 'lucide-react';
import { qualityApi, QcRuleItem } from '@/features/quality/api';
import { QcRuleModal } from '@/features/quality/components/QcRuleModal';

export default function QcRuleDetailsPage() {
  const params = useParams();
  const id = params?.id as string;

  const [rule, setRule] = useState<QcRuleItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'checklist' | 'governance' | 'scope'>('checklist');

  const fetchRule = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await qualityApi.getRuleById(id);
      setRule(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load QC rule details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRule();
  }, [fetchRule]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-8 text-center space-y-3">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-accent border-primary border-t-transparent" />
        <p className="text-sm text-ink-muted font-medium">Loading quality rule configuration...</p>
      </div>
    );
  }

  if (error || !rule) {
    return (
      <div className="max-w-4xl mx-auto p-8 space-y-4 text-center">
        <div className="p-6 rounded-xl bg-tone-red-solid border border-tone-red-solid/25 text-tone-red-text text-sm max-w-md mx-auto">
          {error || 'Quality Inspection Rule not found.'}
        </div>
        <Link
          href="/quality/rules"
          className="inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to QC Rules Registry
        </Link>
      </div>
    );
  }

  const isApproved = rule.status === 'APPROVED';
  const rawParams = (rule.parameters || {}) as Record<string, unknown>;
  const minScore = typeof rawParams.minPassingScore === 'number' ? rawParams.minPassingScore : 95;
  const samplingPct = typeof rawParams.samplingPercentage === 'number' ? rawParams.samplingPercentage : 100;
  const checklist = Array.isArray(rawParams.criteriaChecklist)
    ? (rawParams.criteriaChecklist as Array<{ name?: string; required?: boolean; type?: string }>)
    : [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 font-sans">
      {/* Breadcrumb & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
          <Link href="/quality" className="hover:text-foreground transition-colors">
            Quality &amp; Inspection
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/quality/rules" className="hover:text-foreground transition-colors">
            QC Rules Registry
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="font-mono font-bold text-foreground">{rule.code}</span>
        </div>

        <Link
          href="/quality/rules"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-foreground bg-card hover:bg-muted border border-border rounded-lg shadow-2xs transition-colors self-start sm:self-auto cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Rules List
        </Link>
      </div>

      {/* Main Header Banner */}
      <div className="bg-card p-6 rounded-2xl border border-border shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono font-bold text-xs bg-muted text-foreground px-2.5 py-1 rounded-md border border-border">
              {rule.code}
            </span>
            <span className="text-xs text-muted-foreground font-medium">Version {rule.version || 1}</span>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                isApproved
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}
            >
              {isApproved ? <CheckCircle2 className="w-3 h-3 text-primary" /> : <Clock className="w-3 h-3 text-muted-foreground" />}
              {rule.status}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-muted text-muted-foreground border border-border">
              {rule.targetType} SCOPE
            </span>
          </div>

          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {rule.name}
          </h1>

          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
            {rule.description || 'Configured quality criteria checklist, passing thresholds, and sampling rules for gate validation.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {!isApproved && (
            <button
              type="button"
              onClick={() => setShowApproveModal(true)}
              className="px-4 py-2 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve &amp; Activate Rule
            </button>
          )}

          <Link
            href="/quality"
            className="px-4 py-2 text-xs font-semibold text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border border-border"
          >
            <ShieldCheck className="w-4 h-4 text-primary" />
            Inspection Queue
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Target Scope */}
        <div className="bg-card p-4.5 rounded-2xl border border-border shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-bold uppercase tracking-wider">Applicable Scope</span>
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl font-extrabold text-foreground tracking-tight">
            {rule.targetType === 'PRODUCT'
              ? 'Finished Goods'
              : rule.targetType === 'GRN_LINE'
              ? 'Goods Receiving'
              : rule.targetType === 'WORK_CENTER'
              ? 'Work Center'
              : rule.targetType}
          </p>
          <span className="text-[10px] text-muted-foreground block">
            Enforces V-009 Gate for {rule.targetType}
          </span>
        </div>

        {/* Card 2: Passing Score */}
        <div className="bg-card p-4.5 rounded-2xl border border-border shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-bold uppercase tracking-wider">Passing Score</span>
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <BarChart3 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl font-extrabold text-foreground tracking-tight">{minScore}% Min Score</p>
          <span className="text-[10px] text-muted-foreground block">Threshold required to approve lot</span>
        </div>

        {/* Card 3: Sampling Percentage */}
        <div className="bg-card p-4.5 rounded-2xl border border-border shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-bold uppercase tracking-wider">Sampling Rate</span>
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <ClipboardList className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl font-extrabold text-foreground tracking-tight">{samplingPct}% of Lots</p>
          <span className="text-[10px] text-muted-foreground block">Sampling frequency per inspection</span>
        </div>

        {/* Card 4: Effective Dating */}
        <div className="bg-card p-4.5 rounded-2xl border border-border shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-bold uppercase tracking-wider">Effective From</span>
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Calendar className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl font-extrabold text-foreground tracking-tight">
            {new Date(rule.effectiveFrom).toLocaleDateString()}
          </p>
          <span className="text-[10px] text-muted-foreground block">
            {rule.effectiveTo ? `Until ${new Date(rule.effectiveTo).toLocaleDateString()}` : 'No expiration date'}
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-border-strong border-border flex items-center gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('checklist')}
          className={`pb-3 text-xs font-bold flex items-center gap-2 border-border-strong-2 transition-all cursor-pointer ${
            activeTab === 'checklist'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Inspection Checklist &amp; Criteria ({checklist.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('governance')}
          className={`pb-3 text-xs font-bold flex items-center gap-2 border-border-strong-2 transition-all cursor-pointer ${
            activeTab === 'governance'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="w-4 h-4" />
          Governance &amp; Lifecycle
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('scope')}
          className={`pb-3 text-xs font-bold flex items-center gap-2 border-border-strong-2 transition-all cursor-pointer ${
            activeTab === 'scope'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Gate Enforcement (V-009)
        </button>
      </div>

      {/* Tab 1: Checklist & Standards */}
      {activeTab === 'checklist' && (
        <div className="bg-card rounded-2xl border border-border shadow-2xs overflow-hidden">
          <div className="p-4 bg-muted/40 border-border-strong border-border flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Configured Inspection Criteria Checklist
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Inspectors evaluate each of these individual checkpoints during batch or GRN verification.
              </p>
            </div>
            <span className="text-xs font-bold text-foreground bg-muted px-2.5 py-1 rounded-md border border-border">
              {checklist.length} Parameters Total
            </span>
          </div>

          <div className="divide-y divide-border">
            {checklist.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No specific checklist items defined. General visual pass/fail will be enforced.
              </div>
            ) : (
              checklist.map((item, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between gap-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-xs shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">
                        {item.name || `Check Item #${idx + 1}`}
                      </h4>
                      <span className="text-[11px] text-muted-foreground font-medium">
                        Standard verification criterion
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2.5 py-1 rounded text-xs font-semibold bg-muted text-foreground border border-border">
                      {item.type === 'BOOLEAN' ? 'Pass / Fail' : item.type === 'NUMERIC' ? 'Measurement / Tolerance' : item.type || 'Standard'}
                    </span>
                    {item.required ? (
                      <span className="px-2.5 py-1 rounded text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                        MANDATORY
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded text-xs font-medium bg-muted text-muted-foreground border border-border">
                        OPTIONAL
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Governance & Lifecycle */}
      {activeTab === 'governance' && (
        <div className="bg-card rounded-2xl border border-border shadow-2xs p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Rule Lifecycle &amp; Effective Dating
              </h3>
              <div className="bg-muted/30 rounded-xl p-4 border border-border space-y-3 text-xs">
                <div className="flex justify-between py-1 border-border-strong border-border">
                  <span className="text-muted-foreground font-medium">Version</span>
                  <span className="font-bold text-foreground">v{rule.version || 1}</span>
                </div>
                <div className="flex justify-between py-1 border-border-strong border-border">
                  <span className="text-muted-foreground font-medium">Status</span>
                  <span className="font-bold text-foreground">{rule.status}</span>
                </div>
                <div className="flex justify-between py-1 border-border-strong border-border">
                  <span className="text-muted-foreground font-medium">Effective Start Date</span>
                  <span className="font-bold text-foreground">{new Date(rule.effectiveFrom).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground font-medium">Created On</span>
                  <span className="font-bold text-foreground">{new Date(rule.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Segregation of Duties &amp; Governance
              </h3>
              <div className="bg-muted/30 rounded-xl p-4 border border-border text-xs text-muted-foreground space-y-2.5">
                <p>
                  <strong className="text-foreground">Approval Rule:</strong> In accordance with factory segregation of duties, QC Rules authored in DRAFT status do not take effect on shop floors until formally approved by Quality Leadership.
                </p>
                <p>
                  <strong className="text-foreground">V-009 Gate Enforcement:</strong> Once approved, batches routed through associated checkpoints will dynamically unblock and become ready for inspection.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Gate Enforcement Scope */}
      {activeTab === 'scope' && (
        <div className="bg-card rounded-2xl border border-border shadow-2xs p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Automated Quality Gate Enforcement (V-009)
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This Quality Control Rule is registered under <strong className="text-foreground">{rule.targetType}</strong> scope. Any production batch or incoming GRN matching this scope will automatically evaluate against these parameters before release to downstream manufacturing or warehouse storage.
          </p>

          <div className="mt-4 p-4 rounded-xl bg-primary/10 border border-primary/20 text-xs text-foreground flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-foreground">Live Quality Gate Active</h4>
              <p className="text-muted-foreground mt-0.5">
                Inspectors recording results on the Inspection Queue will be required to verify all {checklist.length} configured checklist items and meet the {minScore}% passing threshold.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {showApproveModal && (
        <QcRuleModal
          isOpen={showApproveModal}
          onClose={() => setShowApproveModal(false)}
          onSuccess={() => {
            fetchRule();
          }}
          ruleToApprove={rule}
        />
      )}
    </div>
  );
}
