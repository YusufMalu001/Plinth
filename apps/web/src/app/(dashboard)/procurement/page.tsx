'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  ShoppingCart,
  Truck,
  Plus,
  FileText,
  Building2,
  ArrowUpRight,
} from 'lucide-react';
import { Button, Card, PageHeader } from '@plinth/ui';
import { LoadingState } from '../../../components/LoadingState';
import { ErrorState } from '../../../components/ErrorState';
import { StatusBadge } from '../../../components/StatusBadge';
import { useProcurementDashboard } from '../../../features/purchases/hooks';
import { ModuleRecommendationsPanel } from '@/features/intelligence/components/ModuleRecommendationsPanel';

export default function ProcurementLanding() {
  const { data, isLoading, error, refetch } = useProcurementDashboard();

  if (isLoading) return <LoadingState message="Preparing procurement workspace..." />;
  if (error || !data) return <ErrorState error={error as Error} retry={refetch} />;

  const cards = [
    {
      label: 'POs Awaiting Approval',
      value: data.metrics.awaitingApproval,
      hint: 'Admin sign-off required before vendor dispatch',
      icon: Clock3,
      tone: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
      href: '/procurement/purchase-orders?status=DRAFT',
      badgeText: 'Action required',
    },
    {
      label: 'Cancelled POs',
      value: data.metrics.cancelledPos,
      hint: 'Purchase orders cancelled before fulfillment',
      icon: AlertTriangle,
      tone: 'text-rose-600 bg-rose-500/10 border-rose-500/20',
      href: '/procurement/purchase-orders?status=CANCELLED',
      badgeText: data.metrics.cancelledPos > 0 ? 'Cancelled orders' : 'None cancelled',
    },
    {
      label: 'Active Purchase Orders',
      value: data.metrics.activePos,
      hint: 'Approved, vendor-issued, or in transit',
      icon: ShoppingCart,
      tone: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
      href: '/procurement/purchase-orders',
      badgeText: 'Active orders',
    },
    {
      label: 'Expected Inbound',
      value: data.metrics.pendingReceipts,
      hint: `${data.metrics.overdueReceipts} overdue for warehouse gate intake`,
      icon: Truck,
      tone: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
      href: '/receiving/expected',
      badgeText: data.metrics.overdueReceipts > 0 ? `${data.metrics.overdueReceipts} overdue` : 'On schedule',
    },
  ];

  const quickNav = [
    {
      title: 'Create Purchase Order',
      desc: 'Create and submit a direct vendor order',
      icon: ShoppingCart,
      href: '/procurement/purchase-orders/generate',
      cta: 'Create PO',
    },
    {
      title: 'Purchase Orders',
      desc: 'Active orders, revisions & vendor contracts',
      icon: ShoppingCart,
      href: '/procurement/purchase-orders',
      cta: 'View POs',
    },
    {
      title: 'Expected Deliveries',
      desc: 'Incoming vendor shipments & receiving queue',
      icon: Truck,
      href: '/receiving/expected',
      cta: 'Open queue',
    },
    {
      title: 'Vendor Registry',
      desc: 'Supplier directory, performance & metrics',
      icon: Building2,
      href: '/vendors',
      cta: 'Directory',
    },
  ];

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="w-full space-y-6">
        {/* Executive Header */}
        <PageHeader
          title="Procurement Control Center"
          description="Governed pipeline tracking material requirements, purchase orders, and warehouse delivery receipts."
          actions={
            <div className="flex items-center gap-2.5">
              <Link href="/procurement/purchase-orders">
                <Button variant="outline" size="sm" className="rounded-full shadow-xs text-xs font-semibold h-9">
                  <ShoppingCart size={14} className="mr-1.5" />
                  <span>Orders Register</span>
                </Button>
              </Link>

              <Link href="/procurement/purchase-orders/generate">
                <Button
                  variant="default"
                  size="sm"
                  className="rounded-full shadow-xs bg-primary hover:bg-amber-600 text-primary-foreground font-semibold text-xs h-9"
                >
                  <Plus size={14} className="mr-1.5" />
                  <span>Create Purchase Order</span>
                </Button>
              </Link>
            </div>
          }
        />

        <ModuleRecommendationsPanel module="PROCUREMENT" />

        {/* 4 Rich KPI Metric Cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <Link key={card.label} href={card.href} className="group">
              <Card className="p-5 shadow-xs border border-border/80 group-hover:border-primary/40 group-hover:shadow-sm transition-all h-full flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {card.label}
                    </p>
                    <div className={`rounded-xl border p-2 ${card.tone}`}>
                      <card.icon size={16} />
                    </div>
                  </div>

                  <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">
                    {card.value}
                  </p>
                </div>

                <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground truncate">{card.hint}</p>
                  <span className="text-[10px] font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0 ml-2">
                    <span>View</span>
                    <ArrowUpRight size={11} />
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        {/* Quick Launchpad Navigation Tiles */}
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {quickNav.map((item) => (
            <Link key={item.title} href={item.href} className="group">
              <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs hover:border-primary/40 hover:shadow-sm transition-all flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <item.icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors truncate">
                      {item.title}
                    </h3>
                    <ArrowRight size={12} className="text-muted-foreground group-hover:translate-x-0.5 group-hover:text-primary transition-all" />
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">
                    {item.desc}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Dual Live Registers: Recent Requirements & Purchase Orders */}
        <div className="grid gap-6 xl:grid-cols-2">
          {/* Card 1: Recent Purchase Orders */}
          <Card className="overflow-hidden p-0 shadow-xs border border-border/80">
            <div className="flex items-center justify-between border-b border-border/70 bg-muted/30 px-5 py-4">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-primary" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Recent Purchase Orders</h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Latest purchase order movement and approval states
                  </p>
                </div>
              </div>

              <Link
                href="/procurement/purchase-orders"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <span>View purchase orders</span>
                <ArrowRight size={12} />
              </Link>
            </div>

            <div className="divide-y divide-border/60">
              {data.recentPos.map((po) => (
                <Link
                  key={po.id}
                  href={po.id ? `/procurement/purchase-orders/${po.id}` : '/procurement/purchase-orders'}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                        {po.poNumber}
                      </span>
                      <StatusBadge status={['SENT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED'].includes(po.status) ? 'APPROVED' : ['REJECTED', 'SUPERSEDED'].includes(po.status) ? 'CANCELLED' : po.status} />
                    </div>

                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {po.vendor?.name || 'Vendor'} ·{' '}
                      <span className="text-foreground/80 font-medium">
                        {po.currency || 'INR'} {Number(po.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </p>
                  </div>

                  <ArrowRight size={14} className="shrink-0 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </Link>
              ))}

              {!data.recentPos.length && (
                <div className="p-8 text-center text-xs text-muted-foreground">
                No purchase orders recorded yet.
                </div>
              )}
            </div>
          </Card>

          {/* Card 2: Purchase Order Register */}
          <Card className="overflow-hidden p-0 shadow-xs border border-border/80">
            <div className="flex items-center justify-between border-b border-border/70 bg-muted/30 px-5 py-4">
              <div className="flex items-center gap-2">
                <ShoppingCart size={16} className="text-primary" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Purchase Order Register</h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Direct vendor orders and approval status
                  </p>
                </div>
              </div>

              <Link
                href="/procurement/purchase-orders"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <span>View all orders</span>
                <ArrowRight size={12} />
              </Link>
            </div>

            <div className="divide-y divide-border/60">
              {data.recentPos.map((po) => (
                <Link
                  key={po.id}
                  href={po.id ? `/procurement/purchase-orders/${po.id}` : '/procurement/purchase-orders'}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                        {po.poNumber}
                      </span>
                      <StatusBadge status={['SENT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED'].includes(po.status) ? 'APPROVED' : ['REJECTED', 'SUPERSEDED'].includes(po.status) ? 'CANCELLED' : po.status} />
                    </div>

                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      <span className="text-foreground/80 font-medium">{po.vendor?.name || 'Vendor'}</span> ·{' '}
                      <span className="font-mono font-semibold text-foreground">
                        {po.currency || 'INR'} {Number(po.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>{' '}
                      · {po.lines?.length ?? 0} lines
                    </p>
                  </div>

                  <ArrowRight size={14} className="shrink-0 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </Link>
              ))}

              {!data.recentPos.length && (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No purchase orders recorded yet.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
