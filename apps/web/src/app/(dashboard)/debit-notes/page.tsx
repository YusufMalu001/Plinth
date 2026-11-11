'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileCheck2, ReceiptText, ExternalLink, Building2 } from 'lucide-react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@plinth/ui';
import { fetchApi } from '../../../features/api/client';

interface DebitNote {
  id: string;
  debitNoteNumber: string;
  vendorId: string;
  grnId?: string;
  poId?: string;
  status: string;
  reason: string;
  currency: string;
  totalAmount: string | number;
  createdAt: string;
  vendor?: { id: string; name: string; code: string; legalName?: string } | null;
  grn?: { id: string; grnNumber: string; status: string } | null;
  po?: { id: string; poNumber: string; status: string } | null;
}

export default function DebitNotesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['debit-notes'],
    queryFn: () => fetchApi<DebitNote[]>('/debit-notes'),
    staleTime: 15_000,
  });

  const notes = data ?? [];
  const pending = notes.filter((note) =>
    ['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED'].includes(note.status)
  ).length;
  const recorded = notes.filter((note) => note.status === 'RECORDED' || note.status === 'APPROVED').length;

  return (
    <main className="flex-1 overflow-y-auto bg-muted/20 p-6 md:p-8">
      <div className="mx-auto w-full space-y-6">
        <PageHeader
          title="Debit notes"
          description="Finance-ready discrepancy records generated from validated receiving evidence."
        />

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">
                Open review queue
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black font-mono">{pending}</div>
              <p className="text-xs text-muted-foreground">Store Manager and Admin actions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">
                Recorded notes
              </CardTitle>
              <FileCheck2 className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black font-mono">{recorded}</div>
              <p className="text-xs text-muted-foreground">Created directly without a decision workflow</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">
                Total records
              </CardTitle>
              <ReceiptText className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black font-mono">{notes.length}</div>
              <p className="text-xs text-muted-foreground">Linked to PO / GRN evidence</p>
            </CardContent>
          </Card>
        </div>

        {/* Register Table */}
        <Card>
          <CardHeader>
            <CardTitle>Discrepancy register</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isError ? (
              <div className="p-10 text-center text-sm text-destructive">
                Unable to load debit notes.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Debit note</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Source GRN</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                          Loading debit notes…
                        </TableCell>
                      </TableRow>
                    ) : notes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                          No debit notes have been generated.
                        </TableCell>
                      </TableRow>
                    ) : (
                      notes.map((note) => {
                        const vendorName = note.vendor?.name || note.vendor?.legalName || 'Vendor';
                        const vendorCode = note.vendor?.code;
                        const grnNumber = note.grn?.grnNumber || note.grnId || '—';

                        return (
                          <TableRow key={note.id} className="hover:bg-muted/30">
                            <TableCell className="font-mono font-semibold">
                              <Link
                                className="text-primary hover:underline font-bold"
                                href={`/debit-notes/${note.id}`}
                              >
                                {note.debitNoteNumber}
                              </Link>
                            </TableCell>

                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Building2 size={13} className="text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                  <p className="font-medium text-foreground text-xs leading-snug truncate">
                                    {vendorName}
                                  </p>
                                  {vendorCode && (
                                    <p className="font-mono text-[10px] text-muted-foreground">
                                      {vendorCode}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            <TableCell>
                              {note.grnId ? (
                                <Link
                                  href={`/receiving/goods-receipts/${note.grnId}`}
                                  className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                                >
                                  <span>{grnNumber}</span>
                                  <ExternalLink size={10} className="text-muted-foreground" />
                                </Link>
                              ) : (
                                <span className="font-mono text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>

                            <TableCell>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${
                                  note.status === 'RECORDED' || note.status === 'APPROVED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : note.status === 'SUBMITTED'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {note.status === 'RECORDED' ? 'RECORDED' : note.status.replaceAll('_', ' ')}
                              </span>
                            </TableCell>

                            <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                              {note.reason}
                            </TableCell>

                            <TableCell className="font-mono font-semibold text-xs text-foreground">
                              {note.currency} {Number(note.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </TableCell>

                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(note.createdAt).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
