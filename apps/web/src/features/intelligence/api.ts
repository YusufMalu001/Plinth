import { fetchApi } from '../api/client';
import type { Assignee, BusinessTask, DailyInsightHistory, DailyInsightState, IntelligenceControls, IntelligenceHealth, IntelligenceModule, IntelligenceOutcome, IntelligenceOverview, IntelligenceRun, ProviderAttempt, Recommendation } from './types';

const queryString = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value !== undefined && value !== '' && query.set(key, String(value)));
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
};

export const intelligenceApi = {
  health: () => fetchApi<IntelligenceHealth>('/intelligence/health'),
  providerAttempts: (runId?: string) => fetchApi<{ items: ProviderAttempt[]; total: number }>(`/intelligence/provider-attempts${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`),
  checkModel: (model: string) => fetchApi<{ model: string; status: string; results: unknown[] }>('/intelligence/model-checks', { method: 'POST', body: JSON.stringify({ model }) }),
  overview: () => fetchApi<IntelligenceOverview>('/intelligence/overview'),
  dailyInsightToday: () => fetchApi<DailyInsightState>('/intelligence/daily-insights/today'),
  dailyInsightHistory: (page = 1, limit = 10) => fetchApi<DailyInsightHistory>(`/intelligence/daily-insights?page=${page}&limit=${limit}`),
  generateDailyInsight: (refresh = false) => fetchApi<DailyInsightState>('/intelligence/daily-insights/today', { method: 'POST', body: JSON.stringify({ refresh }) }),
  recommendations: (params: { page?: number; limit?: number; module?: IntelligenceModule; status?: string; priority?: string } = {}) =>
    fetchApi<{ items: Recommendation[]; total: number; page: number; limit: number; totalPages: number }>(`/intelligence/recommendations${queryString(params)}`),
  recommendation: (id: string) => fetchApi<Recommendation>(`/intelligence/recommendations/${id}`),
  accept: (id: string, input: { assigneeId: string; dueAt: string; managerNotes?: string }) =>
    fetchApi<BusinessTask>(`/intelligence/recommendations/${id}/accept`, { method: 'POST', body: JSON.stringify(input) }),
  dismiss: (id: string, reason: string) => fetchApi(`/intelligence/recommendations/${id}/dismiss`, { method: 'POST', body: JSON.stringify({ reason }) }),
  defer: (id: string, reason: string, deferredUntil: string) => fetchApi(`/intelligence/recommendations/${id}/defer`, { method: 'POST', body: JSON.stringify({ reason, deferredUntil }) }),
  refresh: (id: string) => fetchApi(`/intelligence/recommendations/${id}/refresh`, { method: 'POST', body: '{}' }),
  tasks: (params: { page?: number; limit?: number; status?: string } = {}) =>
    fetchApi<{ items: BusinessTask[]; total: number; page: number; limit: number; totalPages: number }>(`/intelligence/tasks${queryString(params)}`),
  task: (id: string) => fetchApi<BusinessTask>(`/intelligence/tasks/${id}`),
  updateTask: (id: string, input: { status?: string; assigneeId?: string; dueAt?: string; comment?: string }) =>
    fetchApi<BusinessTask>(`/intelligence/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  completeTask: (id: string, input: unknown) => fetchApi<BusinessTask>(`/intelligence/tasks/${id}/complete`, { method: 'POST', body: JSON.stringify(input) }),
  outcomes: (page = 1, limit = 25) => fetchApi<{ items: IntelligenceOutcome[]; total: number; page: number; limit: number }>(`/intelligence/outcomes?page=${page}&limit=${limit}`),
  assignees: (module: IntelligenceModule) => fetchApi<Assignee[]>(`/intelligence/assignees?module=${module}`),
  runs: (page = 1, limit = 25) => fetchApi<{ items: IntelligenceRun[]; total: number; page: number; limit: number; totalPages: number }>(`/intelligence/runs?page=${page}&limit=${limit}`),
  runModule: (module: IntelligenceModule) => fetchApi<{ id: string; module: IntelligenceModule; status: string }>('/intelligence/runs', { method: 'POST', body: JSON.stringify({ module }) }),
  run: (id: string) => fetchApi<IntelligenceRun>(`/intelligence/runs/${id}`),
  objectives: () => fetchApi<{ active: unknown; history: unknown[] }>('/intelligence/objectives'),
  controls: () => fetchApi<IntelligenceControls>('/intelligence/controls'),
  updateControls: (input: IntelligenceControls['state']) => fetchApi<IntelligenceControls>('/intelligence/controls', { method: 'PUT', body: JSON.stringify({
    globalPaused: input.globalPaused,
    providerPaused: input.providerPaused,
    schedulesPaused: input.schedulesPaused,
    eventTriggersPaused: input.eventTriggersPaused,
    notificationsPaused: input.notificationsPaused,
    pausedProfiles: input.pausedProfiles,
  }) }),
  ask: (question: string, module: IntelligenceModule) => fetchApi<{ runId: string; status: string; requestId: string }>('/intelligence/questions', { method: 'POST', body: JSON.stringify({ question, module }) }),
  cases: (page = 1, limit = 25) => fetchApi<{ items: any[]; total: number; page: number; limit: number }>(`/intelligence/cases?page=${page}&limit=${limit}`),
  case: (id: string) => fetchApi<any>(`/intelligence/cases/${encodeURIComponent(id)}`),
  transitionCase: (id: string, action: 'acknowledge' | 'resolve' | 'suppress', reason: string) =>
    fetchApi<any>(`/intelligence/cases/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify({ reason }) }),
  scenarios: (page = 1, limit = 25) => fetchApi<{ items: any[]; total: number; page: number; limit: number }>(`/intelligence/scenarios?page=${page}&limit=${limit}`),
  scenario: (id: string) => fetchApi<any>(`/intelligence/scenarios/${encodeURIComponent(id)}`),
  createScenario: (
    inputOrCaseId: string | { caseId: string; idempotencyKey: string; scenarioType?: string; assumptions?: Record<string, any> },
    idempotencyKey?: string,
    scenarioType?: string,
    assumptions?: Record<string, any>
  ) => {
    const payload = typeof inputOrCaseId === 'string'
      ? { caseId: inputOrCaseId, idempotencyKey: idempotencyKey!, scenarioType, assumptions }
      : inputOrCaseId;
    return fetchApi<any>('/intelligence/scenarios', { method: 'POST', body: JSON.stringify(payload) });
  },
  conversations: (page = 1, limit = 25) => fetchApi<{ items: any[]; total: number; page: number; limit: number }>(`/intelligence/conversations?page=${page}&limit=${limit}`),
  createConversation: (module: IntelligenceModule, title?: string) => fetchApi<any>('/intelligence/conversations', { method: 'POST', body: JSON.stringify({ module, title }) }),
  conversation: (id: string) => fetchApi<any>(`/intelligence/conversations/${encodeURIComponent(id)}`),
  sendConversationMessage: (id: string, content: string) => fetchApi<{ runId: string; status: string; requestId: string }>(`/intelligence/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),
};
