'use client';

import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, PackageCheck,
  ScanLine, ShieldCheck, Truck, Warehouse
} from 'lucide-react';
import { Button, Card, PageHeader } from '@plinth/ui';
import { LoadingState } from '../../../components/LoadingState';
import { ErrorState } from '../../../components/ErrorState';
import { ForbiddenState } from '../../../components/ForbiddenState';
import { StatusBadge } from '../../../components/StatusBadge';
import { useReceivingDashboard } from '../../../features/goods-receipt/hooks';

const workflow = [
  { title: 'Register arrival', subtitle: 'PO or controlled exception', icon: Truck },
  { title: 'Physical checks', subtitle: 'Weight, piece, bundle, packet', icon: ScanLine },
  { title: 'Resolve variance', subtitle: 'Short, excess, or damage', icon: AlertTriangle },
  { title: 'Supervisor sign-off', subtitle: 'Segregated authority', icon: ShieldCheck },
  { title: 'Post to stock', subtitle: 'Exactly-once ledger effect', icon: Warehouse },
];

export default function ReceivingControlCenter() {
  const { data, isLoading, error, refetch } = useReceivingDashboard();
  if (isLoading) return <LoadingState message="Preparing receiving control center..." />;
  if (error) {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) return <ForbiddenState message="You do not have access to the receiving control center." />;
    return <ErrorState error={error as Error} retry={refetch} />;
  }
  if (!data) return <ErrorState error={new Error('Receiving dashboard is unavailable.')} retry={refetch} />;

  const cards = [
    { label: 'Arrivals to verify', value: data.metrics.arrived + data.metrics.verifying, hint: `${data.metrics.arrived} not started`, icon: ClipboardCheck, tone: 'text-tone-blue-text bg-tone-blue-bg', href: '/receiving/goods-receipts?status=UNDER_VERIFICATION' },
    { label: 'Discrepancies', value: data.metrics.discrepancies, hint: 'Resolution blocks sign-off', icon: AlertTriangle, tone: 'text-tone-red-text bg-tone-red-bg', href: '/receiving/goods-receipts?status=DISCREPANCY_PENDING' },
    { label: 'Awaiting sign-off', value: data.metrics.awaitingSignOff, hint: 'Verified by store team', icon: ShieldCheck, tone: 'text-tone-amber-text bg-tone-amber-bg', href: '/receiving/goods-receipts?status=VERIFIED' },
    { label: 'Ready to post', value: data.metrics.awaitingFinalize, hint: `${data.metrics.finalizedToday} finalized today`, icon: PackageCheck, tone: 'text-tone-green-text bg-tone-green-bg', href: '/receiving/goods-receipts?status=SIGNED_OFF' },
  ];

  const actionLabel = (status: string) => status === 'ARRIVED' || status === 'UNDER_VERIFICATION'
    ? 'Verify'
    : status === 'DISCREPANCY_PENDING' ? 'Resolve' : status === 'VERIFIED' ? 'Sign off' : 'Finalize';

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Receiving control center"
        description={data.scope.allLocations ? 'Live receiving work across all stores.' : 'Live receiving work for your assigned store.'}
        actions={data.capabilities.receive ? <Link href="/receiving/goods-receipts/new"><Button size="sm" className="font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm">Register incoming shipment</Button></Link> : undefined}
      />

      <Card className="overflow-hidden border-primary/15 bg-surface p-0 shadow-xs rounded-2xl w-full">
        <div className="flex items-center justify-between border-border-strong border-border/80 px-6 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Governed receiving workflow</p>
            <h2 className="mt-1 text-lg font-bold text-foreground">Arrival to auditable stock posting</h2>
          </div>
          <Link href="/receiving/expected" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
            <span>Open expected queue</span>
            <ArrowRight size={13} />
          </Link>
        </div>
        <div className="grid md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-border/60">
          {workflow.map((step, index) => (
            <div key={step.title} className="relative p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <step.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.subtitle}</p>
                </div>
              </div>
              {index < workflow.length - 1 && (
                <ArrowRight className="absolute -right-2.5 top-7 z-10 hidden h-5 w-5 rounded-full bg-card text-muted-foreground md:block" />
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 w-full">
        {cards.map(card => (
          <Link href={card.href} key={card.label}>
            <Card className="h-full border border-border/80 bg-card p-5 shadow-xs rounded-2xl hover:border-primary/40 transition-all">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{card.label}</p>
                  <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.hint}</p>
                </div>
                <div className={`rounded-xl p-3 shrink-0 ${card.tone}`}>
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr] w-full">
        <Card className="overflow-hidden p-0 shadow-xs rounded-2xl border border-border/80 bg-card">
          <div className="flex items-center justify-between border-border-strong border-border/80 px-5 py-4">
            <div>
              <h2 className="font-bold text-foreground text-base">My action queue</h2>
              <p className="text-xs text-muted-foreground">Oldest open receiving work first</p>
            </div>
            <Link href="/receiving/goods-receipts" className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
              <span>View register</span>
              <ArrowRight size={13} />
            </Link>
          </div>
          <div className="divide-y divide-border/60">
            {data.actionQueue.map(grn => (
              <Link key={grn.id} href={`/receiving/goods-receipts/${grn.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-muted/40 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-foreground">{grn.grnNumber}</span>
                    <StatusBadge status={grn.status} />
                    {grn.isUnreferenced && (
                      <span className="rounded-full bg-tone-amber-bg border border-tone-amber-solid/25 px-2 py-0.5 text-[10px] font-bold text-tone-amber-text">
                        No PO
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {grn.vendor?.name || 'Vendor not recorded'} · {grn.location?.name || 'Legacy location'} · {grn.lines.length} lines
                  </p>
                </div>
                <span className="flex items-center gap-1 text-xs font-bold text-primary shrink-0">
                  {actionLabel(grn.status)}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
            {!data.actionQueue.length && (
              <div className="p-10 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-tone-green-text" />
                <p className="mt-3 text-sm font-bold text-foreground">Receiving queue is clear</p>
                <p className="mt-1 text-xs text-muted-foreground">New arrivals will appear here automatically.</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden p-0 shadow-xs rounded-2xl border border-border/80 bg-card">
          <div className="border-border-strong border-border/80 px-5 py-4">
            <h2 className="font-bold text-foreground text-base">Recently posted</h2>
            <p className="text-xs text-muted-foreground">Accepted quantity handed to inventory</p>
          </div>
          <div className="divide-y divide-border/60">
            {data.recentFinalized.map(grn => {
              const quantity = grn.lines.reduce((sum, line) => sum + line.acceptedQuantity, 0);
              return (
                <Link key={grn.id} href={`/receiving/goods-receipts/${grn.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-muted/40 transition-colors">
                  <div>
                    <p className="font-mono text-sm font-bold text-foreground">{grn.grnNumber}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {grn.vendor?.name || 'Unknown vendor'} · <span className="font-semibold text-foreground">{quantity.toLocaleString()}</span> accepted
                    </p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-tone-green-text shrink-0" />
                </Link>
              );
            })}
            {!data.recentFinalized.length && (
              <p className="p-8 text-center text-sm text-muted-foreground">No finalized receipts yet.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
