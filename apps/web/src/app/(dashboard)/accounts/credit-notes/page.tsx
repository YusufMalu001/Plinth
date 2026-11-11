'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileMinus,
  Search,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  Plus,
  ChevronRight,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import {
  Card,
  Button,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@plinth/ui';
import { accountsApi } from '@/features/accounts/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { DebitCreditNoteModal } from '@/features/accounts/components/DebitCreditNoteModal';
import { DebitCreditNote } from '@/features/accounts/types';
import { formatCurrency } from '@/features/accounts/utils';

export default function CreditNotesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [search, setSearch] = useState('');
  const [partyFilter, setPartyFilter] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [viewNote, setViewNote] = useState<DebitCreditNote | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

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

  const notes = useQuery({
    queryKey: ['accounts', 'notes', entityId],
    queryFn: () => accountsApi.arCreditNotes(entityId),
    enabled: Boolean(entityId),
  });

  const allCreditNotes = notes.data || [];
  const filtered = allCreditNotes.filter((n) => {
    const matchesSearch =
      !search ||
      n.noteNumber.toLowerCase().includes(search.toLowerCase()) ||
      n.partyName.toLowerCase().includes(search.toLowerCase());
    const matchesParty = !partyFilter || n.partyType === partyFilter;
    const matchesDate = !selectedDate || (n.issueDate && n.issueDate.startsWith(selectedDate));
    return matchesSearch && matchesParty && matchesDate;
  });

  const totalValue = allCreditNotes.reduce((sum, n) => sum + parseFloat(n.totalAmount || '0'), 0);
  const customerReturnsCount = allCreditNotes.filter((n) => n.partyType === 'CUSTOMER').length;
  const supplierCreditsCount = allCreditNotes.filter((n) => n.partyType === 'VENDOR').length;
  const postedCount = allCreditNotes.filter((n) => n.status === 'POSTED').length;

  return (
    <>
      <main className="flex-1 space-y-4 p-5 md:p-8">
        <AccountsHeader
          title="Credit Notes & Returns Workbench"
          entities={entities.data || []}
          selectedEntityId={entityId}
          onSelectEntity={setSelectedEntityId}
          activePeriod={periods.data?.find((p) => p.status === 'OPEN')?.code}
          dateFilter={selectedDate}
          onDateChange={setSelectedDate}
          actionButton={
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm rounded-xl text-xs"
            >
              <Plus className="h-4 w-4" />
              Create Credit Note
            </Button>
          }
        />

        {/* Compact 4 Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1 */}
          <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                Total Credit Value
              </span>
              <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
                <FileMinus className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground truncate">
              {notes.isLoading ? '—' : formatCurrency(totalValue)}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
              {allCreditNotes.length} credit note{allCreditNotes.length === 1 ? '' : 's'} issued
            </p>
          </div>

          {/* Card 2 */}
          <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                Customer Sales Returns
              </span>
              <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
              {notes.isLoading ? '—' : customerReturnsCount}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
              Rebates &amp; restock adjustments
            </p>
          </div>

          {/* Card 3 */}
          <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                Supplier Credit Notes
              </span>
              <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
              {notes.isLoading ? '—' : supplierCreditsCount}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
              Vendor allowances received
            </p>
          </div>

          {/* Card 4 */}
          <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                Posted to Ledger
              </span>
              <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
              {notes.isLoading ? '—' : postedCount}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
              General ledger adjusted
            </p>
          </div>
        </div>

        {/* Toolbar Row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Credit Notes Register
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              {filtered.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                placeholder="Search note or party..."
                className="rounded-xl border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none w-48 sm:w-60 transition"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              aria-label="Filter by Party"
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
              value={partyFilter}
              onChange={(e) => setPartyFilter(e.target.value)}
            >
              <option value="">All Parties</option>
              <option value="CUSTOMER">Customer (AR Rebates)</option>
              <option value="VENDOR">Vendor (AP Credits)</option>
            </select>
          </div>
        </div>

        {/* Credit Notes Register Table */}
        <Card className="shadow-sm overflow-hidden rounded-xl border border-border/80">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Credit Note No.</TableHead>
                  <TableHead>Party Name</TableHead>
                  <TableHead>Party Type</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Original Invoice</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notes.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="p-8 text-center text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2 text-primary" />
                      Loading credit notes…
                    </TableCell>
                  </TableRow>
                ) : filtered.length ? (
                  filtered.map((note) => (
                    <TableRow
                      key={note.id}
                      onClick={() => router.push(`/accounts/credit-notes/${note.id}`)}
                      className="hover:bg-muted/50 transition-colors cursor-pointer group"
                    >
                      <TableCell className="p-4 font-mono font-bold text-foreground">
                        <div className="flex items-center gap-1.5 group-hover:text-primary transition-colors">
                          <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>{note.noteNumber}</span>
                          <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 text-primary" />
                        </div>
                      </TableCell>
                      <TableCell className="p-4 font-medium text-foreground">{note.partyName}</TableCell>
                      <TableCell className="p-4">
                        <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-foreground border border-border">
                          {note.partyType}
                        </span>
                      </TableCell>
                      <TableCell className="p-4 font-mono text-muted-foreground">{note.issueDate ? note.issueDate.slice(0, 10) : '—'}</TableCell>
                      <TableCell className="p-4 font-mono text-muted-foreground">{note.originalInvoiceNumber || '—'}</TableCell>
                      <TableCell className="p-4 text-muted-foreground">{note.reasonCode}</TableCell>
                      <TableCell className="p-4 text-right font-mono">{formatCurrency(note.taxableAmount)}</TableCell>
                      <TableCell className="p-4 text-right font-mono font-bold text-foreground">
                        {formatCurrency(note.totalAmount)}
                      </TableCell>
                      <TableCell className="p-4 text-center">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                            note.status === 'POSTED'
                              ? 'bg-muted text-foreground border-border'
                              : 'bg-muted/60 text-muted-foreground border-border/80'
                          }`}
                        >
                          {note.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="p-8 text-center text-muted-foreground">
                      No credit notes found matching current criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </main>

      {/* Create Modal */}
      {isCreateModalOpen && (
        <DebitCreditNoteModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          entityId={entityId}
          defaultType="CREDIT"
          defaultPartyType="CUSTOMER"
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['accounts', 'notes', entityId] });
            queryClient.invalidateQueries({ queryKey: ['accounts', 'ar'] });
            queryClient.invalidateQueries({ queryKey: ['accounts', 'ap'] });
          }}
        />
      )}

      {/* Inspect View Modal */}
      {viewNote && (
        <DebitCreditNoteModal
          isOpen={Boolean(viewNote)}
          onClose={() => setViewNote(null)}
          entityId={entityId}
          viewNote={viewNote}
        />
      )}
    </>
  );
}
