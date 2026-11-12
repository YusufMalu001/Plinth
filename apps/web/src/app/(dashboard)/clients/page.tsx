'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PageHeader,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  Input,
} from '@plinth/ui';
import {
  Plus,
  Users,
  Briefcase,
  IndianRupee,
  Building,
  Mail,
  ExternalLink,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useSalesCustomers } from '../../../features/sales/hooks';
import { CustomerRegistrationModal } from '../../../features/sales/components/CustomerRegistrationModal';
import { StatusBadge } from '../../../components/StatusBadge';
import { formatINR } from '../../../features/purchases/utils';

export default function ClientsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  const { data: customersData, isLoading, refetch } = useSalesCustomers({
    search: search || undefined,
    status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
    limit: 1000,
  });

  const rawCustomers = customersData?.items || [];

  const metrics = useMemo(() => {
    let totalCredit = 0;
    let activeCount = 0;

    rawCustomers.forEach((c: any) => {
      totalCredit += Number(c.creditLimit || 0);
      if (c.status === 'ACTIVE' || !c.status) activeCount++;
    });

    return {
      totalClients: rawCustomers.length,
      activeClients: activeCount,
      totalCreditLimit: totalCredit,
    };
  }, [rawCustomers]);

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="w-full space-y-6">
        <PageHeader
          title="Clients & Dealer Directory"
          description="Manage client relationships, dealer accounts, credit facilities, and financial commercial terms."
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/sales/customers')}
                className="font-semibold shadow-sm rounded-full text-xs"
              >
                Full CRM Directory
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsRegisterModalOpen(true)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm rounded-full text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add Client / Dealer
              </Button>
            </div>
          }
        />

        {/* Metrics Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="hover:border-primary/50 transition-colors shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between p-5 pb-2">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Total Registered Clients
              </CardTitle>
              <div className="p-1.5 bg-primary/10 rounded-md text-primary">
                <Users className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="text-3xl font-black text-foreground font-mono leading-tight">
                {isLoading ? '...' : metrics.totalClients}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Across enterprise sales divisions
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition-colors shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between p-5 pb-2">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Active Client Accounts
              </CardTitle>
              <div className="p-1.5 bg-tone-blue-bg rounded-md text-tone-blue-text">
                <Briefcase className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="text-3xl font-black text-foreground font-mono leading-tight">
                {isLoading ? '...' : metrics.activeClients}
              </div>
              <div className="w-full bg-muted h-1.5 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-tone-blue-solid h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${metrics.totalClients ? Math.round((metrics.activeClients / metrics.totalClients) * 100) : 0}%`,
                  }}
                />
              </div>
              <p className="text-xs font-medium text-muted-foreground mt-2">
                {metrics.totalClients
                  ? `${Math.round((metrics.activeClients / metrics.totalClients) * 100)}% active account ratio`
                  : 'No clients registered yet'}
              </p>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition-colors shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between p-5 pb-2">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Total Credit Extended
              </CardTitle>
              <div className="p-1.5 bg-tone-green-bg rounded-md text-tone-green-text">
                <IndianRupee className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="text-3xl font-black text-foreground font-mono leading-tight">
                {isLoading ? '...' : formatINR(metrics.totalCreditLimit)}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                <ShieldCheck className="w-3.5 h-3.5 text-tone-green-text" />
                <span>Accounts approved exposure</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client name, code, contact..."
              className="pl-9 h-9 text-xs"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-9 px-3 text-xs rounded-md border border-input bg-background font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended / Hold</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>

        {/* Clients Table */}
        <Card className="shadow-sm overflow-hidden flex flex-col p-0 border border-border">
          <div className="p-4 border-border-strong border-border flex justify-between items-center bg-card">
            <h2 className="text-sm font-bold text-foreground">Registered Clients & Dealers</h2>
            <span className="text-xs font-semibold text-muted-foreground">
              {rawCustomers.length} record{rawCustomers.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/5 hover:bg-primary/5 border-border-strong-primary/10">
                  <TableHead className="font-bold text-primary text-xs">Client / Company Name</TableHead>
                  <TableHead className="font-bold text-primary text-xs">Type & Code</TableHead>
                  <TableHead className="font-bold text-primary text-xs">Primary Contact</TableHead>
                  <TableHead className="font-bold text-primary text-xs">Credit Limit</TableHead>
                  <TableHead className="font-bold text-primary text-xs">Status</TableHead>
                  <TableHead className="text-right font-bold text-primary text-xs">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                      Loading clients directory...
                    </TableCell>
                  </TableRow>
                ) : rawCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                      No clients found matching the query.
                    </TableCell>
                  </TableRow>
                ) : (
                  rawCustomers.map((cust: any) => {
                    const billingMeta = cust.billingAddress && typeof cust.billingAddress === 'object'
                      ? cust.billingAddress
                      : {};
                    const type = cust.customerType || billingMeta.customerType || 'DEALER';
                    const initials = (cust.name || 'C')
                      .split(' ')
                      .map((w: string) => w[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase();

                    return (
                      <TableRow
                        key={cust.id}
                        className="hover:bg-muted/30 transition-colors group cursor-pointer"
                        onClick={() => router.push(`/sales/customers/${cust.id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                              {initials}
                            </div>
                            <div>
                              <span className="font-bold text-sm text-foreground hover:text-primary transition-colors block">
                                {cust.name}
                              </span>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                {cust.code}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                            <Building className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="uppercase text-[11px] font-semibold">{type}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-foreground">
                              {cust.contactPhone || billingMeta.contactPerson || '—'}
                            </span>
                            {cust.contactEmail && (
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Mail className="w-3 h-3" />
                                {cust.contactEmail}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-semibold font-mono text-foreground">
                            {formatINR(Number(cust.creditLimit || 0))}
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            Terms: {cust.paymentTerms || 'NET_30'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={cust.status || 'ACTIVE'} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/sales/customers/${cust.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                          >
                            <span>Profile & Ledger</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <CustomerRegistrationModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onSuccess={() => {
          refetch();
          setIsRegisterModalOpen(false);
        }}
      />
    </div>
  );
}
