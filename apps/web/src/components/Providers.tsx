'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { showToast } from './toast-store';
import { ToastProvider } from './ToastProvider';
import { KeyboardProvider } from '@/lib/keyboard/KeyboardProvider';
import { ApiError } from '../features/api/client';
import { friendlyErrorMessage } from '../features/auth/access-control';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if ((query.meta as { silentError?: boolean } | undefined)?.silentError) return;
        // fetchApi redirects an expired session to /login. Showing a generic
        // query error toast during that expected redirect creates a misleading
        // startup error while the workspace shell is loading.
        if (error instanceof ApiError && error.status === 401) return;
        const message = friendlyErrorMessage(error);
        if (message.includes('Vendor recommendations are locked')) return;
        const isForbidden = (typeof error === 'object' && error !== null && 'status' in error && (error as { status?: number }).status === 403) || /authorization|permission/i.test(message);
        showToast({
          kind: isForbidden ? 'warning' : 'error',
          title: isForbidden ? 'Access Restricted' : 'Unable to load data',
          message,
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if ((mutation.options.meta as { silentError?: boolean } | undefined)?.silentError) return;
        showToast({ kind: 'error', title: 'Action failed', message: friendlyErrorMessage(error) });
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: true,
        refetchOnReconnect: true,
        retryDelay: 250,
        retry: (failureCount, error) => {
          // Retrying validation/auth failures only delays the UI. Retry one
          // time for transient server/network failures.
          if (error instanceof ApiError && error.status < 500) return false;
          return failureCount < 1;
        },
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeBridge queryClient={queryClient} />
      <KeyboardProvider>
        <ToastProvider>{children}</ToastProvider>
      </KeyboardProvider>
    </QueryClientProvider>
  );
}

function RealtimeBridge({ queryClient }: { queryClient: QueryClient }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === '/login') return;
    let source: EventSource | null = null;
    let reconnectTimer: number | undefined;
    let stopped = false;
    let retryMs = 1000;
    const refresh = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { resource?: string; resourceId?: string };
        if (payload.resource === 'GoodsReceiptNote') {
          queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
          if (payload.resourceId) queryClient.invalidateQueries({ queryKey: ['grn', payload.resourceId] });
        } else if (payload.resource === 'PurchaseOrder') queryClient.invalidateQueries({ queryKey: ['purchases', 'orders'] });
        else if (payload.resource === 'PurchaseRequisition') queryClient.invalidateQueries({ queryKey: ['purchases', 'requisitions'] });
        else queryClient.invalidateQueries({ queryKey: ['purchases', 'notifications'] });
      } catch { queryClient.invalidateQueries({ queryKey: ['purchases', 'notifications'] }); }
    };
    const connect = () => {
      if (stopped) return;
      source = new EventSource('/api/v1/events/stream', { withCredentials: true });
      source.addEventListener('notification.created', refresh);
      source.addEventListener('connected', () => { retryMs = 1000; });
      source.onerror = () => {
        source?.close();
        source = null;
        if (!stopped) {
          reconnectTimer = window.setTimeout(connect, retryMs);
          retryMs = Math.min(retryMs * 2, 30_000);
        }
      };
    };
    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [queryClient]);
  return null;
}
