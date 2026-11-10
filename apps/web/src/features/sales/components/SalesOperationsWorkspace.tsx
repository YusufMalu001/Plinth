"use client";

import Link from 'next/link';
import { ArrowLeft, ArrowRight, ClipboardList, PackageCheck, Truck } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, Table } from '@synergy/ui';
import { useSalesOrders } from '../hooks';

const config = {
  allocation: { title: 'Allocation workbench', description: 'Reserve saleable finished goods and identify backorders.', statuses: ['CONFIRMED', 'PARTIALLY_ALLOCATED'], icon: PackageCheck },
  packing: { title: 'Shipment packing queue', description: 'Orders that have completed allocation and are ready for fulfillment packing.', statuses: ['PICKED', 'PACKING', 'PACKED'], icon: PackageCheck },
  dispatch: { title: 'Dispatch control', description: 'Validate packages, carriers and outbound inventory before handoff.', statuses: ['READY_TO_DISPATCH'], icon: Truck },
  returns: { title: 'Returns control', description: 'Return inspection and disposition is governed by the order timeline.', statuses: ['RETURNED'], icon: ClipboardList },
} as const;

export function SalesOperationsWorkspace({ mode }: { mode: keyof typeof config }) {
  const current = config[mode];
  const { data, isLoading } = useSalesOrders({ page: 1, limit: 100 });
  const orders = (data?.items ?? []).filter((order) => current.statuses.includes(order.status as never));
  return <div className="flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-[1500px] space-y-6"><Link href="/sales" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to Sales</Link><PageHeader title={current.title} description={current.description} /><Card><CardHeader><CardTitle className="flex items-center gap-2"><current.icon className="h-5 w-5 text-primary" />Live work queue</CardTitle></CardHeader><CardContent className="p-0">{isLoading ? <div className="p-8 text-center text-muted-foreground">Loading queue…</div> : orders.length === 0 ? <div className="p-12 text-center"><current.icon className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-semibold">No orders in this queue</p><p className="mt-1 text-sm text-muted-foreground">The queue is derived from transactional order status, not sample data.</p></div> : <Table><thead><tr><th className="px-5 py-3 text-left text-xs uppercase">Order</th><th className="px-5 py-3 text-left text-xs uppercase">Channel</th><th className="px-5 py-3 text-left text-xs uppercase">Status</th><th className="px-5 py-3" /></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-b border-border"><td className="px-5 py-4"><Link href={`/sales/orders/${order.id}`} className="font-semibold text-primary hover:underline">{order.orderNumber}</Link><div className="text-xs text-muted-foreground">{order.lines.length} line(s)</div></td><td className="px-5 py-4"><Badge variant="outline">{order.channel.replace('_', ' ')}</Badge></td><td className="px-5 py-4"><Badge variant="info">{order.status.replaceAll('_', ' ')}</Badge></td><td className="px-5 py-4 text-right"><Link href={`/sales/orders/${order.id}`}><ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" /></Link></td></tr>)}</tbody></Table>}</CardContent></Card></div></div>;
}
