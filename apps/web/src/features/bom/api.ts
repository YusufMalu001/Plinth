/**
 * Module 5 — BOM / Formula Engine API Client
 */
import { fetchApi } from '../api/client';
import { BomStatus } from '@plinth/types';
import type {
  BomVersionDetail,
  BomVersionListResponse,
  BomGoldenExample,
  BomSimulationRun,
  BomCalculationResult,
  BomCalculationRequirement,
  BomVersionDiff,
  CreateBomDraftInput,
  UpdateBomDraftInput,
  AddGoldenExampleInput,
  RunSimulationInput,
} from './types';

export interface BomAuditLogEntry {
  id?: string;
  action: string;
  details?: Record<string, unknown>;
  message?: string;
  createdAt?: string;
}

export function fetchApiWithParams<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
  if (!params) return fetchApi<T>(endpoint);
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });
  const queryString = searchParams.toString();
  const url = queryString ? `${endpoint}?${queryString}` : endpoint;
  return fetchApi<T>(url);
}

export const bomApi = {
  checkName: (name: string, excludeId?: string) =>
    fetchApiWithParams<{ exists: boolean }>('/bom-versions/name-availability', { name, excludeId }),
  listVersions: (params?: {
    productId?: string;
    materialId?: string;
    productVariantId?: string;
    status?: BomStatus;
    page?: number;
    limit?: number;
    search?: string;
  }) => {
    const skip = params?.page && params?.limit ? (params.page - 1) * params.limit : undefined;
    return fetchApiWithParams<BomVersionListResponse>('/bom-versions', {
      productId: params?.productId,
      materialId: params?.materialId,
      productVariantId: params?.productVariantId,
      status: params?.status,
      skip,
      take: params?.limit,
      search: params?.search,
    });
  },

  getVersion: (id: string) => fetchApi<BomVersionDetail>(`/bom-versions/${id}`),

  createDraft: (data: CreateBomDraftInput) =>
    fetchApi<BomVersionDetail>('/bom-versions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateDraft: (id: string, data: UpdateBomDraftInput) =>
    fetchApi<BomVersionDetail>(`/bom-versions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteDraft: (id: string) =>
    fetchApi<{ id: string; action: 'DELETED' | 'RETIRED' }>(`/bom-versions/${id}`, {
      method: 'DELETE',
    }),

  deleteDrafts: (ids: string[]) =>
    fetchApi<{ requestedCount: number; deletedCount: number; retiredCount: number }>('/bom-versions/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  detachFromItem: (id: string) =>
    fetchApi<BomVersionDetail>(`/bom-versions/${id}/detach-from-item`, {
      method: 'POST',
    }),

  validate: (id: string) =>
    fetchApi<BomVersionDetail>(`/bom-versions/${id}/validate`, {
      method: 'POST',
    }),

  approve: (id: string) =>
    fetchApi<BomVersionDetail>(`/bom-versions/${id}/approve`, {
      method: 'POST',
    }),

  supersede: (id: string, data: { replacementVersionId?: string }) =>
    fetchApi<BomVersionDetail>(`/bom-versions/${id}/supersede`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  addGoldenExample: (id: string, data: AddGoldenExampleInput) =>
    fetchApi<BomGoldenExample>(`/bom-versions/${id}/golden-examples`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listGoldenExamples: (id: string) =>
    fetchApi<BomGoldenExample[]>(`/bom-versions/${id}/golden-examples`),

  runSimulation: (id: string, data: RunSimulationInput) =>
    fetchApi<{ simulation: BomSimulationRun; requirements: BomCalculationRequirement[] }>(`/bom-versions/${id}/simulate`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listSimulations: (id: string) =>
    fetchApi<BomSimulationRun[]>(`/bom-versions/${id}/simulations`),

  compare: (fromId: string, toId: string) =>
    fetchApiWithParams<BomVersionDiff>('/bom-versions/compare', { fromId, toId }),

  calculate: (params: {
    productId: string;
    productVariantId?: string;
    requestedQuantity: number;
    requestedUomId: string;
    date?: string;
  }) => fetchApiWithParams<BomCalculationResult>('/bom-versions/calculate', params),

  getHistory: (id: string) => fetchApi<BomAuditLogEntry[]>(`/bom-versions/${id}/history`),
};
