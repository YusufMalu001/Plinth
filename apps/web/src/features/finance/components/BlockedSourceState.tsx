'use client';

import React from 'react';
import { Card, Button } from '@plinth/ui';
import { Lock, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface BlockedSourceStateProps {
  sourceType: string;
  displayName?: string;
  blockedReason?: string;
  dependentModules?: string[];
  validationItems?: string[];
  actionLink?: {
    href: string;
    label: string;
  };
}

export function BlockedSourceState({
  sourceType,
  displayName,
  blockedReason,
  dependentModules = [],
  validationItems = [],
  actionLink = {
    href: '/finance',
    label: 'View Integration Readiness Matrix',
  },
}: BlockedSourceStateProps) {
  const name = displayName || sourceType.replace(/_/g, ' ');

  return (
    <Card className="rounded-2xl border border-tone-amber-solid/30 bg-tone-amber-bg/5 p-8 shadow-xs">
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tone-amber-bg/20 text-tone-amber-text ">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-tone-amber-bg/20 text-tone-amber-text  px-2 py-0.5 rounded">
                NOT YET SUPPORTED
              </span>
              <span className="font-mono text-xs text-muted-foreground">{sourceType}</span>
            </div>
            <h3 className="text-base font-bold text-foreground mt-0.5">
              {name} Integration is Unavailable
            </h3>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {blockedReason ||
            `${name} export is not available in this pass. Zero approved mapping rules exist and the eligibility check explicitly blocks queueing pending upstream module implementation and business validation.`}
        </p>

        {(dependentModules.length > 0 || validationItems.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {dependentModules.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Blocked On Modules
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {dependentModules.map((mod) => (
                    <span
                      key={mod}
                      className="font-mono text-[11px] font-semibold bg-muted px-2 py-0.5 rounded text-foreground"
                    >
                      {mod}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {validationItems.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Pending Validations
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {validationItems.map((v) => (
                    <span
                      key={v}
                      className="font-mono text-[11px] font-semibold bg-tone-amber-bg/10 border border-tone-amber-solid/20 text-tone-amber-text  px-2 py-0.5 rounded"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pt-2 flex items-center gap-3">
          <Link href={actionLink.href}>
            <Button size="sm" variant="outline" className="gap-2 text-xs font-semibold">
              {actionLink.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <span className="text-[11px] text-muted-foreground">
            Finance export path remains blocked by governance policy.
          </span>
        </div>
      </div>
    </Card>
  );
}
