'use client';

import React from 'react';
import { useIntegrationReadiness } from '@/features/finance/hooks';
import { Card, Badge, Button } from '@plinth/ui';
import { FinanceNavigationTabs } from '@/features/finance/components/FinanceNavigationTabs';
import {
  CheckCircle2,
  Lock,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

export default function FinanceReadinessPage() {
  const { data: readiness, isLoading, error, refetch, isFetching } = useIntegrationReadiness();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] font-extrabold uppercase tracking-wider bg-primary/10 text-primary px-2.5 py-0.5 rounded-md">
              Module 18 · Accounts & Ledger Handoff
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">
              Adapter: Batch File Export (Stub)
            </Badge>
          </div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight font-sans">
            Integration Readiness Matrix
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Real-time status of ERP transaction sources eligible for export to Tally. Out of scope sources and unvalidated transactions are strictly gated by governance rules.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 text-xs font-semibold self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh Status
        </Button>
      </div>

      <FinanceNavigationTabs />

      {/* Scope Disclaimer Callout */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
          <p className="text-xs text-foreground leading-relaxed">
            <strong>Pass Scope Boundary:</strong> Only <strong>Purchase Orders</strong> carry approved accounting mappings. Real Tally API connector is replaced with a batch file export adapter pending V-006 / V-007.
          </p>
        </div>
        <Link href="/finance/queue">
          <Button size="sm" className="gap-2 text-xs font-semibold shrink-0">
            Open Eligible PO Queue
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      {/* Matrix Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="p-6 rounded-2xl animate-pulse bg-muted/40 h-44" />
          ))}
        </div>
      ) : error ? (
        <Card className="p-8 rounded-2xl border-destructive/30 bg-destructive/5 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <h3 className="text-sm font-bold text-foreground">Failed to load readiness status</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            {error instanceof Error ? error.message : 'Unknown network error'}
          </p>
          <Button size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {readiness?.map((source) => {
            const isActive = source.isSupported && source.status === 'ACTIVE';

            return (
              <Card
                key={source.sourceType}
                className={`rounded-2xl p-6 transition-all border ${
                  isActive
                    ? 'border-tone-green-solid/25 bg-tone-green-bg shadow-xs'
                    : 'border-tone-amber-solid/25 bg-tone-amber-bg'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        isActive
                          ? 'bg-tone-green-bg text-tone-green-text'
                          : 'bg-tone-amber-bg text-tone-amber-text'
                      }`}
                    >
                      {isActive ? <CheckCircle2 className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground font-sans">
                        {source.displayName}
                      </h3>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {source.sourceType}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                      isActive
                        ? 'bg-tone-green-bg text-tone-green-text'
                        : 'bg-tone-amber-bg text-tone-amber-text'
                    }`}
                  >
                    {isActive ? 'Active / Ready' : 'NOT YET SUPPORTED'}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground mb-4 min-h-[36px] leading-relaxed">
                  {isActive
                    ? `Ready for batch export. Active mapping configuration (v${source.activeMappingVersion}.0) approved and verified.`
                    : source.blockedReason ||
                      'Source type is structurally registered but blocked pending upstream module implementation and validation.'}
                </p>

                {/* Meta details */}
                <div className="space-y-2 pt-3 border-t border-border/60">
                  {isActive ? (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Mapping Version:</span>
                      <span className="font-mono font-bold text-foreground">
                        v{source.activeMappingVersion}.0 (Approved)
                      </span>
                    </div>
                  ) : (
                    <>
                      {source.dependentModules && source.dependentModules.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-muted-foreground text-[11px]">Blocked On:</span>
                          {source.dependentModules.map((m) => (
                            <span
                              key={m}
                              className="font-mono text-[10px] bg-muted px-1.5 py-0.2 rounded text-foreground font-semibold"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                      {source.validationItems && source.validationItems.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-muted-foreground text-[11px]">Pending Items:</span>
                          {source.validationItems.map((v) => (
                            <span
                              key={v}
                              className="font-mono text-[10px] bg-tone-amber-bg border border-tone-amber-solid/25 text-tone-amber-text px-1.5 py-0.2 rounded font-semibold"
                            >
                              {v}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="mt-4 pt-3 flex items-center justify-between">
                  {isActive ? (
                    <Link href="/finance/queue" className="w-full">
                      <Button size="sm" className="w-full gap-2 text-xs font-semibold">
                        View Eligible POs
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  ) : (
                    <Link
                      href={`/finance/mappings?sourceType=${source.sourceType}`}
                      className="w-full"
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs text-muted-foreground font-semibold"
                      >
                        Inspect Mapping Rules
                      </Button>
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
