import { fetchApi } from '../api/client';
import type {
  FgReadyOutputDto,
  FgPackagingUpdateInput,
  FgReceiptCreateInput,
  FgReceiptDto,
  FgGenealogyTraceDto,
  FgReceiptStatus
} from '@synergy/types';

export interface ListFgReadyOutputsParams {
  productId?: string;
  isReadyOnly?: string;
  skip?: number;
  take?: number;
}

export interface ListFgReadyOutputsResponse {
  items: FgReadyOutputDto[];
  total: number;
}

export interface ListFgReceiptsParams {
  productId?: string;
  locationId?: string;
  status?: FgReceiptStatus;
  skip?: number;
  take?: number;
}

export interface ListFgReceiptsResponse {
  items: FgReceiptDto[];
  total: number;
}

export const fgApi = {
  // 1. Ready Outputs (Pre-FG Queue)
  listReadyOutputs: async (params?: ListFgReadyOutputsParams): Promise<ListFgReadyOutputsResponse> => {
    const query = new URLSearchParams();
    if (params?.productId) query.set('productId', params.productId);
    if (params?.isReadyOnly) query.set('isReadyOnly', params.isReadyOnly);
    if (params?.skip !== undefined) query.set('skip', String(params.skip));
    if (params?.take !== undefined) query.set('take', String(params.take));

    const qs = query.toString();
    const endpoint = `/fg/ready-outputs${qs ? `?${qs}` : ''}`;
    return fetchApi<ListFgReadyOutputsResponse>(endpoint);
  },

  createReadyOutput: async (payload: {
    assemblyBatchId?: string | null;
    productId: string;
    productVariantId?: string | null;
    quantity: number;
    uomId: string;
    qcInspectionResultId?: string | null;
    notes?: string | null;
  }): Promise<FgReadyOutputDto> => {
    return fetchApi<FgReadyOutputDto>('/fg/ready-outputs', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  evaluateGate: async (outputId: string) => {
    return fetchApi<{
      isReadyToReceive: boolean;
      isQcPassed: boolean;
      hasApprovedQcCriteria: boolean;
      isPackagingReady: boolean;
      blockReason: string | null;
    }>(`/fg/ready-outputs/${outputId}/gate`);
  },

  updatePackagingStatus: async (outputId: string, payload: FgPackagingUpdateInput) => {
    return fetchApi<any>(`/fg/ready-outputs/${outputId}/packaging`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  },

  // 2. FG Receipts (Authoritative stock receiving & hold management)
  listReceipts: async (params?: ListFgReceiptsParams): Promise<ListFgReceiptsResponse> => {
    const query = new URLSearchParams();
    if (params?.productId) query.set('productId', params.productId);
    if (params?.locationId) query.set('locationId', params.locationId);
    if (params?.status) query.set('status', params.status);
    if (params?.skip !== undefined) query.set('skip', String(params.skip));
    if (params?.take !== undefined) query.set('take', String(params.take));

    const qs = query.toString();
    const endpoint = `/fg/receipts${qs ? `?${qs}` : ''}`;
    return fetchApi<ListFgReceiptsResponse>(endpoint);
  },

  receiveThroughGate: async (payload: FgReceiptCreateInput): Promise<FgReceiptDto> => {
    return fetchApi<FgReceiptDto>('/fg/receipts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  holdReceipt: async (receiptId: string, reason: string): Promise<FgReceiptDto> => {
    return fetchApi<FgReceiptDto>(`/fg/receipts/${receiptId}/hold`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  releaseReceipt: async (receiptId: string, releaseNotes?: string): Promise<FgReceiptDto> => {
    return fetchApi<FgReceiptDto>(`/fg/receipts/${receiptId}/release`, {
      method: 'POST',
      body: JSON.stringify({ releaseNotes })
    });
  },

  traceGenealogy: async (receiptId: string): Promise<FgGenealogyTraceDto> => {
    return fetchApi<FgGenealogyTraceDto>(`/fg/receipts/${receiptId}/genealogy`);
  }
};
