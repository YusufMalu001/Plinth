'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FilePlus,
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  ArrowUpRight,
  ChevronRight,
  PackageCheck,
  FileText,
  CheckCircle2,
  Pencil,
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
} from '@synergy/ui';
import { accountsApi } from '@/features/accounts/api';
import { fetchApi } from '@/features/api/client';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { DebitCreditNoteModal } from '@/features/accounts/components/DebitCreditNoteModal';
import { EditGrnDebitNoteModal } from '@/features/accounts/components/EditGrnDebitNoteModal';
import { DebitCreditNote } from '@/features/accounts/types';
import { formatCurrency } from '@/features/accounts/utils';
import { useRouter } from 'next/navigation';

interface GrnDebitNoteClaim {
  id: string;
  debitNoteNumber: string;
  grnId: string;
  poId?: string | null;
  status: string;
  reason: string;
  totalAmount: string | number;
  createdAt: string;
  vendor?: { name?: string | null; legalName?: string | null } | null;
  grn?: { grnNumber: string; status: string } | null;
  po?: { poNumber: string; status: string } | null;
}

export default function DebitNotesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [activeTab, setActiveTab] = useState<'claims' | 'register'>('claims');
  const [search, setSearch] = useState('');
  const [partyFilter, setPartyFilter] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewNote, setViewNote] = useState<DebitCreditNote | null>(null);
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);

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
    queryFn: () => accountsApi.notes(entityId),
    enabled: Boolean(entityId),
  });

  const grnClaims = useQuery({
    queryKey: ['accounts', 'ap', 'grn-debit-note-claims'],
    queryFn: () => fetchApi<GrnDebitNoteClaim[]>('/debit-notes'),
  });

  const allDebitNotes = (notes.data || []).filter((n) => n.noteType === 'DEBIT');
  const filteredNotes = allDebitNotes.filter((n) => {
    const matchesSearch =
      !search ||
      n.noteNumber.toLowerCase().includes(search.toLowerCase()) ||
      n.partyName.toLowerCase().includes(search.toLowerCase());
    const matchesParty = !partyFilter || n.partyType === partyFilter;
    const matchesDate = !selectedDate || (n.issueDate && n.issueDate.startsWith(selectedDate));
    return matchesSearch && matchesParty && matchesDate;
  });

  const allClaims = (grnClaims.data || []).filter((claim) => claim.grnId);
  const filteredClaims = allClaims.filter((claim) => {
    const vendorName = claim.vendor?.legalName || claim.vendor?.name || '';
    const matchesSearch =
      !search ||
      claim.debitNoteNumber.toLowerCase().includes(search.toLowerCase()) ||
      vendorName.toLowerCase().includes(search.toLowerCase()) ||
      claim.reason.toLowerCase().includes(search.toLowerCase());
    const matchesDate = !selectedDate || (claim.createdAt && claim.createdAt.startsWith(selectedDate));
    return matchesSearch && matchesDate;
  });

  const totalValue = allDebitNotes.reduce((sum, n) => sum + parseFloat(n.totalAmount || '0'), 0);
  const vendorClaimsCount = allDebitNotes.filter((n) => n.partyType === 'VENDOR').length;
  const customerDebitsCount = allDebitNotes.filter((n) => n.partyType === 'CUSTOMER').length;
  const settledCount = allDebitNotes.filter((n) => n.status === 'APPROVED' || n.status === 'RECORDED').length;

  const handleCreateNote = async (_noteData: any) => {
    await queryClient.invalidateQueries({ queryKey: ['accounts', 'notes'] });
  };

  return (
    <>
      <main className="flex-1 space-y-4 p-5 md:p-8">
        <AccountsHeader
          title="Debit Notes & Claims Workbench"
          entities={entities.data || []}
          selectedEntityId={entityId}
          onSelectEntity={setSelectedEntityId}
          activePeriod={periods.data?.find((p) => p.status === 'OPEN')?.code}
          dateFilter={selectedDate}
          onDateChange={setSelectedDate}
          actionButton={
            <Button
              onClick={() => setIsModalOpen(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm rounded-xl text-xs"
            >
              <Plus className="h-4 w-4" />
              Issue Debit Note
            </Button>
          }
        />

        {/* Compact 4 Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1 */}
          <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                Total Claims Value
              </span>
              <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
                <FilePlus className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground truncate">
              {notes.isLoading ? '—' : formatCurrency(totalValue)}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
              {allDebitNotes.length} debit note{allDebitNotes.length === 1 ? '' : 's'} registered
            </p>
          </div>

          {/* Card 2 */}
          <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                Vendor Shortage Claims
              </span>
              <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
              {notes.isLoading ? '—' : vendorClaimsCount}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
              Physical shortage &amp; rate claims
            </p>
          </div>

          {/* Card 3 */}
          <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                Customer Debit Notes
              </span>
              <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
                <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
              {notes.isLoading ? '—' : customerDebitsCount}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
              Additional freight &amp; price revision
            </p>
          </div>

          {/* Card 4 */}
          <div className="rounded-xl border border-border/80 bg-card p-3 shadow-none transition hover:border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                Settled &amp; Posted
              </span>
              <span className="rounded-lg p-1.5 border border-border bg-muted text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-1 text-xl font-bold font-mono tracking-tight text-foreground">
              {notes.isLoading ? '—' : settledCount}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
              Reconciled against books
            </p>
          </div>
        </div>

        {/* Tabs and Toolbar Row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
          {/* View Tabs */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab('claims')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                activeTab === 'claims'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <PackageCheck className="h-3.5 w-3.5" />
              Supplier Claims from GRNs
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  activeTab === 'claims' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                }`}
              >
                {allClaims.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('register')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                activeTab === 'register'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Debit Notes Register
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  activeTab === 'register' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                }`}
              >
                {allDebitNotes.length}
              </span>
            </button>
          </div>

          {/* Filters Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                placeholder={activeTab === 'claims' ? "Search claim, supplier, reason..." : "Search note or party..."}
                className="rounded-xl border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none w-48 sm:w-60 transition"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {activeTab === 'register' && (
              <select
                aria-label="Filter by Party"
                className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition"
                value={partyFilter}
                onChange={(e) => setPartyFilter(e.target.value)}
              >
                <option value="">All Parties</option>
                <option value="VENDOR">Vendor (AP Claims)</option>
                <option value="CUSTOMER">Customer (AR Debits)</option>
              </select>
            )}
          </div>
        </div>

        {/* Tab 1: Supplier Claims from GRNs */}
        {activeTab === 'claims' && (
          <Card className="shadow-sm overflow-hidden rounded-xl border border-border/80">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Claim No.</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Linked GRN / PO</TableHead>
                    <TableHead>Discrepancy Reason</TableHead>
                    <TableHead className="text-right">Claim Value</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grnClaims.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="p-8 text-center text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2 text-primary" />
                        Loading supplier claims…
                      </TableCell>
                    </TableRow>
                  ) : grnClaims.isError ? (
                    <TableRow>
                      <TableCell colSpan={7} className="p-8 text-center text-rose-700">
                        Could not load GRN supplier claims.
                      </TableCell>
                    </TableRow>
                  ) : filteredClaims.length ? (
                    filteredClaims.map((note) => (
                      <TableRow
                        key={note.id}
                        onClick={() => router.push(`/debit-notes/${note.id}`)}
                        className="hover:bg-muted/50 transition-colors cursor-pointer group"
                      >
                        <TableCell className="p-4 font-mono font-bold text-foreground">
                          <div className="flex items-center gap-1.5 group-hover:text-primary transition-colors">
                            <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span>{note.debitNoteNumber}</span>
                            <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0 text-primary" />
                          </div>
                        </TableCell>
                        <TableCell className="p-4 font-medium text-foreground">
                          {note.vendor?.legalName || note.vendor?.name || 'Supplier'}
                        </TableCell>
                        <TableCell className="p-4 font-mono text-muted-foreground">
                          {note.grn?.grnNumber || 'GRN'} / {note.po?.poNumber || 'PO'}
                        </TableCell>
                        <TableCell className="p-4 text-muted-foreground max-w-64 truncate" title={note.reason}>
                          {note.reason}
                        </TableCell>
                        <TableCell className="p-4 text-right font-mono font-bold text-foreground">
                          {formatCurrency(note.totalAmount)}
                        </TableCell>
                        <TableCell className="p-4 text-center">
                          <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold text-foreground border border-border">
                            {note.status.replaceAll('_', ' ')}
                          </span>
                        </TableCell>
                        <TableCell className="p-3 text-right">
                          {['DRAFT', 'RECORDED'].includes(note.status) ? (
                            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={(event) => { event.stopPropagation(); setEditingClaimId(note.id); }}>
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </Button>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="p-8 text-center text-muted-foreground">
                        No supplier claims found matching current criteria.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        {/* Tab 2: Debit Notes Register */}
        {activeTab === 'register' && (
          <Card className="shadow-sm overflow-hidden rounded-xl border border-border/80">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Note No.</TableHead>
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
                        Loading debit notes…
                      </TableCell>
                    </TableRow>
                  ) : filteredNotes.length ? (
                    filteredNotes.map((note) => (
                      <TableRow
                        key={note.id}
                        onClick={() => setViewNote(note)}
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
                              note.status === 'RECORDED' || note.status === 'APPROVED' || note.status === 'POSTED'
                                ? 'bg-muted text-foreground border-border'
                                : 'bg-muted text-foreground border-border'
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
                        No debit notes found matching current criteria.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </main>

      {/* Creation Modal */}
      <DebitCreditNoteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        entityId={entityId}
        defaultType="DEBIT"
        onSubmit={handleCreateNote}
      />

      {/* View Modal */}
      {viewNote && (
        <DebitCreditNoteModal
          isOpen={Boolean(viewNote)}
          onClose={() => setViewNote(null)}
          entityId={entityId}
          onSubmit={async () => {}}
          viewNote={viewNote}
        />
      )}
      {editingClaimId && (
        <EditGrnDebitNoteModal
          id={editingClaimId}
          onClose={() => setEditingClaimId(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['accounts', 'ap', 'grn-debit-note-claims'] });
            queryClient.invalidateQueries({ queryKey: ['accounts', 'notes'] });
            queryClient.invalidateQueries({ queryKey: ['accounts', 'ap'] });
          }}
        />
      )}
    </>
  );
}
