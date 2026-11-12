'use client';

import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PackageCheck } from 'lucide-react';
import { Button, Card } from '@plinth/ui';
import Link from 'next/link';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { PurchaseBillModal } from '@/features/accounts/components/PurchaseBillModal';
import { accountsApi } from '@/features/accounts/api';

export default function NewSupplierBillPage({ searchParams }: { searchParams: { grnId?: string } }) {
  const router = useRouter();
  const sourceGrnId = searchParams.grnId || '';
  const queryClient = useQueryClient();
  const destinationAfterSave = useRef('/accounts/purchases');
  const entities = useQuery({ queryKey: ['accounts', 'entities'], queryFn: accountsApi.entities });
  const entityId = entities.data?.[0]?.id || '';
  const vendors = useQuery({ queryKey: ['accounts', 'ap', 'vendors'], queryFn: accountsApi.apVendors });
  const receipts = useQuery({
    queryKey: ['accounts', 'ap', 'receipts', entityId],
    queryFn: () => accountsApi.apReceiptLines(entityId), enabled: Boolean(entityId),
  });
  const chart = useQuery({
    queryKey: ['accounts', 'chart', entityId],
    queryFn: () => accountsApi.chart(entityId), enabled: Boolean(entityId),
  });
  const periods = useQuery({
    queryKey: ['accounts', 'periods', entityId],
    queryFn: () => accountsApi.periods(entityId), enabled: Boolean(entityId),
  });
  const sourceGrn = useQuery({
    queryKey: ['accounts', 'ap', 'accepted-grn', sourceGrnId],
    queryFn: () => accountsApi.acceptedGrn(sourceGrnId),
    enabled: Boolean(sourceGrnId),
  });

  const handleCreate = async (billData: any) => {
    const created = await accountsApi.createApBill(billData, crypto.randomUUID());
    destinationAfterSave.current = `/accounts/purchases/bills/${created.id}`;
    await queryClient.invalidateQueries({ queryKey: ['accounts', 'ap'] });
    router.push(destinationAfterSave.current);
  };

  return (
    <main className="flex-1 space-y-5 p-5 md:p-8">
      <AccountsHeader
        title="Capture Supplier Bill"
        entities={entities.data || []}
        selectedEntityId={entityId}
        onSelectEntity={() => undefined}
        activePeriod={periods.data?.find((period) => period.status === 'OPEN')?.code}
      />

      <div className="rounded-2xl border border-border bg-muted/40 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-xl bg-primary/10 p-2 text-foreground"><PackageCheck className="h-4 w-4" /></span>
          <div>
            <p className="text-sm font-semibold">What does “match” mean?</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">We compare the supplier invoice with two existing records: the PO says what was ordered and at what rate; the GRN says what was accepted into stock. Enter the invoice details as printed. The check flags differences before Accounts approves payment.</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Link href="/accounts/purchases"><Button variant="outline" size="sm" className="gap-2"><ArrowLeft className="h-4 w-4" />Back to Purchases &amp; Payables</Button></Link>
      </div>

      {entities.isLoading || (sourceGrnId && sourceGrn.isLoading) ? (
        <Card className="rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading Accounts setup…</Card>
      ) : sourceGrnId && (sourceGrn.isError || !sourceGrn.data) ? (
          <Card className="rounded-2xl border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">Could not load the selected accepted GRN. {sourceGrn.error instanceof Error ? sourceGrn.error.message : ''}</Card>
      ) : !entityId ? (
        <Card className="rounded-2xl border-border bg-muted/40 p-5 text-sm text-foreground">
          Set up the Plinth accounting book before capturing bills. <Link className="font-semibold underline" href="/accounts/setup">Open Accounts setup</Link>.
        </Card>
      ) : sourceGrnId && sourceGrn.data && !sourceGrn.data.lines.some((line) => Number(line.remainingBillableQuantity ?? line.acceptedQuantity) > 0) ? (
        <Card className="rounded-2xl border-border bg-muted/40 p-5 text-sm text-foreground">
          <p className="font-semibold">There are no unbilled quantities left on this GRN.</p>
          <p className="mt-1 text-xs">Existing bills already cover the accepted items. Open an existing bill to review or correct it.</p>
          {sourceGrn.data.supplierInvoices[0] && <Link className="mt-3 inline-flex font-semibold underline" href={`/accounts/purchases/bills/${sourceGrn.data.supplierInvoices[0].id}`}>Open supplier bill {sourceGrn.data.supplierInvoices[0].supplierInvoiceNumber}</Link>}
        </Card>
      ) : (
        (() => {
          const grn = sourceGrn.data;
          return (
        <PurchaseBillModal
          isOpen
          fullPage
          closeOnSubmit={false}
          onClose={() => router.push(destinationAfterSave.current)}
          entityId={entityId}
          vendors={vendors.data || []}
          receipts={receipts.data || []}
          chart={chart.data || []}
          onSubmit={handleCreate}
          initialValues={grn ? {
            vendorId: grn.vendorId,
            supplierInvoiceNumber: undefined,
            lines: grn.lines.filter((line) => Number(line.remainingBillableQuantity ?? line.acceptedQuantity) > 0).map((line) => ({
              description: line.description,
              poLineId: line.poLineId || '',
              grnLineId: line.id,
              quantity: line.remainingBillableQuantity ?? line.acceptedQuantity,
              unitPrice: String(Number(line.unitPrice || 0) > 0 ? line.unitPrice : '1.00'),
              gstRate: line.taxRate || '18',
            })),
          } : undefined}
        />
          );
        })()
      )}
    </main>
  );
}
