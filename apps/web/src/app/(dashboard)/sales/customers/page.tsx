'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  CreditCard,
  Eye,
  ShoppingCart,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@plinth/ui';
import { PaginationControls } from '../../../../components/PaginationControls';
import { StatusBadge } from '../../../../components/StatusBadge';
import { useSalesCustomers } from '../../../../features/sales/hooks';
import { CustomerRegistrationModal } from '../../../../features/sales/components/CustomerRegistrationModal';

const formatCurrency = (val: number | string) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(val || 0));

export default function CustomersDirectoryPage() {
  const router = useRouter();

  // Search & Filters
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Modal State
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  // Fetch Customers
  const { data: customersData, isLoading, refetch } = useSalesCustomers({
    search: search || undefined,
    status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
    limit: 1000,
  });

  const rawCustomers = customersData?.items || [];

  // Filter by customer type (from billingAddress/customerType)
  const filteredCustomers = useMemo(() => {
    return rawCustomers.filter((cust) => {
      const billingMeta = cust.billingAddress && typeof cust.billingAddress === 'object'
        ? cust.billingAddress
        : {};
      const type = cust.customerType || billingMeta.customerType || 'DEALER';

      if (selectedType !== 'ALL' && type !== selectedType) {
        return false;
      }
      return true;
    });
  }, [rawCustomers, selectedType]);

  // Pagination
  const total = filteredCustomers.length;
  const paginatedCustomers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, page, pageSize]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalCredit = 0;
    let dealersCount = 0;
    let distributorsCount = 0;

    rawCustomers.forEach((c) => {
      totalCredit += Number(c.creditLimit || 0);
      const billingMeta = c.billingAddress && typeof c.billingAddress === 'object'
        ? c.billingAddress
        : {};
      const type = c.customerType || billingMeta.customerType || 'DEALER';
      if (type === 'DEALER') dealersCount++;
      if (type === 'DISTRIBUTOR') distributorsCount++;
    });

    return {
      totalAccounts: rawCustomers.length,
      dealersCount,
      distributorsCount,
      totalCredit,
    };
  }, [rawCustomers]);

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'DISTRIBUTOR':
        return 'bg-tone-purple-bg text-tone-purple-text border-tone-purple-solid/25';
      case 'DEALER':
        return 'bg-tone-purple-bg text-tone-purple-text border-tone-purple-solid/25';
      case 'CORPORATE':
        return 'bg-tone-blue-bg text-tone-blue-text border-tone-blue-solid/25';
      case 'RETAIL':
        return 'bg-tone-green-bg text-tone-green-text border-tone-green-solid/25';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/10 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Registration Modal */}
      <CustomerRegistrationModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onSuccess={() => {
          refetch();
        }}
      />

      {/* Header */}
      <PageHeader
        title="Customers & Dealers"
        actions={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              icon={ShoppingCart}
              onClick={() => router.push('/sales/orders/new')}
            >
              New Sales Order
            </Button>
            <Button
              size="sm"
              icon={UserPlus}
              onClick={() => setIsRegisterModalOpen(true)}
              className="font-bold shadow-none shadow-primary/20"
            >
              Register Customer / Dealer
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-border/70 shadow-sm hover:shadow-none transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Total Accounts
            </span>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-foreground font-mono">
              {metrics.totalAccounts}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-sm hover:shadow-none transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Dealers & Partners
            </span>
            <Building2 className="h-4 w-4 text-tone-purple-text" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-foreground font-mono">
              {metrics.dealersCount}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-sm hover:shadow-none transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Total Credit Extended
            </span>
            <CreditCard className="h-4 w-4 text-tone-green-text" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-foreground font-mono">
              {formatCurrency(metrics.totalCredit)}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-sm hover:shadow-none transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Channel Growth
            </span>
            <TrendingUp className="h-4 w-4 text-tone-blue-text" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-foreground font-mono">
              Active
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Directory Table Card */}
      <Card className="rounded-2xl border-border/70 shadow-sm overflow-hidden">
        <CardHeader className="bg-card/40 border-border-strong border-border/50 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Customer & Dealer Directory
            </CardTitle>

            <div className="flex flex-wrap items-center gap-3">
              {/* Type Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Type:</span>
                <select
                  value={selectedType}
                  onChange={(e) => {
                    setSelectedType(e.target.value);
                    setPage(1);
                  }}
                  className="h-8 px-2 rounded-lg border border-border bg-background text-xs font-semibold"
                >
                  <option value="ALL">All Types</option>
                  <option value="DEALER">Dealers</option>
                  <option value="DISTRIBUTOR">Distributors</option>
                  <option value="RETAIL">Retail Customers</option>
                  <option value="CORPORATE">Corporate</option>
                  <option value="INSTITUTIONAL">Institutional</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Status:</span>
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setPage(1);
                  }}
                  className="h-8 px-2 rounded-lg border border-border bg-background text-xs font-semibold"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="APPROVED">Approved</option>
                  <option value="DRAFT">Draft</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>

              {/* Search Bar */}
              <div className="w-64">
                <Input
                  placeholder="Search name, code, GSTIN..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Code</TableHead>
                <TableHead>Business / Customer Name</TableHead>
                <TableHead className="w-32">Type</TableHead>
                <TableHead className="w-36">Contact</TableHead>
                <TableHead className="w-36">GSTIN / Tax ID</TableHead>
                <TableHead className="w-28">Payment Terms</TableHead>
                <TableHead className="text-right w-32">Credit Limit</TableHead>
                <TableHead className="text-center w-24">Status</TableHead>
                <TableHead className="text-right w-36">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="p-8 text-center text-muted-foreground">
                    Loading customer directory...
                  </TableCell>
                </TableRow>
              ) : paginatedCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="p-8 text-center text-muted-foreground">
                    No customer or dealer accounts found matching your filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCustomers.map((cust) => {
                  const billingMeta = cust.billingAddress && typeof cust.billingAddress === 'object'
                    ? cust.billingAddress
                    : {};
                  const customerType = cust.customerType || billingMeta.customerType || 'DEALER';
                  const paymentTerms = cust.paymentTerms || billingMeta.paymentTerms || 'NET_30';
                  const contactPerson = cust.contactPerson || billingMeta.contactPerson;

                  return (
                    <TableRow key={cust.id} className="hover:bg-muted/20 transition-colors">
                      <TableCell className="font-mono font-bold text-primary">
                        <Link
                          href={`/sales/customers/${cust.id}`}
                          className="hover:underline flex items-center gap-1"
                        >
                          {cust.code}
                        </Link>
                      </TableCell>

                      <TableCell>
                        <div className="font-bold text-foreground">{cust.name}</div>
                        {contactPerson && (
                          <div className="text-[11px] text-muted-foreground">
                            Attn: {contactPerson}
                          </div>
                        )}
                      </TableCell>

                      <TableCell>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getTypeBadgeColor(
                            customerType
                          )}`}
                        >
                          {customerType}
                        </span>
                      </TableCell>

                      <TableCell>
                        <div className="font-mono text-foreground font-medium">
                          {cust.contactPhone || '—'}
                        </div>
                        {cust.contactEmail && (
                          <div className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                            {cust.contactEmail}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="font-mono font-medium text-foreground">
                        {cust.taxNumber || <span className="text-muted-foreground italic">Unregistered</span>}
                      </TableCell>

                      <TableCell className="font-medium text-foreground">
                        {paymentTerms.replace('_', ' ')}
                      </TableCell>

                      <TableCell className="text-right font-mono font-bold text-foreground">
                        {Number(cust.creditLimit || 0) > 0
                          ? formatCurrency(cust.creditLimit!)
                          : '—'}
                      </TableCell>

                      <TableCell className="text-center">
                        <StatusBadge status={cust.status as any} />
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/sales/customers/${cust.id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Customer 360"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>360</span>
                          </Link>

                          <Link
                            href={`/sales/orders/new`}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                            title="New Sales Order"
                          >
                            <ShoppingCart className="h-3 w-3" />
                            <span>Order</span>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="p-4 border-t border-border/60">
            <PaginationControls
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={(p: number) => setPage(p)}
              onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
