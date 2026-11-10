import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fulfillmentApi } from './api';
import type { FulfillmentStage } from './types';

export const fulfillmentKeys = {
  all: ['fulfillment'] as const,
  overview: ['fulfillment', 'overview'] as const,
  list: (params: object) => ['fulfillment', 'list', params] as const,
  detail: (id: string) => ['fulfillment', 'detail', id] as const,
  shipment: (id: string) => ['fulfillment', 'shipment', id] as const,
  carriers: ['fulfillment', 'carriers'] as const,
};

export function useFulfillmentOverview() {
  return useQuery({ queryKey: fulfillmentKeys.overview, queryFn: fulfillmentApi.overview });
}

export function useFulfillments(params: { page: number; limit: number; stage?: FulfillmentStage; channel?: string; warehouseLocationId?: string; search?: string }) {
  return useQuery({ queryKey: fulfillmentKeys.list(params), queryFn: () => fulfillmentApi.list(params) });
}

export function useFulfillment(id: string) {
  return useQuery({ queryKey: fulfillmentKeys.detail(id), queryFn: () => fulfillmentApi.get(id), enabled: Boolean(id) });
}

export function useShipment(id: string) {
  return useQuery({ queryKey: fulfillmentKeys.shipment(id), queryFn: () => fulfillmentApi.getShipment(id), enabled: Boolean(id) });
}

export function useCarriers() {
  return useQuery({ queryKey: fulfillmentKeys.carriers, queryFn: fulfillmentApi.carriers });
}

export function useFulfillmentMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => client.invalidateQueries({ queryKey: fulfillmentKeys.all }),
  });
}
