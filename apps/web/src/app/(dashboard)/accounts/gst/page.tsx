'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileCode,
  Download,
  Printer,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@synergy/ui';
import { accountsApi } from '@/features/accounts/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { MetricCard } from '@/features/accounts/components/MetricCard';
import { formatCurrency } from '@/features/accounts/utils';

export default function GstWorkbenchPage() {
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [period, setPeriod] = useState('2026-09');
  const [activeTab, setActiveTab] = useState<'GSTR1' | 'GSTR2B' | 'GSTR3B'>('GSTR1');

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

  const workpaper = useQuery({
    queryKey: ['accounts', 'gst-workpaper', entityId, period],
    queryFn: () => accountsApi.gstWorkpaper(entityId, period),
    enabled: Boolean(entityId),
  });

  const data = workpaper.data;

  return (
    <main className="flex-1 space-y-6 p-5 md:p-8">
      <AccountsHeader
        title="GST Workbench & ITC Matching"
        entities={entities.data || []}
        selectedEntityId={entityId}
        onSelectEntity={setSelectedEntityId}
        activePeriod={periods.data?.find((p) => p.status === 'OPEN')?.code}
        actionButton={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs rounded-xl"
              onClick={() => window.print()}
            >
              <Printer className="h-3.5 w-3.5" />
              Print Workpaper
            </Button>
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 rounded-xl text-xs"
              onClick={() => {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `GST_Workpaper_${period}_${data?.entityGstin || 'GSTIN'}.json`;
                a.click();
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Export Portal JSON
            </Button>
          </div>
        }
      />

      {/* Period Selector & GST Tabs Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-foreground">Return Period:</label>
          <input
            type="month"
            className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
          {data?.entityGstin && (
            <span className="rounded-xl bg-muted px-3 py-1 text-xs font-mono text-muted-foreground">
              GSTIN: <strong className="text-foreground">{data.entityGstin}</strong>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 rounded-2xl border border-border/80 bg-muted/20 p-1">
          <button
            onClick={() => setActiveTab('GSTR1')}
            className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'GSTR1'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            GSTR-1 (Outward Supplies)
          </button>
          <button
            onClick={() => setActiveTab('GSTR2B')}
            className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'GSTR2B'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            GSTR-2B (ITC Matching)
          </button>
          <button
            onClick={() => setActiveTab('GSTR3B')}
            className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'GSTR3B'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            GSTR-3B (Tax Computation)
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      {data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Outward Taxable (GSTR-1)"
            value={formatCurrency(data.gstr1.totalTaxable)}
            subtitle="B2B + B2C + Export supplies"
            icon={TrendingUp}
            variant="default"
          />
          <MetricCard
            title="Total Output GST Billed"
            value={formatCurrency(data.gstr1.totalOutputTax)}
            subtitle="Gross tax liability"
            icon={ArrowUpRight}
            variant="primary"
          />
          <MetricCard
            title="Eligible Input Tax Credit (2B)"
            value={formatCurrency(data.gstr2b.totalEligibleItc)}
            subtitle={`${data.gstr2b.totalSuppliersMatched} suppliers verified`}
            icon={ArrowDownLeft}
            variant="success"
          />
          <MetricCard
            title="Net Cash Tax Payable (3B)"
            value={formatCurrency(data.gstr3b.netPayableTax)}
            subtitle="Output GST minus eligible ITC"
            icon={FileCode}
            variant="warning"
          />
        </div>
      )}

      {/* Tab 1: GSTR-1 Outward Supplies Tables */}
      {activeTab === 'GSTR1' && data && (
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardHeader className="border-b border-border/70 p-5">
            <CardTitle className="text-base font-bold">GSTR-1 Outward Supply Tables</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Classified outward supplies for direct accountant review and GSTN portal filing
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="w-full text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Table No.</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Classification & Description</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Taxable Value (₹)</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Tax Component (₹)</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Total Invoice Value (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60 font-mono">
                  <TableRow className="hover:bg-muted/30">
                    <TableCell className="p-3 font-bold text-foreground">Table 4A / 4B</TableCell>
                    <TableCell className="p-3 font-sans font-medium text-foreground">
                      B2B Invoices (Registered Customers with valid GSTIN)
                    </TableCell>
                    <TableCell className="p-3 text-right">{formatCurrency(data.gstr1.b2bTaxable)}</TableCell>
                    <TableCell className="p-3 text-right">{formatCurrency(data.gstr1.b2bTax)}</TableCell>
                    <TableCell className="p-3 text-right font-bold">
                      {formatCurrency(parseFloat(data.gstr1.b2bTaxable) + parseFloat(data.gstr1.b2bTax))}
                    </TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-muted/30">
                    <TableCell className="p-3 font-bold text-foreground">Table 7</TableCell>
                    <TableCell className="p-3 font-sans font-medium text-foreground">
                      B2C Small Supplies (Unregistered Retail & Direct Dispatches)
                    </TableCell>
                    <TableCell className="p-3 text-right">{formatCurrency(data.gstr1.b2csTaxable)}</TableCell>
                    <TableCell className="p-3 text-right">{formatCurrency(data.gstr1.b2csTax)}</TableCell>
                    <TableCell className="p-3 text-right font-bold">
                      {formatCurrency(parseFloat(data.gstr1.b2csTaxable) + parseFloat(data.gstr1.b2csTax))}
                    </TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-muted/30">
                    <TableCell className="p-3 font-bold text-foreground">Table 9B</TableCell>
                    <TableCell className="p-3 font-sans font-medium text-foreground">
                      Credit / Debit Notes (CDNR Registered Adjustments)
                    </TableCell>
                    <TableCell className="p-3 text-right text-rose-600 dark:text-rose-400">
                      {formatCurrency(data.gstr1.cdnrTaxable)}
                    </TableCell>
                    <TableCell className="p-3 text-right text-rose-600 dark:text-rose-400">
                      {formatCurrency(data.gstr1.cdnrTax)}
                    </TableCell>
                    <TableCell className="p-3 text-right font-bold text-rose-600 dark:text-rose-400">
                      {formatCurrency(parseFloat(data.gstr1.cdnrTaxable) + parseFloat(data.gstr1.cdnrTax))}
                    </TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-muted/30">
                    <TableCell className="p-3 font-bold text-foreground">Table 12</TableCell>
                    <TableCell className="p-3 font-sans font-medium text-foreground">
                      HSN / SAC Summary of Outward Supplies
                    </TableCell>
                    <TableCell className="p-3 text-right">{formatCurrency(data.gstr1.hsnTotalValue)}</TableCell>
                    <TableCell className="p-3 text-right">{formatCurrency(data.gstr1.totalOutputTax)}</TableCell>
                    <TableCell className="p-3 text-right font-bold">
                      {formatCurrency(parseFloat(data.gstr1.hsnTotalValue) + parseFloat(data.gstr1.totalOutputTax))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between border-t border-border/70 bg-muted/30 p-4 text-xs font-mono font-bold">
              <span className="font-sans">Total GSTR-1 Outward Summary:</span>
              <div className="flex gap-6">
                <span>Taxable: {formatCurrency(data.gstr1.totalTaxable)}</span>
                <span className="text-primary">
                  Total Output Tax: {formatCurrency(data.gstr1.totalOutputTax)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 2: GSTR-2B ITC Matching */}
      {activeTab === 'GSTR2B' && data && (
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardHeader className="border-b border-border/70 p-5">
            <CardTitle className="text-base font-bold">GSTR-2B Auto-Drafted ITC Matching</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Comparison between captured supplier bills (AP) and auto-drafted ITC statement from GSTN
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs">
                  <span className="text-muted-foreground block">Matched & Eligible ITC:</span>
                  <span className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-1 block">
                    {formatCurrency(data.gstr2b.matchedItc)}
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Confirmed in supplier GSTR-1 filings
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs">
                  <span className="text-muted-foreground block">Missing in 2B (Pending ITC):</span>
                  <span className="text-lg font-bold font-mono text-amber-700 dark:text-amber-400 mt-1 block">
                    {formatCurrency(data.gstr2b.missingIn2bItc)}
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {data.gstr2b.totalSuppliersPending} suppliers pending return upload
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-muted/30 p-4 text-xs">
                  <span className="text-muted-foreground block">Blocked / Ineligible ITC (Section 17(5)):</span>
                  <span className="text-lg font-bold font-mono text-foreground mt-1 block">
                    {formatCurrency(data.gstr2b.ineligibleItc)}
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Excluded from input credit claims
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: GSTR-3B Tax Computation */}
      {activeTab === 'GSTR3B' && data && (
        <Card className="rounded-2xl border-border/80 shadow-none">
          <CardHeader className="border-b border-border/70 p-5">
            <CardTitle className="text-base font-bold">GSTR-3B Tax Liability & Settlement</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Net cash tax liability computation after cross-utilization of IGST, CGST and SGST credits
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="w-full text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Tax Head</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Output Tax Liability (₹)</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Eligible ITC (₹)</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Net Cash Payable (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60 font-mono">
                  <TableRow className="hover:bg-muted/30">
                    <TableCell className="p-3 font-sans font-bold text-foreground">Integrated Tax (IGST)</TableCell>
                    <TableCell className="p-3 text-right">{formatCurrency(data.gstr3b.outwardIgst)}</TableCell>
                    <TableCell className="p-3 text-right">{formatCurrency(data.gstr3b.eligibleItcIgst)}</TableCell>
                    <TableCell className="p-3 text-right font-bold text-primary">
                      {formatCurrency(parseFloat(data.gstr3b.outwardIgst) - parseFloat(data.gstr3b.eligibleItcIgst))}
                    </TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-muted/30">
                    <TableCell className="p-3 font-sans font-bold text-foreground">Central Tax (CGST)</TableCell>
                    <TableCell className="p-3 text-right">{formatCurrency(data.gstr3b.outwardCgst)}</TableCell>
                    <TableCell className="p-3 text-right">{formatCurrency(data.gstr3b.eligibleItcCgst)}</TableCell>
                    <TableCell className="p-3 text-right font-bold text-primary">
                      {formatCurrency(parseFloat(data.gstr3b.outwardCgst) - parseFloat(data.gstr3b.eligibleItcCgst))}
                    </TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-muted/30">
                    <TableCell className="p-3 font-sans font-bold text-foreground">State Tax (SGST)</TableCell>
                    <TableCell className="p-3 text-right">{formatCurrency(data.gstr3b.outwardSgst)}</TableCell>
                    <TableCell className="p-3 text-right">{formatCurrency(data.gstr3b.eligibleItcSgst)}</TableCell>
                    <TableCell className="p-3 text-right font-bold text-primary">
                      {formatCurrency(parseFloat(data.gstr3b.outwardSgst) - parseFloat(data.gstr3b.eligibleItcSgst))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between border-t border-border/70 bg-muted/30 p-4 text-xs font-mono font-bold">
              <span className="font-sans">Total Net Payable (GSTR-3B):</span>
              <span className="text-sm font-bold text-primary">
                {formatCurrency(data.gstr3b.netPayableTax)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
