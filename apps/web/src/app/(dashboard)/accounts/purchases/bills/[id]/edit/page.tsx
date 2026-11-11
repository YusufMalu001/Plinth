'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@plinth/ui';
import Link from 'next/link';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { PurchaseBillModal } from '@/features/accounts/components/PurchaseBillModal';
import { accountsApi } from '@/features/accounts/api';
import { useCurrentUser } from '@/features/auth/hooks';

export default function EditSupplierBillPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const billQuery = useQuery({ queryKey: ['accounts', 'ap', 'bill', params.id], queryFn: () => accountsApi.apBill(params.id) });
  const bill = billQuery.data;
  const entities = useQuery({ queryKey: ['accounts', 'entities'], queryFn: accountsApi.entities });
  const vendors = useQuery({ queryKey: ['accounts', 'ap', 'vendors'], queryFn: accountsApi.apVendors });
  const receipts = useQuery({
    queryKey: ['accounts', 'ap', 'receipts', bill?.entityId],
    queryFn: () => accountsApi.apReceiptLines(bill!.entityId), enabled: Boolean(bill?.entityId),
  });
  const chart = useQuery({
    queryKey: ['accounts', 'chart', bill?.entityId],
    queryFn: () => accountsApi.chart(bill!.entityId), enabled: Boolean(bill?.entityId),
  });
  const permissions = new Set((user.data?.permissions || []).map((permission) => permission.toLowerCase()));
  const authorized = user.data?.role === 'admin' || permissions.has('update:purchasebill');

  if (billQuery.isLoading) return <main className="p-8 text-sm text-muted-foreground">Loading supplier bill…</main>;
  if (billQuery.isError || !bill) return <main className="p-8"><Card className="rounded-2xl p-5">Could not load this supplier bill.</Card></main>;
  if (bill.status === 'POSTED' || bill.status === 'CANCELLED' || !authorized) return (
    <main className="space-y-4 p-5 md:p-8">
      <AccountsHeader title="Editing Unavailable" entities={entities.data || []} selectedEntityId={bill.entityId} onSelectEntity={() => undefined} hideCompany />
      <Card className="rounded-2xl border-border bg-muted/40 p-5 text-sm text-foreground">
        {bill.status === 'POSTED' || bill.status === 'CANCELLED'
          ? 'This bill is in a posted or cancelled terminal status and cannot be modified.'
          : 'Your role does not have permission to edit supplier bills.'}
        <Link href={`/accounts/purchases/bills/${bill.id}`} className="ml-2 font-semibold underline">Return to bill</Link>
      </Card>
    </main>
  );

  const handleUpdate = async (data: any) => {
    const updated = await accountsApi.updateApBill(bill.id, data);
    await queryClient.invalidateQueries({ queryKey: ['accounts', 'ap'] });
    queryClient.setQueryData(['accounts', 'ap', 'bill', bill.id], updated);
    router.push(`/accounts/purchases/bills/${bill.id}`);
  };

  return (
    <main className="flex-1 space-y-5 p-5 md:p-8">
      <AccountsHeader title="Edit Supplier Bill Draft" entities={entities.data || []} selectedEntityId={bill.entityId} onSelectEntity={() => undefined} hideCompany />
      <PurchaseBillModal
        isOpen fullPage closeOnSubmit={false} initialBill={bill}
        onClose={() => router.push(`/accounts/purchases/bills/${bill.id}`)}
        entityId={bill.entityId} vendors={vendors.data || []} receipts={receipts.data || []}
        chart={chart.data || []} onSubmit={handleUpdate}
      />
    </main>
  );
}
