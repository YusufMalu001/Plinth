'use client';

import React, { useMemo } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Boxes, Pencil, Workflow } from 'lucide-react';
import { Button, Card } from '@plinth/ui';
import { fetchApi } from '@/features/api/client';
import { StatusBadge } from '@/components/StatusBadge';

interface RouteDetailsData {
  id: string;
  code: string;
  name: string;
  status: string;
  version: number;
  effectiveFrom: string;
  product?: { id: string; name: string; sku?: string } | null;
  bomVersion?: {
    id: string;
    bomNumber?: string | null;
    version: number;
    lines: Array<{
      id: string;
      quantity: number | string;
      material?: { name: string } | null;
      componentProduct?: { name: string } | null;
      uom?: { symbol?: string | null; name?: string | null } | null;
    }>;
  } | null;
  assemblyDepartment?: { name: string } | null;
  steps: Array<{
    id: string;
    branchKey?: string | null;
    stepOrder?: number | null;
    sequenceNumber: number;
    stepName: string;
    department?: { name: string } | null;
    nextDepartmentId?: string | null;
    nextDepartment?: { name: string } | null;
    standardDurationMinutes?: number | null;
    isQcRequired: boolean;
    outputItemType?: string | null;
    outputItemId?: string | null;
    outputUomId?: string | null;
    outputQuantityPerUnit?: number | string | null;
  }>;
  materialAllocations: Array<{
    bomLineId: string;
    routeStepId: string | null;
    quantity: number | string;
  }>;
}

export function ProductionRouteDetails() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const routeId = String(params?.id || '');
  const routingBase = pathname.startsWith('/production/routing') ? '/production/routing' : '/inventory/routing';
  const { data: route, isLoading, error } = useQuery<RouteDetailsData>({
    queryKey: ['production-route-details', routeId],
    enabled: Boolean(routeId),
    queryFn: () => fetchApi(`/master-data/routing/routes/${routeId}`)
  });

  const stepsByBranch = useMemo(() => {
    const groups = new Map<string, RouteDetailsData['steps']>();
    (route?.steps || []).forEach((step) => {
      const key = step.branchKey || 'Route sequence';
      groups.set(key, [...(groups.get(key) || []), step]);
    });
    return [...groups.entries()].map(([key, steps]) => [
      key,
      [...steps].sort((a, b) => (a.stepOrder ?? a.sequenceNumber) - (b.stepOrder ?? b.sequenceNumber))
    ] as const);
  }, [route?.steps]);

  const bomLineRows = useMemo(() => {
    if (!route) return [];
    const stepsById = new Map(route.steps.map((step) => [step.id, step]));
    return (route.bomVersion?.lines || []).map((line) => {
      const allocations = route.materialAllocations
        .filter((allocation) => allocation.bomLineId === line.id)
        .map((allocation) => {
          const step = allocation.routeStepId ? stepsById.get(allocation.routeStepId) : null;
          const destination = step
            ? `${step.department?.name || step.stepName} · ${step.stepName}`
            : route.assemblyDepartment?.name || 'Assembly';
          return { destination, quantity: Number(allocation.quantity) };
        });
      return {
        id: line.id,
        name: line.material?.name || line.componentProduct?.name || 'BOM item',
        quantity: Number(line.quantity),
        uom: line.uom?.symbol || line.uom?.name || 'units',
        allocations
      };
    });
  }, [route]);

  if (isLoading) {
    return <div className="p-10 text-center text-sm text-muted-foreground">Loading route details…</div>;
  }
  if (error || !route) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Button type="button" variant="ghost" size="sm" icon={ArrowLeft} onClick={() => router.push(routingBase)}>
          Back to Production Routes
        </Button>
        <p className="mt-6 text-sm text-destructive">Could not load this production route.</p>
      </div>
    );
  }

  return (
    <main className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Button type="button" variant="ghost" size="sm" icon={ArrowLeft} onClick={() => router.push(routingBase)} className="mb-3 -ml-2">
              Production Routes
            </Button>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{route.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="font-mono text-foreground">{route.code}</span>
              <StatusBadge status={route.status as any} />
              {route.product?.name && <span className="inline-flex items-center gap-1.5"><Boxes className="h-4 w-4" />{route.product.name}</span>}
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" icon={Pencil} onClick={() => router.push(`${routingBase}/${route.id}`)}>
            Edit route
          </Button>
        </div>

        <Card className="grid gap-5 border-border p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div><div className="text-xs font-medium text-muted-foreground">Product</div><div className="mt-1 text-sm font-semibold">{route.product?.name || '—'}</div></div>
          <div><div className="text-xs font-medium text-muted-foreground">BOM specification</div><div className="mt-1 text-sm font-semibold">{route.bomVersion?.bomNumber || 'BOM'} · v{route.bomVersion?.version ?? '—'}</div></div>
          <div><div className="text-xs font-medium text-muted-foreground">Assembly department</div><div className="mt-1 text-sm font-semibold">{route.assemblyDepartment?.name || '—'}</div></div>
          <div><div className="text-xs font-medium text-muted-foreground">Effective from</div><div className="mt-1 text-sm font-semibold">{route.effectiveFrom ? new Date(route.effectiveFrom).toLocaleDateString() : '—'}</div></div>
        </Card>

        <section className="space-y-3" aria-labelledby="route-sequence-heading">
          <div className="flex items-center gap-2"><Workflow className="h-4 w-4 text-primary" /><h2 id="route-sequence-heading" className="text-base font-semibold">Department execution sequence</h2></div>
          {stepsByBranch.length ? stepsByBranch.map(([branch, steps]) => (
            <Card key={branch} className="border-border p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">{branch}</h3>
              <ol className="space-y-0">
                {steps.map((step, index) => {
                  const nextDept = step.nextDepartment?.name || steps[index + 1]?.department?.name || route.assemblyDepartment?.name || 'Assembly Department';
                  return (
                    <li key={step.id} className="relative flex gap-4 pb-5 last:pb-0">
                      {index < steps.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-border" />}
                      <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-foreground">{index + 1}</span>
                      <div className="min-w-0 flex-1 border-b border-border/70 pb-4 last:border-0 last:pb-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold">{step.department?.name || step.stepName}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">{step.stepName}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {step.standardDurationMinutes != null && <span>{step.standardDurationMinutes} min</span>}
                            {step.isQcRequired && <span className="font-medium text-foreground">QC gate</span>}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 rounded bg-muted/50 px-2 py-0.5 font-medium text-foreground border border-border/50">
                            Output: {Number(step.outputQuantityPerUnit || 1)} per unit
                          </span>
                          <span className="text-muted-foreground">➔</span>
                          <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 font-medium text-primary border border-primary/20">
                            Hands over to: {nextDept}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )) : <Card className="border-border p-6 text-sm text-muted-foreground">No department steps are configured.</Card>}
        </section>

        <section className="space-y-3" aria-labelledby="bom-allocation-heading">
          <h2 id="bom-allocation-heading" className="text-base font-semibold">BOM material allocation</h2>
          <Card className="overflow-hidden border-border">
            {bomLineRows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                    <tr><th className="px-4 py-3 font-semibold">Material</th><th className="px-4 py-3 font-semibold">BOM quantity</th><th className="px-4 py-3 font-semibold">Destinations and quantities</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {bomLineRows.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-3 font-medium">{line.name}</td>
                        <td className="px-4 py-3">{line.quantity} {line.uom}</td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            {line.allocations.map((allocation, index) => <div key={`${line.id}-${index}`} className="text-xs"><span className="text-muted-foreground">{allocation.destination}</span><span className="ml-2 font-medium">{allocation.quantity} {line.uom}</span></div>)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="p-6 text-sm text-muted-foreground">No BOM materials were found for this route.</div>}
          </Card>
        </section>
      </div>
    </main>
  );
}
