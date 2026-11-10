'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileCheck,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  ChevronRight,
  FileText,
  BadgePercent,
} from 'lucide-react';
import {
  Card,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@synergy/ui';
import { accountsApi } from '@/features/accounts/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { ProFormaModal } from '@/features/accounts/components/ProFormaModal';
import { ProFormaInvoice } from '@/features/accounts/types';
import { formatCurrency } from '@/features/accounts/utils';

export default function ProFormasPage() {
  const queryClient = useQueryClient();
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [viewProForma, setViewProForma] = useState<ProFormaInvoice | null>(null);

  const entities = useQuery({
    queryKey: ['accounts', 'entities'],
    queryFn: accountsApi.entities,
  });

  const entityId = selectedEntityId || entities.data?.[0]?.id || '';

  const periods = useQuery({
    queryKey: ['accounts', 'periods', entityId],
    queryFn: () => accountsApi.periods(entityId),
    enabled: Boolean(entityId),
  });

  const proFormas = useQuery({
    queryKey: ['accounts', 'pro-formas', entityId],
    queryFn: () => accountsApi.proFormas(entityId),
    enabled: Boolean(entityId),
  });

  const allProFormas = proFormas.data || [];
  const filtered = allProFormas.filter((pf) => {
    const matchesSearch =
      !search ||
      pf.proFormaNumber.toLowerCase().includes(search.toLowerCase()) ||
      pf.customerName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || pf.status === statusFilter;
    const matchesDate = !selectedDate || (pf.issueDate && pf.issueDate.startsWith(selectedDate));
    return matchesSearch && matchesStatus && matchesDate;
  });

  const totalProFormaValue = allProFormas.reduce((sum, p) => sum + parseFloat(p.totalAmount || '0'), 0);
  const pendingCount = allProFormas.filter((p) => p.status === 'SENT' || p.status === 'DRAFT').length;
  const convertedCount = allProFormas.filter((p) => p.status === 'CONVERTED').length;
  const activeCount = allProFormas.length - convertedCount;

  const saveProForma = async (id: string, lines: Array<{ salesOrderLineId: string; unitPrice: string; discountAmount: string; taxRate: string }>) => {
    await accountsApi.updateProForma(id, lines);
    await queryClient.invalidateQueries({ queryKey: ['accounts', 'pro-formas', entityId] });
  };

  return (
    <main className="flex-1 space-y-4 p-5 md:p-8">
      <AccountsHeader
        title="Commercial Pro Forma Invoices"
        entities={entities.data || []}
        selectedEntityId={entityId}
        onSelectEntity={setSelectedEntityId}
        activePeriod={periods.data?.find((p) => p.status === 'OPEN')?.code}
        dateFilter={selectedDate}
        onDateChange={setSelectedDate}
      />

      {/* Compact 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
              Total Pro Forma Value
            </span>
            <span className="rounded-lg p-1.5 border bg-muted text-foreground border-border">
              <FileCheck className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground truncate">
            {proFormas.isLoading ? '—' : formatCurrency(totalProFormaValue)}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {allProFormas.length} commercial quotation{allProFormas.length === 1 ? '' : 's'}
          </p>
        </div>

        {/* Card 2 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
              Awaiting Advance / Dispatch
            </span>
            <span className={`rounded-lg p-1.5 border ${
              pendingCount > 0
                ? 'bg-muted text-foreground border-border'
                : 'bg-muted text-foreground border-border'
            }`}>
              <Clock className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
            {proFormas.isLoading ? '—' : pendingCount}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            Open customer quotations
          </p>
        </div>

        {/* Card 3 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
              Converted to Invoices
            </span>
            <span className="rounded-lg p-1.5 border bg-muted text-foreground border-border">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
            {proFormas.isLoading ? '—' : convertedCount}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            Official billing completed
          </p>
        </div>

        {/* Card 4 */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
              Active Quotations
            </span>
            <span className="rounded-lg p-1.5 border bg-muted text-foreground border-border">
              <BadgePercent className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
            {proFormas.isLoading ? '—' : activeCount}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            Ready for fulfillment &amp; dispatch
          </p>
        </div>
      </div>

      {/* Toolbar Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Pro Forma Register
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {filtered.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Search pro forma or customer..."
              className="rounded-xl border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none w-48 sm:w-60 transition"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            aria-label="Filter by Status"
            className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="SENT">Sent</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="CONVERTED">Converted</option>
            <option value="DRAFT">Draft</option>
          </select>
        </div>
      </div>

      {/* Pro Forma Register Table */}
      <Card className="shadow-sm overflow-hidden rounded-xl border border-border/80">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Pro Forma No.</TableHead>
                <TableHead>Customer Name</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead className="text-right">Taxable</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proFormas.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-8 text-center text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2 text-primary" />
                    Loading pro forma register…
                  </TableCell>
                </TableRow>
              ) : filtered.length ? (
                filtered.map((pf) => (
                  <TableRow
                    key={pf.id}
                    onClick={() => setViewProForma(pf)}
                    className="hover:bg-muted/50 transition-colors cursor-pointer group"
                  >
                    <TableCell className="p-4 font-mono font-bold text-foreground">
                      <div className="flex items-center gap-1.5 group-hover:text-primary dark:group-hover:text-primary transition-colors">
                        <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{pf.proFormaNumber}</span>
                        <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 text-primary" />
                      </div>
                    </TableCell>
                    <TableCell className="p-4 font-medium text-foreground">{pf.customerName}</TableCell>
                    <TableCell className="p-4 font-mono text-muted-foreground">{pf.issueDate ? pf.issueDate.slice(0, 10) : '—'}</TableCell>
                    <TableCell className="p-4 font-mono text-muted-foreground">{pf.validUntil ? pf.validUntil.slice(0, 10) : '—'}</TableCell>
                    <TableCell className="p-4 text-right font-mono">{formatCurrency(pf.taxableAmount)}</TableCell>
                    <TableCell className="p-4 text-right font-mono font-bold text-foreground">
                      {formatCurrency(pf.totalAmount)}
                    </TableCell>
                    <TableCell className="p-4 text-center">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                          pf.status === 'CONVERTED'
                            ? 'bg-muted text-foreground border-border'
                            : 'bg-muted text-foreground border-border'
                        }`}
                      >
                        {pf.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="p-8 text-center text-muted-foreground">
                    No pro forma invoices found matching current criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Details & Conversion Inspector Modal */}
      {viewProForma && (
        <ProFormaModal
          isOpen={Boolean(viewProForma)}
          onClose={() => setViewProForma(null)}
          entityId={entityId}
          viewProForma={viewProForma}
          onSaveProForma={saveProForma}
        />
      )}
    </main>
  );
}
