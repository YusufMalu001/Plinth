import { useState, useEffect, useCallback } from 'react';
import { jobWorkApi, JobWorkOrderQueryFilters } from './api';
import type {
  JobWorkOrderDto,
  JobWorkCustodyLedgerDto,
  VendorCustodyBalanceDto,
  JobWorkAnalyticsDto,
  JobWorkMaterialIssueDto
} from '@synergy/types';

export function useJobWorkOrders(filters?: JobWorkOrderQueryFilters) {
  const [orders, setOrders] = useState<JobWorkOrderDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await jobWorkApi.getOrders(filters);
      setOrders(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch job work orders.');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return { orders, total, loading, error, refresh: fetchOrders };
}

export function useJobWorkOrderDetail(id?: string) {
  const [order, setOrder] = useState<JobWorkOrderDto | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!id) {
      setOrder(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await jobWorkApi.getOrderById(id);
      setOrder(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch job work order.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  return { order, loading, error, refresh: fetchOrder };
}

export function useVendorCustodyBalances(vendorId?: string) {
  const [balances, setBalances] = useState<VendorCustodyBalanceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await jobWorkApi.getVendorCustodyBalances(vendorId);
      setBalances(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch vendor custody balances.');
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return { balances, loading, error, refresh: fetchBalances };
}

export function useJobWorkAnalytics() {
  const [analytics, setAnalytics] = useState<JobWorkAnalyticsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await jobWorkApi.getAnalytics();
      setAnalytics(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return { analytics, loading, error, refresh: fetchAnalytics };
}

export function useCustodyLedger(filters?: { vendorId?: string; jobWorkOrderId?: string; page?: number; limit?: number }) {
  const [ledgerEntries, setLedgerEntries] = useState<JobWorkCustodyLedgerDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLedger = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await jobWorkApi.getCustodyLedger(filters);
      setLedgerEntries(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch custody ledger.');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  return { ledgerEntries, total, loading, error, refresh: fetchLedger };
}
export function useJobWorkChallans(filters?: { vendorId?: string; jobWorkOrderId?: string; page?: number; limit?: number }) {
  const [challans, setChallans] = useState<JobWorkMaterialIssueDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChallans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await jobWorkApi.getChallans(filters);
      setChallans(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch material issue challans.');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]);

  useEffect(() => {
    fetchChallans();
  }, [fetchChallans]);

  return { challans, total, loading, error, refresh: fetchChallans };
}
