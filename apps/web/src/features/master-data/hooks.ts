import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { LifecycleStatus } from '@synergy/types';

export interface EntitySummary {
  entityType: string;
  statusCounts: Record<LifecycleStatus, number>;
  total: number;
}

export function useMasterDataSummary() {
  return useQuery({
    queryKey: ['master-data', 'summary'],
    queryFn: () => fetchApi<EntitySummary[]>('/master-data/summary')
  });
}

export interface WarehouseLocation {
  id: string;
  code: string;
  name: string;
  factoryId?: string | null;
  type: string;
  status: LifecycleStatus;
}

export function useWarehouseLocations(params?: { search?: string; limit?: number }) {
  return useQuery({
    queryKey: ['master-data', 'warehouse-locations', params],
    queryFn: () =>
      fetchApi<{ items: WarehouseLocation[]; total: number }>(`/master-data/org/locations?status=ACTIVE&limit=${params?.limit ?? 100}${params?.search ? `&search=${encodeURIComponent(params.search)}` : ''}`)
  });
}
