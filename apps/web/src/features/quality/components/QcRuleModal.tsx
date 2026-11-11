'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, Button } from '@plinth/ui';
import {
  ShieldCheck,
  Scale,
  Plus,
  Trash2,
  Sliders,
  Check,
  Search,
  FileCheck2,
  Percent,
  ChevronDown,
  ChevronUp,
  Layers,
  Wrench,
  AlertCircle
} from 'lucide-react';
import { qualityApi, CreateQcRulePayload, QcRuleItem } from '../api';
import { showToast } from '@/components/toast-store';

export interface QcCriterion {
  name: string;
  type: 'BOOLEAN' | 'NUMERIC' | 'VISUAL';
  required: boolean;
  severity?: 'CRITICAL' | 'MAJOR' | 'MINOR';
  nominalValue?: number | string;
  minTolerance?: number | string;
  maxTolerance?: number | string;
  unit?: string;
  inspectionMethod?: string;
}

interface QcRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  ruleToApprove?: QcRuleItem | null;
  initialTargetType?: string;
  initialTargetId?: string;
  initialName?: string;
  initialCode?: string;
  autoApproveOnCreate?: boolean;
  batchId?: string;
}

export const QcRuleModal: React.FC<QcRuleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  ruleToApprove,
  initialTargetType = 'DEPARTMENT',
  initialTargetId = '',
  initialName = '',
  initialCode = '',
  autoApproveOnCreate = true,
  batchId = ''
}) => {
  // Modal Mode: 'CHOOSE_EXISTING' vs 'CREATE_NEW'
  const [activeTab, setActiveTab] = useState<'CHOOSE_EXISTING' | 'CREATE_NEW'>('CHOOSE_EXISTING');

  // Existing Rules State
  const [existingRules, setExistingRules] = useState<QcRuleItem[]>([]);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [previewRuleId, setPreviewRuleId] = useState<string | null>(null);

  // New Rule Form State (Starts with empty criteria list)
  const [name, setName] = useState(initialName || '');
  const [description, setDescription] = useState('');
  const [autoApprove, setAutoApprove] = useState(autoApproveOnCreate);

  // Sampling & Passing thresholds
  const [minScore, setMinScore] = useState('95');
  const [samplingPercentage, setSamplingPercentage] = useState('100');
  const [failureAction, setFailureAction] = useState<'REWORK' | 'SCRAP' | 'QUARANTINE'>('REWORK');

  // Criteria Checklist State (EMPTY BY DEFAULT as requested)
  const [criteriaList, setCriteriaList] = useState<QcCriterion[]>([]);

  // New criteria draft state
  const [newCritName, setNewCritName] = useState('');
  const [newCritType, setNewCritType] = useState<'BOOLEAN' | 'NUMERIC' | 'VISUAL'>('NUMERIC');
  const [newCritRequired, setNewCritRequired] = useState(true);
  const [newCritSeverity, setNewCritSeverity] = useState<'CRITICAL' | 'MAJOR' | 'MINOR'>('MAJOR');
  const [newCritNominal, setNewCritNominal] = useState('');
  const [newCritMin, setNewCritMin] = useState('');
  const [newCritMax, setNewCritMax] = useState('');
  const [newCritUnit, setNewCritUnit] = useState('mm');
  const [newCritMethod, setNewCritMethod] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing approved rules on open
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setName(initialName || '');
      setDescription('');
      setAutoApprove(autoApproveOnCreate);
      setCriteriaList([]);
      setNewCritName('');
      setNewCritNominal('');
      setNewCritMin('');
      setNewCritMax('');
      setNewCritUnit('mm');
      setNewCritMethod('');
      setSelectedRuleId(null);
      setPreviewRuleId(null);
      setSearchQuery('');

      // Fetch approved QC rules
      const fetchRules = async () => {
        setIsLoadingExisting(true);
        try {
          const rules = await qualityApi.listRules({ status: 'APPROVED' });
          setExistingRules(rules || []);
          if (rules && rules.length > 0) {
            setActiveTab('CHOOSE_EXISTING');
            setSelectedRuleId(rules[0].id);
          } else {
            setActiveTab('CREATE_NEW');
          }
        } catch {
          setActiveTab('CREATE_NEW');
        } finally {
          setIsLoadingExisting(false);
        }
      };

      fetchRules();
    }
  }, [isOpen, initialName, autoApproveOnCreate]);

  // Filter existing rules based on search
  const filteredExistingRules = useMemo(() => {
    if (!searchQuery.trim()) return existingRules;
    const q = searchQuery.toLowerCase();
    return existingRules.filter((r) =>
      r.name?.toLowerCase().includes(q) ||
      r.code?.toLowerCase().includes(q) ||
      r.targetType?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q)
    );
  }, [existingRules, searchQuery]);

  if (!isOpen) return null;
  const isApproveMode = Boolean(ruleToApprove);

  // Add Criterion Handler
  const handleAddCriteria = () => {
    if (!newCritName.trim()) return;

    const criterion: QcCriterion = {
      name: newCritName.trim(),
      type: newCritType,
      required: newCritRequired,
      severity: newCritSeverity,
      inspectionMethod: newCritMethod.trim() || undefined
    };

    if (newCritType === 'NUMERIC') {
      criterion.nominalValue = newCritNominal.trim() || undefined;
      criterion.minTolerance = newCritMin.trim() || undefined;
      criterion.maxTolerance = newCritMax.trim() || undefined;
      criterion.unit = newCritUnit.trim() || 'mm';
    }

    setCriteriaList([...criteriaList, criterion]);

    // Reset draft fields
    setNewCritName('');
    setNewCritNominal('');
    setNewCritMin('');
    setNewCritMax('');
    setNewCritMethod('');
  };

  const handleRemoveCriteria = (index: number) => {
    setCriteriaList(criteriaList.filter((_, i) => i !== index));
  };

  // Submit Handler: Link Existing Rule
  const handleLinkExisting = async () => {
    if (!selectedRuleId) {
      setError('Please select an existing QC rule from the list.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (batchId) {
        await qualityApi.linkRuleToBatch(batchId, selectedRuleId);
      } else if (initialTargetId) {
        // Link to department if no direct batchId
        await qualityApi.approveRule(selectedRuleId);
      }

      const selectedRule = existingRules.find((r) => r.id === selectedRuleId);
      showToast({
        kind: 'success',
        title: 'QC Rule Applied',
        message: `Active rule '${selectedRule?.name || selectedRule?.code || 'QC Rule'}' linked to this workstation.`
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to link QC rule to workstation');
    } finally {
      setLoading(false);
    }
  };

  // Submit Handler: Create New Rule from Scratch
  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Quality Control Rule Name is mandatory.');
      return;
    }
    if (criteriaList.length === 0) {
      setError('Please add at least one quality inspection criterion to the checklist.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Auto-generate clean unique code under the hood
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase();
      const autoCode = initialCode
        ? `${initialCode.replace(/-[A-Z0-9]{4}$/, '')}-${randomSuffix}`
        : `QC-${sanitizedName || 'RULE'}-${randomSuffix}`;

      const parameters: Record<string, unknown> = {
        minPassingScore: Number(minScore) || 95,
        passingScoreThreshold: Number(minScore) || 95,
        samplingPercentage: Number(samplingPercentage) || 100,
        samplingRatePercentage: Number(samplingPercentage) || 100,
        defaultFailureAction: failureAction,
        criteriaChecklist: criteriaList,
        criteria: criteriaList,
      };

      const payload: CreateQcRulePayload = {
        code: autoCode,
        name: name.trim(),
        description: description.trim() || undefined,
        targetType: initialTargetType || 'DEPARTMENT',
        targetId: initialTargetId.trim() || undefined,
        parameters,
        effectiveFrom: new Date().toISOString()
      };

      const created = await qualityApi.createRule(payload);
      if (autoApprove && created?.id) {
        try {
          await qualityApi.approveRule(created.id);
        } catch (approvalErr) {
          console.warn('Auto approval warning:', approvalErr);
        }
      }

      if (batchId && created?.id) {
        try {
          await qualityApi.linkRuleToBatch(batchId, created.id);
        } catch (linkErr) {
          console.warn('Direct batch link warning:', linkErr);
        }
      }

      showToast({
        kind: 'success',
        title: 'QC Rule Created & Deployed',
        message: `Quality rule '${name}' is approved and active for this workstation.`
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create QC rule');
    } finally {
      setLoading(false);
    }
  };

  // Approve Existing Rule (Admin Review Mode)
  const handleApprove = async () => {
    if (!ruleToApprove) return;
    setLoading(true);
    try {
      await qualityApi.approveRule(ruleToApprove.id);
      showToast({
        kind: 'success',
        title: 'QC Rule Approved',
        message: `Rule ${ruleToApprove.code} is now active and enforcing quality gates.`
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to approve QC rule');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Configure Quality Control (QC) Rule"
      className="max-w-3xl max-h-[92vh] flex flex-col p-6 overflow-hidden rounded-2xl bg-card border border-border shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-border/80 pb-3 -mt-2">
        <p className="text-xs text-muted-foreground">
          Define production-grade inspection checklists, dimensional tolerances, and pass/fail thresholds.
        </p>
      </div>

      {/* Mode Switcher Tabs */}
      {!isApproveMode && (
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 border border-border rounded-xl mt-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('CHOOSE_EXISTING')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'CHOOSE_EXISTING'
                ? 'bg-card text-foreground shadow-xs border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-primary" />
            <span>Choose from Existing QC Rules ({existingRules.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('CREATE_NEW')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'CREATE_NEW'
                ? 'bg-card text-foreground shadow-xs border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
            <span>Create New QC Rule</span>
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3.5 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-xs flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: CHOOSE EXISTING QC RULE */}
      {!isApproveMode && activeTab === 'CHOOSE_EXISTING' && (
        <div className="flex-1 min-h-0 flex flex-col mt-4 overflow-hidden space-y-3">
          {/* Search Bar */}
          <div className="relative shrink-0">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search existing approved rules by name, code, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-3 text-xs bg-muted/30 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* List of Existing Rules */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1">
            {isLoadingExisting ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Loading available QC rules...
              </div>
            ) : filteredExistingRules.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-border rounded-2xl bg-muted/20 space-y-2">
                <FileCheck2 className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-xs font-bold text-foreground">No existing rules found</p>
                <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                  No approved QC rules match your search. Switch to &quot;Create New QC Rule&quot; to define criteria from scratch.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('CREATE_NEW')}
                  className="mt-2 text-xs font-bold"
                >
                  Create New Rule Now
                </Button>
              </div>
            ) : (
              filteredExistingRules.map((rule) => {
                const isSelected = selectedRuleId === rule.id;
                const criteria = ((rule.parameters as any)?.criteriaChecklist ||
                  (rule.parameters as any)?.criteria ||
                  []) as Array<any>;
                const isPreview = previewRuleId === rule.id;

                return (
                  <div
                    key={rule.id}
                    onClick={() => setSelectedRuleId(rule.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                        : 'border-border bg-card hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-foreground truncate">{rule.name}</span>
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-muted text-foreground border border-border font-bold">
                            {rule.code}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {rule.status}
                          </span>
                        </div>
                        {rule.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1">{rule.description}</p>
                        )}
                        <div className="flex items-center gap-3 pt-1 text-[11px] text-muted-foreground flex-wrap">
                          <span className="font-medium text-foreground">
                            {criteria.length} Criteria Point{criteria.length !== 1 ? 's' : ''}
                          </span>
                          <span>·</span>
                          <span>
                            Passing: <strong className="text-foreground">{(rule.parameters as any)?.minPassingScore ?? 95}%</strong>
                          </span>
                          <span>·</span>
                          <span>
                            Sampling: <strong className="text-foreground">{(rule.parameters as any)?.samplingPercentage ?? 100}%</strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewRuleId(isPreview ? null : rule.id);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <span>{isPreview ? 'Hide Criteria' : 'View Criteria'}</span>
                          {isPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                          isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    </div>

                    {/* Criteria Details Preview Accordion */}
                    {isPreview && (
                      <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                          Inspection Criteria Specification:
                        </span>
                        <div className="divide-y divide-border/40 rounded-lg border border-border/60 overflow-hidden bg-background">
                          {criteria.length === 0 ? (
                            <p className="p-3 text-[11px] text-muted-foreground italic">No specific criteria list defined.</p>
                          ) : (
                            criteria.map((c: any, cIdx: number) => (
                              <div key={cIdx} className="p-2.5 flex items-center justify-between text-[11px] gap-2">
                                <span className="font-medium text-foreground">
                                  {cIdx + 1}. {c.name}
                                </span>
                                <div className="flex items-center gap-2 font-mono text-[10px]">
                                  {c.type === 'NUMERIC' && c.nominalValue !== undefined && (
                                    <span className="text-muted-foreground">
                                      {c.nominalValue} {c.unit} ({c.minTolerance} to {c.maxTolerance})
                                    </span>
                                  )}
                                  <span className="px-1.5 py-0.5 rounded bg-muted text-foreground border border-border">
                                    {c.type}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Sticky Footer for Existing Rule Selection */}
          <div className="pt-4 border-t border-border flex items-center justify-end gap-3 shrink-0 bg-card">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="h-10 px-5 text-xs font-semibold rounded-xl border border-border hover:bg-muted/80 transition-all cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleLinkExisting}
              disabled={loading || !selectedRuleId}
              className="h-10 px-6 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm flex items-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Applying Rule...' : 'Apply & Link Selected Rule'}</span>
            </Button>
          </div>
        </div>
      )}

      {/* TAB 2: CREATE NEW QC RULE (From Scratch) */}
      {!isApproveMode && activeTab === 'CREATE_NEW' && (
        <form onSubmit={handleCreateNew} className="flex-1 min-h-0 flex flex-col mt-4 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
            {/* Rule Header Information */}
            <div className="p-4 rounded-2xl border border-border bg-muted/20 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-primary" />
                  <span>Quality Control Rule Name <span className="text-destructive">*</span></span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cutting & Stamping In-Process Inspection Gate"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full h-10 px-3.5 text-xs bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">
                  Inspection Scope &amp; Operating Procedure Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dimensional verification, burr checks, and cosmetic specs before downstream handover"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full h-10 px-3.5 text-xs bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* Criteria Checklist & Builder */}
            <div className="p-4 rounded-2xl border border-border bg-card space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-foreground flex items-center gap-2">
                    <FileCheck2 className="w-4 h-4 text-primary" />
                    <span>Configured Quality Criteria Checklist ({criteriaList.length})</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Define the measurable physical dimensions, tolerances, or visual quality checks.
                  </span>
                </div>
              </div>

              {/* Configured Criteria Rows */}
              {criteriaList.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-border rounded-xl bg-muted/10 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">No inspection criteria added yet</p>
                  <p className="text-[11px]">Use the production-grade criteria builder below to add your first check point.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/60 rounded-xl border border-border overflow-hidden bg-background">
                  {criteriaList.map((crit, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-muted/15 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary font-mono font-bold text-[11px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <span className="font-bold text-foreground block truncate">{crit.name}</span>
                          {crit.type === 'NUMERIC' && crit.nominalValue !== undefined && (
                            <span className="text-[11px] font-mono text-muted-foreground block">
                              Nominal: <strong className="text-foreground">{crit.nominalValue} {crit.unit}</strong> (Tolerance: {crit.minTolerance} to {crit.maxTolerance} {crit.unit})
                            </span>
                          )}
                          {crit.inspectionMethod && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Wrench className="w-3 h-3 text-primary" />
                              <span>Tool: {crit.inspectionMethod}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-muted text-foreground border border-border">
                          {crit.type}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          crit.severity === 'CRITICAL'
                            ? 'bg-destructive/10 text-destructive border border-destructive/20'
                            : crit.severity === 'MAJOR'
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : 'bg-muted text-muted-foreground border border-border'
                        }`}>
                          {crit.severity || 'MAJOR'}
                        </span>
                        {crit.required && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Required
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveCriteria(idx)}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer"
                          title="Remove Criterion"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Criterion Builder Card */}
              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                <span className="text-xs font-bold text-foreground block">
                  Add Criterion Specification:
                </span>

                {/* Criterion Name & Type */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-muted-foreground block">
                      Criterion / Feature Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sheet Plate Thickness, Kerf Cut Dimension, Burr Free Edge"
                      value={newCritName}
                      onChange={(e) => setNewCritName(e.target.value)}
                      className="w-full h-9 px-3 text-xs bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted-foreground block">
                      Inspection Type
                    </label>
                    <select
                      value={newCritType}
                      onChange={(e) => setNewCritType(e.target.value as any)}
                      className="w-full h-9 px-3 text-xs bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="NUMERIC">Measurement (Numeric)</option>
                      <option value="VISUAL">Visual / Cosmetic Audit</option>
                      <option value="BOOLEAN">Pass / Fail Attribute Check</option>
                    </select>
                  </div>
                </div>

                {/* Numeric Tolerances Row (if NUMERIC) */}
                {newCritType === 'NUMERIC' && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-muted-foreground block">Nominal Value</label>
                      <input
                        type="text"
                        placeholder="e.g. 10.0"
                        value={newCritNominal}
                        onChange={(e) => setNewCritNominal(e.target.value)}
                        className="w-full h-9 px-3 text-xs font-mono bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-muted-foreground block">Min Tolerance</label>
                      <input
                        type="text"
                        placeholder="e.g. -0.1 or 9.9"
                        value={newCritMin}
                        onChange={(e) => setNewCritMin(e.target.value)}
                        className="w-full h-9 px-3 text-xs font-mono bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-muted-foreground block">Max Tolerance</label>
                      <input
                        type="text"
                        placeholder="e.g. +0.1 or 10.1"
                        value={newCritMax}
                        onChange={(e) => setNewCritMax(e.target.value)}
                        className="w-full h-9 px-3 text-xs font-mono bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-muted-foreground block">Unit</label>
                      <input
                        type="text"
                        placeholder="mm, kg, bar"
                        value={newCritUnit}
                        onChange={(e) => setNewCritUnit(e.target.value)}
                        className="w-full h-9 px-3 text-xs font-mono bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                )}

                {/* Inspection Tool & Severity */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-muted-foreground block">
                      Inspection Tool / Instrument / Method
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Digital Vernier Caliper, 1000 Lux Light, Go/No-Go Gauge"
                      value={newCritMethod}
                      onChange={(e) => setNewCritMethod(e.target.value)}
                      className="w-full h-9 px-3 text-xs bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-muted-foreground block">
                      Defect Severity
                    </label>
                    <select
                      value={newCritSeverity}
                      onChange={(e) => setNewCritSeverity(e.target.value as any)}
                      className="w-full h-9 px-3 text-xs bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="CRITICAL">Critical (Hard Stop / Scrap)</option>
                      <option value="MAJOR">Major (Rework Required)</option>
                      <option value="MINOR">Minor (Acceptable Deviation)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground font-medium">
                    <input
                      type="checkbox"
                      checked={newCritRequired}
                      onChange={(e) => setNewCritRequired(e.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
                    />
                    <span>Mandatory Check (Must pass before gate clearance)</span>
                  </label>

                  <Button
                    type="button"
                    onClick={handleAddCriteria}
                    disabled={!newCritName.trim()}
                    className="h-9 px-4 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Quality Criterion</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Thresholds & Governance */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 block">
                  <Percent className="w-3.5 h-3.5 text-primary" />
                  <span>Passing Score Threshold</span>
                </label>
                <select
                  value={minScore}
                  onChange={(e) => setMinScore(e.target.value)}
                  className="w-full h-10 px-3 text-xs bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="100">100% (Zero Defect Acceptance)</option>
                  <option value="95">95% (Production Standard)</option>
                  <option value="90">90% (Standard Manufacturing)</option>
                  <option value="80">80% (Permissive Gate)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 block">
                  <Sliders className="w-3.5 h-3.5 text-primary" />
                  <span>Sampling Percentage</span>
                </label>
                <select
                  value={samplingPercentage}
                  onChange={(e) => setSamplingPercentage(e.target.value)}
                  className="w-full h-10 px-3 text-xs bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="100">100% (Every Part Sampled)</option>
                  <option value="50">50% (Tightened Inspection)</option>
                  <option value="20">20% (AQL Normal)</option>
                  <option value="10">10% (Reduced Sampling)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 block">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  <span>Action on Failure</span>
                </label>
                <select
                  value={failureAction}
                  onChange={(e) => setFailureAction(e.target.value as any)}
                  className="w-full h-10 px-3 text-xs bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="REWORK">Loop Back to Rework</option>
                  <option value="SCRAP">Route to Scrap &amp; Loss</option>
                  <option value="QUARANTINE">Quarantine Hold</option>
                </select>
              </div>
            </div>

            {/* Auto-Approve & Activate Rule Banner */}
            <div className="p-4 rounded-2xl border border-border bg-muted/20 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-foreground block">Auto-Approve &amp; Activate Rule</span>
                <span className="text-[11px] text-muted-foreground block">
                  Activate immediately so shop floor execution gates and assembly satisfy invariant V-009.
                </span>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={autoApprove}
                  onChange={(e) => setAutoApprove(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
                />
                <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${
                  autoApprove
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-muted text-muted-foreground border-border'
                }`}>
                  {autoApprove ? 'ACTIVE' : 'DRAFT'}
                </span>
              </label>
            </div>
          </div>

          {/* Sticky Action Footer */}
          <div className="pt-4 mt-2 border-t border-border flex items-center justify-end gap-3 shrink-0 bg-card">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="h-10 px-5 text-xs font-semibold rounded-xl border border-border hover:bg-muted/80 transition-all cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim() || criteriaList.length === 0}
              className="h-10 px-6 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm flex items-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{loading ? 'Saving Rule...' : 'Save & Deploy QC Rule'}</span>
            </Button>
          </div>
        </form>
      )}

      {/* APPROVE EXISTING RULE MODE (Admin Direct Review) */}
      {isApproveMode && ruleToApprove && (
        <div className="flex-1 min-h-0 flex flex-col mt-4 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
            <div className="p-4 rounded-2xl border border-border bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">{ruleToApprove.name}</h3>
                <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                  {ruleToApprove.code}
                </span>
              </div>
              {ruleToApprove.description && (
                <p className="text-xs text-muted-foreground">{ruleToApprove.description}</p>
              )}
            </div>

            <div className="p-4 rounded-2xl border border-border bg-card space-y-3">
              <span className="text-xs font-bold text-foreground block">Configured Inspection Checklist:</span>
              <div className="divide-y divide-border/60 rounded-xl border border-border overflow-hidden">
                {(((ruleToApprove.parameters as any)?.criteriaChecklist ||
                  (ruleToApprove.parameters as any)?.criteria ||
                  []) as Array<any>).map((c, i) => (
                  <div key={i} className="p-3 flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{i + 1}. {c.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{c.type}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-4 mt-2 border-t border-border flex items-center justify-end gap-3 shrink-0 bg-card">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="h-10 px-5 text-xs font-semibold rounded-xl border border-border hover:bg-muted/80 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApprove}
              disabled={loading || ruleToApprove.status === 'APPROVED'}
              className="h-10 px-6 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Activating...' : 'Approve & Activate Rule'}</span>
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
};
