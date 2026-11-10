'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CircleAlert, RefreshCw } from 'lucide-react';
import { intelligenceApi } from '../api';
import { intelligenceKeys } from '../hooks';
import { showToast } from '../../../components/toast-store';

export function IntelligenceCaseDetailView() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const client = useQueryClient();
  const [reason, setReason] = useState('');
  const query = useQuery({
    queryKey: intelligenceKeys.case(id),
    queryFn: () => intelligenceApi.case(id),
    enabled: Boolean(id),
    refetchInterval: 30_000,
  });
  const transition = useMutation({
    mutationFn: (action: 'acknowledge' | 'resolve' | 'suppress') => intelligenceApi.transitionCase(id, action, reason),
    onSuccess: async (_result, action) => {
      setReason('');
      showToast({ kind: 'success', title: 'Case status updated', message: `The case was ${action === 'acknowledge' ? 'acknowledged' : action === 'suppress' ? 'suppressed' : 'resolved'}.` });
      await Promise.all([
        client.invalidateQueries({ queryKey: intelligenceKeys.case(id) }),
        client.invalidateQueries({ queryKey: ['intelligence', 'cases'] }),
      ]);
    },
  });

  if (query.isLoading) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">Loading case evidence…</div>;
  if (query.isError) return <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Case details are temporarily unavailable. <button type="button" onClick={() => void query.refetch()} className="ml-2 font-semibold text-primary underline">Retry</button></div>;
  const record = query.data;
  if (!record) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900">Case not found or outside your access scope.</div>;

  const canAcknowledge = record.status === 'OPEN';
  const canResolve = ['OPEN', 'ACKNOWLEDGED'].includes(record.status);
  const canSuppress = ['OPEN', 'ACKNOWLEDGED'].includes(record.status);
  const observations = record.observations ?? [];
  const evidence = record.evidence && typeof record.evidence === 'object' ? record.evidence : {};

  return (
    <div className="space-y-5">
      <Link href="/intelligence/cases" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#004a80] dark:text-slate-300"><ArrowLeft className="h-4 w-4" /> Back to case investigations</Link>
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{record.module} · {record.detectorKey?.replaceAll('_', ' ')}</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{evidence.title ?? record.detectorKey?.replaceAll('_', ' ') ?? 'Intelligence case'}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">{evidence.situation ?? 'No situation summary was stored with this case.'}</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200"><CircleAlert className="h-4 w-4" /> {record.severity} · {record.status}</div>
        </div>
        <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3 dark:border-slate-800">
          <div><dt className="text-xs text-slate-500">First detected</dt><dd className="mt-1 font-medium">{record.firstDetectedAt ? new Date(record.firstDetectedAt).toLocaleString() : '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">Last detected</dt><dd className="mt-1 font-medium">{record.lastDetectedAt ? new Date(record.lastDetectedAt).toLocaleString() : '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">Evidence snapshot</dt><dd className="mt-1 font-mono text-xs">{record.snapshotId ?? '—'}</dd></div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-semibold text-slate-900 dark:text-white">Evidence and observations</h3>
        <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-50 p-4 text-xs leading-5 text-slate-700 dark:bg-slate-950 dark:text-slate-300">{JSON.stringify(evidence, null, 2)}</pre>
        <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          {observations.map((item: any) => <div key={item.id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{item.result}</strong><time className="text-xs text-slate-500">{new Date(item.observedAt).toLocaleString()}</time></div><pre className="mt-2 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">{JSON.stringify(item.evidence, null, 2)}</pre></div>)}
          {!observations.length && <p className="py-3 text-xs text-slate-500">No observation history is recorded for this case.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-semibold text-slate-900 dark:text-white">Next steps</h3>
        {(record.recommendations ?? []).length > 0 && <ul className="mt-3 space-y-2">{record.recommendations.map((item: any) => <li key={item.id}><Link href={`/intelligence/recommendations/${item.id}`} className="text-sm font-medium text-[#004a80] hover:underline">{item.title} · {item.status}</Link></li>)}</ul>}
        <label className="mt-4 block text-xs font-medium text-slate-600 dark:text-slate-300" htmlFor="case-reason">Reason for status change</label>
        <textarea id="case-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={1000} className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="Record the action or reason…" />
        <div className="mt-3 flex flex-wrap gap-2">
          {canAcknowledge && <button disabled={transition.isPending || reason.trim().length < 3} onClick={() => transition.mutate('acknowledge')} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"><Check className="h-3.5 w-3.5" /> Acknowledge</button>}
          {canResolve && <button disabled={transition.isPending || reason.trim().length < 3} onClick={() => transition.mutate('resolve')} className="inline-flex items-center gap-2 rounded-lg bg-[#004a80] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Resolve</button>}
          {canSuppress && <button disabled={transition.isPending || reason.trim().length < 3} onClick={() => transition.mutate('suppress')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">Suppress</button>}
          <button onClick={() => void query.refetch()} disabled={query.isFetching} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"><RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
      </section>
    </div>
  );
}
