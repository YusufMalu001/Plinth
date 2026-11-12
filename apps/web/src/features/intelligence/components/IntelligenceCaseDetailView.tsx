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

  if (query.isLoading) return <div className="rounded-xl border border-border bg-surface p-6 text-sm text-ink-muted">Loading case evidence…</div>;
  if (query.isError) return <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Case details are temporarily unavailable. <button type="button" onClick={() => void query.refetch()} className="ml-2 font-semibold text-primary underline">Retry</button></div>;
  const record = query.data;
  if (!record) return <div className="rounded-xl border border-border bg-surface p-6 text-sm text-ink-secondary">Case not found or outside your access scope.</div>;

  const canAcknowledge = record.status === 'OPEN';
  const canResolve = ['OPEN', 'ACKNOWLEDGED'].includes(record.status);
  const canSuppress = ['OPEN', 'ACKNOWLEDGED'].includes(record.status);
  const observations = record.observations ?? [];
  const evidence = record.evidence && typeof record.evidence === 'object' ? record.evidence : {};

  return (
    <div className="space-y-5">
      <Link href="/intelligence/cases" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-secondary hover:text-link-hover"><ArrowLeft className="h-4 w-4" /> Back to case investigations</Link>
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{record.module} · {record.detectorKey?.replaceAll('_', ' ')}</p>
            <h2 className="mt-1 text-xl font-bold text-ink">{evidence.title ?? record.detectorKey?.replaceAll('_', ' ') ?? 'Intelligence case'}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">{evidence.situation ?? 'No situation summary was stored with this case.'}</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-ink-secondary"><CircleAlert className="h-4 w-4" /> {record.severity} · {record.status}</div>
        </div>
        <dl className="mt-5 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-ink-muted">First detected</dt><dd className="mt-1 font-medium">{record.firstDetectedAt ? new Date(record.firstDetectedAt).toLocaleString() : '—'}</dd></div>
          <div><dt className="text-xs text-ink-muted">Last detected</dt><dd className="mt-1 font-medium">{record.lastDetectedAt ? new Date(record.lastDetectedAt).toLocaleString() : '—'}</dd></div>
          <div><dt className="text-xs text-ink-muted">Evidence snapshot</dt><dd className="mt-1 font-mono text-xs">{record.snapshotId ?? '—'}</dd></div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h3 className="font-semibold text-ink">Evidence and observations</h3>
        <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs leading-5 text-ink-secondary">{JSON.stringify(evidence, null, 2)}</pre>
        <div className="mt-4 divide-y divide-border">
          {observations.map((item: any) => <div key={item.id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{item.result}</strong><time className="text-xs text-ink-muted">{new Date(item.observedAt).toLocaleString()}</time></div><pre className="mt-2 whitespace-pre-wrap text-xs text-ink-secondary">{JSON.stringify(item.evidence, null, 2)}</pre></div>)}
          {!observations.length && <p className="py-3 text-xs text-ink-muted">No observation history is recorded for this case.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h3 className="font-semibold text-ink">Next steps</h3>
        {(record.recommendations ?? []).length > 0 && <ul className="mt-3 space-y-2">{record.recommendations.map((item: any) => <li key={item.id}><Link href={`/intelligence/recommendations/${item.id}`} className="text-sm font-medium text-link hover:underline">{item.title} · {item.status}</Link></li>)}</ul>}
        <label className="mt-4 block text-xs font-medium text-ink-secondary" htmlFor="case-reason">Reason for status change</label>
        <textarea id="case-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={1000} className="mt-1 min-h-20 w-full rounded-lg border border-border bg-surface p-3 text-sm" placeholder="Record the action or reason…" />
        <div className="mt-3 flex flex-wrap gap-2">
          {canAcknowledge && <button disabled={transition.isPending || reason.trim().length < 3} onClick={() => transition.mutate('acknowledge')} className="inline-flex items-center gap-2 rounded-lg bg-inverse px-3 py-2 text-xs font-semibold text-inverse disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Acknowledge</button>}
          {canResolve && <button disabled={transition.isPending || reason.trim().length < 3} onClick={() => transition.mutate('resolve')} className="inline-flex items-center gap-2 rounded-lg bg-action px-3 py-2 text-xs font-semibold text-inverse disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Resolve</button>}
          {canSuppress && <button disabled={transition.isPending || reason.trim().length < 3} onClick={() => transition.mutate('suppress')} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-ink-secondary disabled:opacity-50">Suppress</button>}
          <button onClick={() => void query.refetch()} disabled={query.isFetching} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-ink-secondary disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
      </section>
    </div>
  );
}
