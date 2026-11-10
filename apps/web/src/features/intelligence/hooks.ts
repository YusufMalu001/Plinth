import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { intelligenceApi } from './api';
import type { IntelligenceModule } from './types';

export const intelligenceKeys = {
  all: ['intelligence'] as const,
  overview: ['intelligence', 'overview'] as const,
  dailyInsight: ['intelligence', 'daily-insight'] as const,
  dailyInsightHistory: (page: number) => ['intelligence', 'daily-insight-history', page] as const,
  recommendations: (params: object) => ['intelligence', 'recommendations', params] as const,
  recommendation: (id: string) => ['intelligence', 'recommendation', id] as const,
  tasks: (params: object) => ['intelligence', 'tasks', params] as const,
  task: (id: string) => ['intelligence', 'task', id] as const,
  assignees: (module: IntelligenceModule) => ['intelligence', 'assignees', module] as const,
  runs: ['intelligence', 'runs'] as const,
  run: (id: string) => ['intelligence', 'run', id] as const,
  health: ['intelligence', 'health'] as const,
  cases: (params: object = {}) => ['intelligence', 'cases', params] as const,
  case: (id: string) => ['intelligence', 'case', id] as const,
  scenarios: (params: object = {}) => ['intelligence', 'scenarios', params] as const,
  scenario: (id: string) => ['intelligence', 'scenario', id] as const,
};

export const useIntelligenceOverview = () => useQuery({ queryKey: intelligenceKeys.overview, queryFn: intelligenceApi.overview, refetchInterval: 60_000 });
export const useDailyInsight = () => useQuery({ queryKey: intelligenceKeys.dailyInsight, queryFn: intelligenceApi.dailyInsightToday, refetchInterval: (query) => ['QUEUED', 'RUNNING'].includes(query.state.data?.run?.status ?? '') ? 3_000 : 30_000 });
export const useDailyInsightHistory = (page = 1) => useQuery({ queryKey: intelligenceKeys.dailyInsightHistory(page), queryFn: () => intelligenceApi.dailyInsightHistory(page), refetchInterval: 30_000 });
export const useRecommendations = (params: object = {}, options: object = {}) =>
  useQuery({
    queryKey: intelligenceKeys.recommendations(params),
    queryFn: () => intelligenceApi.recommendations(params),
    refetchInterval: 30_000,
    meta: { silentError: true },
    retry: false,
    ...options
  });
export const useRecommendation = (id: string) => useQuery({ queryKey: intelligenceKeys.recommendation(id), queryFn: () => intelligenceApi.recommendation(id), enabled: Boolean(id) });
export const useTasks = (params: object = {}) => useQuery({ queryKey: intelligenceKeys.tasks(params), queryFn: () => intelligenceApi.tasks(params), refetchInterval: 30_000 });
export const useTask = (id: string) => useQuery({ queryKey: intelligenceKeys.task(id), queryFn: () => intelligenceApi.task(id), enabled: Boolean(id) });
export const useAssignees = (module: IntelligenceModule | undefined) => useQuery({ queryKey: module ? intelligenceKeys.assignees(module) : ['intelligence', 'assignees', 'none'], queryFn: () => intelligenceApi.assignees(module!), enabled: Boolean(module) });
export const useRuns = () => useQuery({ queryKey: intelligenceKeys.runs, queryFn: () => intelligenceApi.runs(), refetchInterval: 5_000 });
export const useRun = (id: string) => useQuery({ queryKey: intelligenceKeys.run(id), queryFn: () => intelligenceApi.run(id), enabled: Boolean(id), refetchInterval: 5_000 });
export const useIntelligenceHealth = () => useQuery({ queryKey: intelligenceKeys.health, queryFn: intelligenceApi.health, refetchInterval: 30_000 });
export const useCases = (page = 1, limit = 25) => useQuery({ queryKey: intelligenceKeys.cases({ page, limit }), queryFn: () => intelligenceApi.cases(page, limit), refetchInterval: 30_000 });
export const useScenarios = (page = 1, limit = 25) => useQuery({ queryKey: intelligenceKeys.scenarios({ page, limit }), queryFn: () => intelligenceApi.scenarios(page, limit) });

export function useIntelligenceMutation<T>(mutationFn: (value: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => client.invalidateQueries({ queryKey: intelligenceKeys.all }),
  });
}
