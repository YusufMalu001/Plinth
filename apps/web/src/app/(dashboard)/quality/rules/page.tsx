'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { LifecycleStatus } from '@plinth/types';
import { qualityApi, QcRuleItem } from '@/features/quality/api';
import { QcRuleModal } from '@/features/quality/components/QcRuleModal';
import { StatusBadge } from '@/components/StatusBadge';
import { Button, Input } from '@plinth/ui';
import {
  Scale,
  Plus,
  Search,
  RefreshCw,
  ArrowLeft,
  ChevronRight,
  AlertTriangle,
  Layers,
  FileText,
  Clock,
  CheckCircle2,
} from 'lucide-react';

export default function QcRulesPage() {

  const [rules, setRules] = useState<QcRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal controls
  const [showModal, setShowModal] = useState(false);
  const [selectedRuleToApprove, setSelectedRuleToApprove] = useState<QcRuleItem | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: { targetType?: string; status?: LifecycleStatus } = {};
      if (statusFilter !== 'ALL') {
        filters.status = statusFilter as LifecycleStatus;
      }
      if (targetTypeFilter !== 'ALL') {
        filters.targetType = targetTypeFilter;
      }
      const data = await qualityApi.listRules(filters);
      setRules(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch QC rules');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, targetTypeFilter]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleOpenCreate = () => {
    setSelectedRuleToApprove(null);
    setShowModal(true);
  };

  const handleOpenApprove = (rule: QcRuleItem) => {
    setSelectedRuleToApprove(rule);
    setShowModal(true);
  };

  // Filter rules by search term
  const filteredRules = useMemo(() => {
    if (!searchTerm.trim()) return rules;
    const q = searchTerm.toLowerCase().trim();
    return rules.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.targetType.toLowerCase().includes(q) ||
        (r.targetId && r.targetId.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }, [rules, searchTerm]);

  // Derived stats
  const stats = useMemo(() => {
    const total = rules.length;
    const approved = rules.filter((r) => r.status === 'APPROVED').length;
    const draft = rules.filter((r) => r.status === 'DRAFT').length;
    const scopes = new Set(rules.map((r) => r.targetType)).size;
    return { total, approved, draft, scopes };
  }, [rules]);

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-6 lg:p-8 dark:bg-[#070b14]/70 font-manrope">
      <div className="mx-auto max-w-[1680px] space-y-5">
        
        {/* ======================================================== */}
        {/* 1. STREAMLINED PAGE HEADER & ACTIONS                     */}
        {/* ======================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Link href="/quality" className="hover:text-primary transition-colors font-medium">
                Quality Assurance
              </Link>
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-foreground font-semibold">QC Rules &amp; Criteria</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-2xs">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Quality Criteria &amp; QC Rules
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure checklists, tolerance limits, and formal approval lifecycle for production and receiving gates.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRules}
              className="h-9.5 px-3.5 text-xs font-semibold rounded-xl shadow-2xs hover:bg-muted/80 transition-all flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
              <span>Live Sync</span>
            </Button>

            <Link href="/quality">
              <Button
                variant="outline"
                size="sm"
                className="h-9.5 px-3.5 text-xs font-semibold rounded-xl shadow-2xs hover:bg-muted/80 transition-all flex items-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Inspection Queue</span>
              </Button>
            </Link>

            <Button
              size="sm"
              onClick={handleOpenCreate}
              className="h-9.5 px-4 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs hover:shadow transition-all flex items-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              <Plus className="w-4 h-4" />
              <span>Create QC Rule</span>
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
                Total QC Rules
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Scale className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {stats.total}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                configured
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Approved &amp; Active
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {stats.approved}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                live on floor
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Draft Pending Approval
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Clock className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {stats.draft}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                pending review
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Target Scopes Covered
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Layers className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
                {stats.scopes}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                gate scopes
              </span>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 3. SEARCH & FILTER TOOLBAR                               */}
        {/* ======================================================== */}
        <div className="rounded-2xl border border-border bg-card p-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search rule code, target scope, description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8.5 h-8.5 text-xs rounded-xl shadow-2xs"
                />
              </div>

              {/* Target Type Filter */}
              <select
                aria-label="Filter by target scope"
                value={targetTypeFilter}
                onChange={(e) => setTargetTypeFilter(e.target.value)}
                className="h-8.5 rounded-xl border border-input bg-background px-2.5 text-xs font-semibold text-foreground focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">All Target Scopes</option>
                <option value="PRODUCT">PRODUCT</option>
                <option value="GRN_LINE">GRN_LINE</option>
                <option value="WORK_CENTER">WORK_CENTER</option>
                <option value="GLOBAL">GLOBAL</option>
              </select>

              {/* Status Filter */}
              <select
                aria-label="Filter by lifecycle status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8.5 rounded-xl border border-input bg-background px-2.5 text-xs font-semibold text-foreground focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">All Lifecycle Statuses</option>
                <option value="APPROVED">APPROVED (Active for Gates)</option>
                <option value="DRAFT">DRAFT (Pending Approval)</option>
                <option value="OBSOLETE">OBSOLETE</option>
              </select>
            </div>

            <span className="text-xs font-mono font-semibold text-muted-foreground">
              {filteredRules.length} {filteredRules.length === 1 ? 'rule' : 'rules'} found
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 4. MAIN RULES TABLE                                      */}
        {/* ======================================================== */}
        <div className="rounded-3xl border border-border bg-card shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-16 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-primary" />
              <span>Loading inspection rules &amp; checklist criteria...</span>
            </div>
          ) : error ? (
            <div className="p-12 text-center text-xs text-destructive space-y-2">
              <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={fetchRules} className="text-xs">
                Retry
              </Button>
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  No QC Rules Configured
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                  Create an inspection rule and approve it to satisfy quality gate criteria across your manufacturing workflow.
                </p>
              </div>
              <div className="pt-2">
                <Button size="sm" onClick={handleOpenCreate} className="h-8.5 px-4 text-xs font-bold shadow-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Create First QC Rule
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-bold">Rule Code</th>
                    <th className="px-4 py-3 font-bold">Target Scope</th>
                    <th className="px-4 py-3 font-bold">Description</th>
                    <th className="px-4 py-3 font-bold">Version</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Checkpoints</th>
                    <th className="px-4 py-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-medium">
                  {filteredRules.map((rule) => {
                    const isDraft = rule.status === 'DRAFT';

                    return (
                      <tr key={rule.id} className="hover:bg-muted/40 transition-colors">
                        {/* 1. Rule Code */}
                        <td className="px-4 py-3.5">
                          <span className="font-mono font-bold text-foreground text-xs">
                            {rule.code}
                          </span>
                        </td>

                        {/* 2. Target Scope */}
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted text-foreground border border-border">
                            {rule.targetType}
                          </span>
                        </td>

                        {/* 3. Description */}
                        <td className="px-4 py-3.5 max-w-xs">
                          <p className="text-xs text-muted-foreground font-medium line-clamp-1">
                            {rule.description || 'Standard quality checklist definition'}
                          </p>
                        </td>

                        {/* 4. Version */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="font-mono text-xs text-muted-foreground font-bold">
                            v{rule.version}
                          </span>
                        </td>

                        {/* 5. Status */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <StatusBadge status={rule.status} />
                        </td>

                        {/* 6. Checkpoints */}
                        <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {Object.keys(rule.parameters || {}).length} criteria
                        </td>

                        {/* 7. Actions */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {isDraft ? (
                              <Button
                                size="sm"
                                onClick={() => handleOpenApprove(rule)}
                                className="h-7 px-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Approve
                              </Button>
                            ) : null}

                            <Link href={`/quality/rules/${rule.id}`}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2.5 text-xs font-semibold"
                              >
                                <span>Inspect</span>
                                <ChevronRight className="w-3 h-3 ml-0.5" />
                              </Button>
                            </Link>
                          </div>
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

      {/* QC RULE MODAL (CREATE / EDIT / APPROVE) */}
      {showModal && (
        <QcRuleModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          ruleToApprove={selectedRuleToApprove}
          onSuccess={() => {
            setShowModal(false);
            fetchRules();
          }}
        />
      )}
    </main>
  );
}
