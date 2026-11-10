import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export const DEFAULT_PRICING_LEVELS = ['Dealer', 'E-Trade', 'Customer'];

const STORAGE_KEY = 'synergy_pricing_levels';

function getStoredLevels(): string[] {
  if (typeof window === 'undefined') return DEFAULT_PRICING_LEVELS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return Array.from(new Set([...DEFAULT_PRICING_LEVELS, ...parsed.map(String).map((s) => s.trim()).filter(Boolean)]));
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_PRICING_LEVELS;
}

function setStoredLevels(levels: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
  } catch {
    // ignore
  }
}

export function usePricingLevels() {
  const query = useQuery({
    queryKey: ['pricing-levels'],
    queryFn: async () => {
      try {
        const response = await apiClient.get<{ levels: string[] }>('/master-data/pricing-levels');
        const levels = Array.isArray(response?.levels) && response.levels.length > 0
          ? Array.from(new Set([...DEFAULT_PRICING_LEVELS, ...response.levels.map(String).map((s) => s.trim()).filter(Boolean)]))
          : getStoredLevels();
        setStoredLevels(levels);
        return levels;
      } catch {
        return getStoredLevels();
      }
    },
    initialData: getStoredLevels,
    staleTime: 60 * 1000,
  });

  return {
    levels: query.data || DEFAULT_PRICING_LEVELS,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useCreatePricingLevel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Level name is required');
      try {
        const response = await apiClient.post<{ levels: string[]; created: string }>('/master-data/pricing-levels', {
          name: trimmed,
        });
        const updated = Array.isArray(response?.levels)
          ? Array.from(new Set([...DEFAULT_PRICING_LEVELS, ...response.levels]))
          : Array.from(new Set([...getStoredLevels(), trimmed]));
        setStoredLevels(updated);
        return { levels: updated, created: trimmed };
      } catch {
        // Fallback to local storage if API is offline
        const current = getStoredLevels();
        const updated = Array.from(new Set([...current, trimmed]));
        setStoredLevels(updated);
        return { levels: updated, created: trimmed };
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['pricing-levels'], data.levels);
      queryClient.invalidateQueries({ queryKey: ['pricing-levels'] });
    },
  });
}
