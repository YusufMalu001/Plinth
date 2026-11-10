'use client';

import { Checkbox } from '@synergy/ui';
import React, { FormEvent, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CalendarDays,
  BookMarked,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@synergy/ui';
import { accountsApi } from '@/features/accounts/api';
import { AccountsHeader } from '@/features/accounts/components/AccountsHeader';
import { MetricCard } from '@/features/accounts/components/MetricCard';
import { AccountingEntity, AccountingPeriod, LedgerAccount } from '@/features/accounts/types';

export default function AccountsSetupPage() {
  const queryClient = useQueryClient();

  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [activeTab, setActiveTab] = useState<'BOOK' | 'PERIODS' | 'CHART' | 'MAPPINGS'>('BOOK');
  const [mappingChoices, setMappingChoices] = useState<Record<string, string>>({});

  // Form states
  const [period, setPeriod] = useState({ code: '', fiscalYear: '', startsOn: '', endsOn: '' });
  const [account, setAccount] = useState({ code: '', name: '', type: 'ASSET', isControl: false, tallyLedger: '' });
  const [verificationReference, setVerificationReference] = useState('');

  const [pending, setPending] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'CHART') setActiveTab('CHART');
  }, []);

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

  const chart = useQuery({
    queryKey: ['accounts', 'chart', entityId],
    queryFn: () => accountsApi.chart(entityId),
    enabled: Boolean(entityId),
  });
  const mappings = useQuery({ queryKey: ['accounts', 'ar-mappings', entityId], queryFn: () => accountsApi.arMappings(entityId), enabled: Boolean(entityId) });

  const selectedEntity = entities.data?.find((e: AccountingEntity) => e.id === entityId);

  const execute = async (action: () => Promise<unknown>, successMsg: string) => {
    setPending(true);
    setNotification(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setNotification({ type: 'success', message: successMsg });
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Setup action failed.' });
    } finally {
      setPending(false);
    }
  };

  const handleCreatePeriod = (e: FormEvent) => {
    e.preventDefault();
    void execute(async () => {
      await accountsApi.createPeriod({ entityId, ...period });
      setPeriod({ code: '', fiscalYear: 'FY2026-27', startsOn: '', endsOn: '' });
    }, 'Accounting period opened successfully.');
  };

  const handleCreateAccount = (e: FormEvent) => {
    e.preventDefault();
    void execute(async () => {
      await accountsApi.createAccount({ entityId, ...account });
      setAccount({ code: '', name: '', type: 'ASSET', isControl: false, tallyLedger: '' });
    }, 'Ledger account created in chart of accounts.');
  };

  const saveMapping = (mappingKey: string) => {
    const accountId = mappingChoices[mappingKey] || mappings.data?.find(mapping => mapping.mappingKey === mappingKey)?.accountId;
    if (!accountId) { setNotification({ type: 'error', message: `Select a ledger for ${mappingKey}.` }); return; }
    void execute(() => accountsApi.saveArMapping(mappingKey, { entityId, accountId }), `${mappingKey} mapping saved.`);
  };

  return (
    <main className="flex-1 space-y-6 p-5 md:p-8">
      <AccountsHeader
        title="Chart of Accounts & Book Setup"
        entities={entities.data || []}
        selectedEntityId={entityId}
        onSelectEntity={setSelectedEntityId}
        activePeriod={periods.data?.find((p: AccountingPeriod) => p.status === 'OPEN')?.code}
      />

      {/* Notifications */}
      {notification && (
        <div
          className={`flex items-center justify-between rounded-2xl p-4 text-xs font-medium border ${
            notification.type === 'success'
              ? 'border-primary/20 bg-primary/10 text-primary dark:text-primary'
              : 'border-destructive/30 bg-destructive/100/10 text-destructive dark:text-destructive'
          }`}
        >
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-muted-foreground hover:text-foreground">
            Dismiss
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Configured Ledgers"
          value={chart.data?.length ?? 0}
          subtitle="Chart of accounts master"
          icon={BookMarked}
          variant="primary"
        />
        <MetricCard
          title="Accounting Periods"
          value={periods.data?.length ?? 0}
          subtitle={`${periods.data?.filter((p: AccountingPeriod) => p.status === 'OPEN').length ?? 0} open for posting`}
          icon={CalendarDays}
          variant="default"
        />
        <MetricCard
          title="Legal Status"
          value={selectedEntity?.status || 'CONFIGURING'}
          subtitle={`GSTIN: ${selectedEntity?.gstin || 'None'}`}
          icon={Building2}
          variant={selectedEntity?.status === 'ACTIVE' ? 'success' : 'warning'}
        />
        <MetricCard
          title="Maker-Checker Security"
          value="Enabled"
          subtitle="Dual-control authorization"
          icon={ShieldCheck}
          variant="success"
        />
      </div>

      {/* Setup Sub Tabs */}
      <div className="flex items-center gap-1.5 rounded-2xl border border-border/80 bg-muted/20 p-1 w-fit">
        <button
          onClick={() => setActiveTab('BOOK')}
          className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition-all ${
            activeTab === 'BOOK'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Synergy Setup
        </button>
        <button
          onClick={() => setActiveTab('PERIODS')}
          className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition-all ${
            activeTab === 'PERIODS'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Accounting Periods
        </button>
        <button
          onClick={() => setActiveTab('CHART')}
          className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition-all ${
            activeTab === 'CHART'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Chart of Accounts
        </button>
        <button
          onClick={() => setActiveTab('MAPPINGS')}
          className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition-all ${activeTab === 'MAPPINGS' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Sales Posting Mappings
        </button>
      </div>

      {/* Synergy is the single company context for this installation. */}
      {activeTab === 'BOOK' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {!selectedEntity && (
            <Card className="rounded-2xl border-border/80 shadow-none p-5">
              <CardHeader className="p-0 pb-4 border-b border-border/70">
                <CardTitle className="text-base font-bold">Synergy International Accounts Setup</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">This platform is configured for Synergy International only.</p>
              </CardHeader>
              <CardContent className="p-0 pt-4 text-sm text-muted-foreground">
                This one-time setup prepares the existing Synergy International company for accounting. It does not create or register another company.
                <div className="pt-4">
                  <Button
                    onClick={() => void execute(() => accountsApi.initializeSynergyBook(), 'Synergy International Accounts setup initialized.')}
                    disabled={pending}
                    className="bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl text-xs"
                  >
                    {pending ? 'Initializing…' : 'Set Up Synergy Accounts'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {selectedEntity && (
            <Card className="rounded-2xl border-border/80 shadow-none p-5">
              <CardHeader className="p-0 pb-4 border-b border-border/70">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold">Independent Activation Review</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Maker-checker authorization for opening the book for journal drafting
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      selectedEntity.status === 'ACTIVE'
                        ? 'bg-primary/10 text-primary dark:text-primary'
                        : 'bg-muted text-foreground dark:text-muted-foreground'
                    }`}
                  >
                    {selectedEntity.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-0 pt-4 space-y-4 text-xs">
                <div className="rounded-xl bg-muted/20 p-3 space-y-1.5 border border-border">
                  <p className="font-semibold text-foreground">Active Company Details:</p>
                  <p className="text-muted-foreground font-medium">{selectedEntity.legalName}</p>
                  <p className="font-mono text-muted-foreground">
                    Code: {selectedEntity.code} · GSTIN: {selectedEntity.gstin || 'None'} · State:{' '}
                    {selectedEntity.stateCode}
                  </p>
                </div>

                {selectedEntity.status === 'CONFIGURING' ? (
                  <div className="space-y-3">
                    <p className="text-muted-foreground">
                      Activation requires independent review by a secondary authorized user. Enter the signed checklist
                      reference to unlock financial journal drafting.
                    </p>

                    <div>
                      <label className="font-semibold text-foreground">Signed Verification Reference</label>
                      <input
                        placeholder="e.g. FIN-AUDIT-2026-OCT-01 / Board Approval"
                        className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                        value={verificationReference}
                        onChange={(e) => setVerificationReference(e.target.value)}
                      />
                    </div>

                    <Button
                      onClick={() =>
                        void execute(
                          () => accountsApi.activateEntity(entityId, verificationReference),
                          'Accounting book independently activated for financial postings.'
                        )
                      }
                      className="w-full bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl text-xs"
                      disabled={pending || verificationReference.trim().length < 5}
                    >
                      {pending ? 'Activating…' : 'Activate Verified Book'}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-primary shrink-0" />
                    <div>
                      <p className="font-bold text-foreground">Book is Fully Active</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Financial journal drafting, supplier invoice capture, and double-entry posting are enabled.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab !== 'BOOK' && !entityId && (
        <Card className="rounded-2xl border-border/80 shadow-none p-5">
          <CardHeader className="p-0">
            <CardTitle className="text-base font-bold">Synergy Accounts setup is not complete</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-3 text-sm text-muted-foreground">
            Accounting periods and ledger accounts can be configured after an authorized system administrator provisions the Synergy International book.
            <div className="pt-4">
              <Button
                onClick={() => void execute(() => accountsApi.initializeSynergyBook(), 'Synergy International Accounts setup initialized.')}
                disabled={pending}
                className="bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl text-xs"
              >
                {pending ? 'Initializing…' : 'Set Up Synergy Accounts'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Accounting Periods */}
      {activeTab === 'PERIODS' && entityId && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          <Card className="rounded-2xl border-border/80 shadow-none p-5">
            <CardHeader className="p-0 pb-4 border-b border-border/70">
              <CardTitle className="text-base font-bold">Open New Fiscal Period</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Define the financial cutoff dates and fiscal year
              </p>
            </CardHeader>
            <CardContent className="p-0 pt-4">
              <form onSubmit={handleCreatePeriod} className="space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-foreground">Period Code</label>
                  <input
                    required
                    placeholder="e.g. FY26-27-OCT"
                    className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 font-mono uppercase focus:ring-2 focus:ring-ring focus:outline-none"
                    value={period.code}
                    onChange={(e) => setPeriod({ ...period, code: e.target.value.toUpperCase() })}
                  />
                </div>

                <div>
                  <label className="font-semibold text-foreground">Fiscal Year</label>
                  <input
                    required
                    placeholder="e.g. FY2026-27"
                    className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 font-mono focus:ring-2 focus:ring-ring focus:outline-none"
                    value={period.fiscalYear}
                    onChange={(e) => setPeriod({ ...period, fiscalYear: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-foreground">Starts On</label>
                    <input
                      required
                      type="date"
                      className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 focus:ring-2 focus:ring-ring focus:outline-none"
                      value={period.startsOn}
                      onChange={(e) => setPeriod({ ...period, startsOn: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-foreground">Ends On</label>
                    <input
                      required
                      type="date"
                      className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 focus:ring-2 focus:ring-ring focus:outline-none"
                      value={period.endsOn}
                      onChange={(e) => setPeriod({ ...period, endsOn: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    className="bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl text-xs"
                    disabled={pending}
                  >
                    {pending ? 'Opening…' : 'Open Fiscal Period'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/80 shadow-none">
            <CardHeader className="border-b border-border/70 p-5">
              <CardTitle className="text-base font-bold">Configured Periods</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Current and historical financial posting periods
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="w-full text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="p-3 text-left font-semibold">Period Code</TableHead>
                      <TableHead className="p-3 text-left font-semibold">Fiscal Year</TableHead>
                      <TableHead className="p-3 text-left font-semibold">Date Range</TableHead>
                      <TableHead className="p-3 text-center font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/60 font-mono">
                    {periods.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="p-6 text-center text-muted-foreground font-sans">
                          Loading periods…
                        </TableCell>
                      </TableRow>
                    ) : periods.data?.length ? (
                      periods.data.map((p: AccountingPeriod) => (
                        <TableRow key={p.id} className="hover:bg-muted/30">
                          <TableCell className="p-3 font-bold text-foreground">{p.code}</TableCell>
                          <TableCell className="p-3">{p.fiscalYear}</TableCell>
                          <TableCell className="p-3 text-muted-foreground">
                            {p.startsOn.slice(0, 10)} to {p.endsOn.slice(0, 10)}
                          </TableCell>
                          <TableCell className="p-3 text-center font-sans">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                p.status === 'OPEN'
                                  ? 'bg-primary/10 text-primary dark:text-primary'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {p.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="p-6 text-center text-muted-foreground font-sans">
                          No periods opened yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 3: Chart of Accounts */}
      {activeTab === 'CHART' && entityId && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Card className="rounded-2xl border-border/80 shadow-none p-5">
            <CardHeader className="p-0 pb-4 border-b border-border/70">
              <CardTitle className="text-base font-bold">Add Ledger Account</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Create an approved account in the chart with Tally mapping
              </p>
            </CardHeader>
            <CardContent className="p-0 pt-4">
              <form onSubmit={handleCreateAccount} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-foreground">Account Code</label>
                    <input
                      required
                      placeholder="e.g. 1010-HDFC"
                      className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 font-mono uppercase focus:ring-2 focus:ring-ring focus:outline-none"
                      value={account.code}
                      onChange={(e) => setAccount({ ...account, code: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-foreground">Account Classification</label>
                    <select
                      className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                      value={account.type}
                      onChange={(e) => setAccount({ ...account, type: e.target.value as any })}
                    >
                      <option value="ASSET">ASSET</option>
                      <option value="LIABILITY">LIABILITY</option>
                      <option value="EQUITY">EQUITY</option>
                      <option value="INCOME">INCOME</option>
                      <option value="EXPENSE">EXPENSE</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-foreground">Ledger Name</label>
                  <input
                    required
                    placeholder="e.g. HDFC Bank - Current Account"
                    className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                    value={account.name}
                    onChange={(e) => setAccount({ ...account, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="font-semibold text-foreground">Exact TallyPrime Ledger Name (Optional)</label>
                  <input
                    placeholder="e.g. HDFC Bank A/c (0045)"
                    className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 font-medium focus:ring-2 focus:ring-ring focus:outline-none"
                    value={account.tallyLedger}
                    onChange={(e) => setAccount({ ...account, tallyLedger: e.target.value })}
                  />
                </div>

                <label className="flex items-center gap-2 font-medium cursor-pointer pt-1">
                  <Checkbox

                    className="rounded border-border text-muted-foreground"
                    checked={account.isControl}
                    onChange={(e) => setAccount({ ...account, isControl: e.target.checked })}
                  />
                  Control Account (Manual journals blocked; subledger backed)
                </label>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    className="bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl text-xs"
                    disabled={pending}
                  >
                    {pending ? 'Saving…' : 'Add to Chart'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/80 shadow-none">
            <CardHeader className="border-b border-border/70 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">Chart of Accounts</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {chart.data?.length ?? 0} active double-entry accounts
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[32rem] overflow-y-auto">
                <Table className="w-full text-xs">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="p-3 text-left font-semibold">Code</TableHead>
                      <TableHead className="p-3 text-left font-semibold">Account Name</TableHead>
                      <TableHead className="p-3 text-left font-semibold">Type</TableHead>
                      <TableHead className="p-3 text-left font-semibold">Tally Mapping</TableHead>
                      <TableHead className="p-3 text-center font-semibold">Control</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/60 font-mono">
                    {chart.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="p-6 text-center text-muted-foreground font-sans">
                          Loading chart…
                        </TableCell>
                      </TableRow>
                    ) : chart.data?.length ? (
                      chart.data.map((acc: LedgerAccount) => (
                        <TableRow key={acc.id} className="hover:bg-muted/30">
                          <TableCell className="p-3 font-bold text-foreground">{acc.code}</TableCell>
                          <TableCell className="p-3 font-sans font-medium text-foreground">{acc.name}</TableCell>
                          <TableCell className="p-3 font-sans text-muted-foreground">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">
                              {acc.type}
                            </span>
                          </TableCell>
                          <TableCell className="p-3 font-sans text-muted-foreground ">
                            {acc.tallyLedger || '—'}
                          </TableCell>
                          <TableCell className="p-3 text-center font-sans">
                            {acc.isControl && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground dark:text-muted-foreground">
                                Control
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="p-6 text-center text-muted-foreground font-sans">
                          No ledger accounts in chart.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {activeTab === 'MAPPINGS' && entityId && (
        <Card className="rounded-2xl border-border/80 shadow-none p-5">
          <CardHeader className="p-0 pb-4 border-b border-border/70">
            <CardTitle className="text-base font-bold">Sales and Receivables Ledger Mappings</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Choose accounts from the active chart. Posting is blocked until each required mapping is configured.</p>
          </CardHeader>
          <CardContent className="space-y-3 p-0 pt-4">
            {['AR_CONTROL','SALES_REVENUE','OUTPUT_GST','CUSTOMER_ADVANCES','CASH_CLEARING','MARKETPLACE_CLEARING','MARKETPLACE_FEES','GST_TCS','INCOME_TDS'].map(mappingKey => {
              const saved = mappings.data?.find(mapping => mapping.mappingKey === mappingKey);
              return <div key={mappingKey} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-center">
                <div><p className="text-xs font-semibold">{mappingKey.replaceAll('_',' ')}</p><p className="text-[10px] text-muted-foreground">{saved ? `${saved.code} · ${saved.name}` : 'Not configured'}</p></div>
                <select aria-label={`${mappingKey} ledger`} className="rounded-xl border border-border bg-background p-2 text-xs" value={mappingChoices[mappingKey] ?? saved?.accountId ?? ''} onChange={event => setMappingChoices(current => ({ ...current, [mappingKey]: event.target.value }))}>
                  <option value="">Choose ledger account</option>
                  {(chart.data || []).filter((item: LedgerAccount) => item.status === 'ACTIVE' && !item.isControl).map((item: LedgerAccount) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
                </select>
                <Button size="sm" variant="outline" disabled={pending || !(mappingChoices[mappingKey] || saved?.accountId)} onClick={() => saveMapping(mappingKey)}>Save</Button>
              </div>;
            })}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
