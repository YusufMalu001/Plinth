'use client';

import React, { useState } from 'react';
import {
  useMappingConfigurations,
  useCreateMappingConfiguration,
  useApproveMappingConfiguration,
  useIntegrationReadiness,
} from '@/features/finance/hooks';
import { Card, Button, Badge } from '@plinth/ui';
import { FinanceNavigationTabs } from '@/features/finance/components/FinanceNavigationTabs';
import { BlockedSourceState } from '@/features/finance/components/BlockedSourceState';
import { StatusBadge } from '@/components/StatusBadge';
import { useCurrentUser } from '@/features/auth/hooks';
import {
  Plus,
  Layers,
  CheckCircle2,
  Code2,
  Calendar,
  User,
  ShieldAlert,
} from 'lucide-react';
import { TransactionSourceType } from '@plinth/types';
import { useSearchParams } from 'next/navigation';

const SOURCE_TYPES: Array<{ key: TransactionSourceType; label: string }> = [
  { key: 'PURCHASE_ORDER', label: 'Purchase Orders' },
  { key: 'SALES_INVOICE', label: 'Sales Invoices' },
  { key: 'DEBIT_NOTE', label: 'Debit Notes' },
  { key: 'JOB_WORK', label: 'Job Work' },
  { key: 'RETURN', label: 'Returns & Refunds' },
  { key: 'INVENTORY_COGS', label: 'Inventory COGS' },
];

export default function FinanceMappingsPage() {
  const searchParams = useSearchParams();
  const initialSource = (searchParams.get('sourceType') as TransactionSourceType) || 'PURCHASE_ORDER';

  const [selectedSource, setSelectedSource] = useState<TransactionSourceType>(initialSource);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fieldMappingJson, setFieldMappingJson] = useState(
    JSON.stringify(
      {
        voucherType: 'Purchase',
        ledgerParty: 'vendor.name',
        ledgerAccount: 'Purchases Account',
        taxLedger: 'Input GST',
        roundOffLedger: 'Round Off',
      },
      null,
      2
    )
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [approveConfirmId, setApproveConfirmId] = useState<string | null>(null);

  const { data: user } = useCurrentUser();
  const { data: readiness } = useIntegrationReadiness();
  const { data: mappings, isLoading, refetch } = useMappingConfigurations({ sourceType: selectedSource });
  const createMutation = useCreateMappingConfiguration();
  const approveMutation = useApproveMappingConfiguration();

  const selectedReadiness = readiness?.find((r) => r.sourceType === selectedSource);
  const isSupported = selectedReadiness?.isSupported ?? (selectedSource === 'PURCHASE_ORDER');

  const handleCreateMapping = async () => {
    setCreateError(null);
    try {
      const parsedMapping = JSON.parse(fieldMappingJson);
      await createMutation.mutateAsync({
        sourceType: selectedSource,
        fieldMapping: parsedMapping,
        effectiveFrom: new Date().toISOString(),
      });
      setShowCreateModal(false);
      refetch();
    } catch (err: unknown) {
      setCreateError(err instanceof SyntaxError ? 'Invalid JSON field mapping syntax' : (err instanceof Error ? err.message : 'Error creating mapping'));
    }
  };

  const handleApprove = async (mappingId: string) => {
    try {
      await approveMutation.mutateAsync(mappingId);
      setApproveConfirmId(null);
      refetch();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] font-extrabold uppercase tracking-wider bg-primary/10 text-primary px-2.5 py-0.5 rounded-md">
              Mapping Rules Configuration
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">
              Segregation of Duties Enforced
            </Badge>
          </div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight font-sans">
            Tally Ledger & Voucher Mappings
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Configure versioned voucher layouts and ledger routing for supported ERP transaction aggregates. Creator-cannot-approve governance is enforced on all mapping approvals.
          </p>
        </div>

        {isSupported && (
          <Button
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="gap-2 text-xs font-semibold self-start sm:self-auto"
          >
            <Plus className="h-3.5 w-3.5" />
            New Mapping Version
          </Button>
        )}
      </div>

      <FinanceNavigationTabs />

      {/* Source Type Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-border-strong border-border/60">
        {SOURCE_TYPES.map((st) => {
          const isSelected = selectedSource === st.key;
          const rd = readiness?.find((r) => r.sourceType === st.key);
          const active = rd?.isSupported && rd?.status === 'ACTIVE';

          return (
            <button
              key={st.key}
              type="button"
              onClick={() => setSelectedSource(st.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold font-sans whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-foreground text-background shadow-xs'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span>{st.label}</span>
              {active ? (
                <span className="w-2 h-2 rounded-full bg-tone-green-solid" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-tone-amber-bg" />
              )}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {!isSupported ? (
        <BlockedSourceState
          sourceType={selectedSource}
          displayName={selectedReadiness?.displayName}
          blockedReason={selectedReadiness?.blockedReason || undefined}
          dependentModules={selectedReadiness?.dependentModules || []}
          validationItems={selectedReadiness?.validationItems || []}
        />
      ) : (
        <div className="space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Card key={i} className="p-6 rounded-2xl animate-pulse bg-muted/40 h-36" />
              ))}
            </div>
          ) : mappings?.length === 0 ? (
            <Card className="p-8 text-center rounded-2xl border-dashed">
              <Layers className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <h3 className="text-sm font-bold text-foreground">No mapping versions registered</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Establish an initial mapping configuration version for {selectedSource}.
              </p>
              <Button size="sm" onClick={() => setShowCreateModal(true)}>
                Create Initial Version
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {mappings?.map((mapConfig) => {
                const isApproved = mapConfig.status === 'APPROVED';
                const isCreator = user?.id === mapConfig.createdById;

                return (
                  <Card key={mapConfig.id} className="p-6 rounded-2xl border shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-border-strong border-border/60 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-mono font-extrabold text-xs">
                          v{mapConfig.version}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-foreground font-sans">
                              Version {mapConfig.version}.0 Mapping
                            </h3>
                            <StatusBadge status={mapConfig.status} />
                          </div>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            ID: {mapConfig.id}
                          </span>
                        </div>
                      </div>

                      {/* Approval Actions */}
                      <div className="flex items-center gap-2">
                        {!isApproved && (
                          <>
                            {approveConfirmId === mapConfig.id ? (
                              <div className="flex items-center gap-2 bg-muted/80 p-1.5 rounded-xl">
                                <span className="text-xs font-semibold text-foreground px-2">
                                  Confirm approval?
                                </span>
                                <Button
                                  size="sm"
                                  disabled={approveMutation.isPending || isCreator}
                                  onClick={() => handleApprove(mapConfig.id)}
                                  className="text-xs font-semibold bg-action hover:bg-[color:var(--action-primary-bg-hover)] text-inverse"
                                >
                                  {isCreator ? 'Creator Cannot Approve' : 'Confirm'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setApproveConfirmId(null)}
                                  className="text-xs"
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setApproveConfirmId(mapConfig.id)}
                                disabled={isCreator}
                                title={
                                  isCreator
                                    ? 'Segregation of duties: Creator cannot approve their own configuration'
                                    : 'Approve mapping version for active export'
                                }
                                className={`text-xs font-semibold gap-1.5 ${
                                  isCreator ? 'opacity-60 cursor-not-allowed' : 'text-tone-green-text hover:text-tone-green-text'
                                }`}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {isCreator ? 'Approval Restricted (Creator)' : 'Approve Version'}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Metadata & Governance */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User className="h-3.5 w-3.5" />
                        <span>
                          Created By: <strong className="text-foreground">{mapConfig.createdById}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>
                          Effective:{' '}
                          <strong className="text-foreground font-mono">
                            {new Date(mapConfig.effectiveFrom).toLocaleDateString('en-IN')}
                          </strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span>
                          Approver:{' '}
                          <strong className="text-foreground">
                            {mapConfig.approvedById || 'Pending'}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Field Mapping Structure */}
                    <div className="rounded-xl border border-border/80 bg-muted/40 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Structured Field Map Definition
                        </span>
                      </div>
                      <pre className="font-mono text-[11px] text-foreground overflow-x-auto p-2 bg-background/80 rounded-lg border border-border/40">
                        {JSON.stringify(mapConfig.fieldMapping, null, 2)}
                      </pre>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <Card className="w-full max-w-xl p-6 rounded-2xl shadow-popover border space-y-4 bg-card">
            <div className="flex items-center justify-between border-border-strong border-border/60 pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground font-sans">
                  Draft New Mapping Version
                </h3>
                <span className="font-mono text-xs text-muted-foreground">
                  Source Type: {selectedSource}
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowCreateModal(false)}>
                Close
              </Button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold">
                {createError}
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-foreground block mb-1">
                Field Mapping JSON Definition *
              </label>
              <textarea
                rows={9}
                value={fieldMappingJson}
                onChange={(e) => setFieldMappingJson(e.target.value)}
                className="w-full font-mono text-xs p-3 rounded-xl border border-input bg-background focus:ring-2 focus:ring-primary outline-hidden"
              />
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Mapping rules will be registered in DRAFT status and will require separate supervisor approval before activation.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/60">
              <Button size="sm" variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateMapping}
                disabled={createMutation.isPending}
                className="font-semibold text-xs"
              >
                {createMutation.isPending ? 'Saving Draft...' : 'Submit Draft Version'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
