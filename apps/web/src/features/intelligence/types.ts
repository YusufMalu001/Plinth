export type IntelligenceModule = 'EXECUTIVE' | 'SALES' | 'INVENTORY' | 'PROCUREMENT' | 'PRODUCTION' | 'FULFILLMENT' | 'QUALITY' | 'FINANCE' | 'SYSTEM';

export type Metric = {
  key: string;
  value: string | number | null;
  unit: string;
  currency?: string | null;
  provenance?: 'ACTUAL' | 'CALCULATED' | 'ESTIMATED' | 'FORECAST' | 'ASSUMPTION' | 'UNKNOWN';
  freshnessStatus?: 'FRESH' | 'STALE' | 'UNKNOWN';
  dataQualityScore?: string | number | null;
};

export type SnapshotSummary = {
  id: string;
  module: IntelligenceModule;
  metricVersion: string;
  freshnessScore: string | number;
  costCoverageScore: string | number;
  periodStart: string;
  periodEnd: string;
  capturedAt: string;
  metrics: Metric[];
};

export type ExpectedImpact = {
  metricKey: string;
  unit: string;
  currency?: string;
  horizonDays: number;
  low: number;
  base: number;
  high: number;
  sourceMetricKeys: string[];
};

export type Evidence = {
  metricKey: string;
  metricVersion: string;
  value: number;
  unit: string;
  currency?: string;
  sourceResource: string;
  periodStart: string;
  periodEnd: string;
  dataTimestamp: string;
};

const evidenceMetricLabels: Record<string, string> = {
  'sales.booked_net_revenue': 'Booked net revenue (excludes tax)',
  'sales.gross_shipped_revenue': 'Gross shipped revenue',
  'sales.tax_excluded_net_revenue': 'Tax-excluded net revenue',
  'sales.order_count': 'Sales order count',
};

export function describeEvidence(item: Evidence) {
  const value = item.currency
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: item.currency, maximumFractionDigits: 2 }).format(item.value)
    : `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(item.value)} ${item.unit}`;
  const label = evidenceMetricLabels[item.metricKey] ?? item.metricKey;
  const start = new Date(item.periodStart).toLocaleDateString();
  const end = new Date(item.periodEnd).toLocaleDateString();
  const captured = new Date(item.dataTimestamp).toLocaleString();
  return {
    label: `${label}: ${value}`,
    title: `${item.metricKey} · Source: ${item.sourceResource} · Period: ${start}–${end} · Data timestamp: ${captured} · Metric version: ${item.metricVersion}`,
  };
}

export type Recommendation = {
  id: string;
  runId: string;
  module: IntelligenceModule;
  category: string;
  status: 'OPEN' | 'ACCEPTED' | 'DISMISSED' | 'DEFERRED' | 'EXPIRED' | 'SUPERSEDED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  situation: string;
  rationale: string;
  proposedActionCode: string;
  evidence: Evidence[];
  expectedImpact: ExpectedImpact;
  assumptions: string[];
  risks: string[];
  dependencies: string[];
  alternatives: string[];
  confidence: string | number;
  confidenceExplanation: string;
  suggestedOwnerRole: string;
  urgency: string;
  recommendedDueAt: string;
  expiresAt: string;
  requiredApprovalPermission: string;
  costCoverageScore: string | number;
  dataQualityScore: string | number;
  createdAt: string;
  task?: Pick<BusinessTask, 'id' | 'status' | 'ownerId' | 'dueAt'> | null;
};

export type BusinessTask = {
  id: string;
  recommendationId: string;
  module: IntelligenceModule;
  title: string;
  description: string;
  ownerId: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED';
  priority: Recommendation['priority'];
  dueAt: string;
  expectedImpact: ExpectedImpact;
  completedAt?: string | null;
  createdAt: string;
  owner?: { id: string; name?: string | null; email: string };
  recommendation?: { id: string; title: string; confidence: string | number; expectedImpact: ExpectedImpact };
};

export type IntelligenceOverview = {
  generatedAt: string;
  scope: { modules: Array<IntelligenceModule | 'ALL'> };
  recommendationCounts: Record<string, number>;
  taskCounts: Record<string, number>;
  latestSnapshots: SnapshotSummary[];
  recentRecommendations: Recommendation[];
  realizedImpact: { recordedOutcomeCount: number; totalRecordedValue: number };
  runtime: { byStatus: Record<string, number>; latest?: { status: string; createdAt: string; completedAt?: string | null; errorCode?: string | null } | null; monthlyCostUsd: number };
};

export type DailyInsightPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type DailyInsightBriefing = {
  headline: string;
  overallStatus: 'GREEN' | 'AMBER' | 'RED' | 'INSUFFICIENT_EVIDENCE';
  executiveSummary: string;
  keyUpdates: Array<{ title: string; detail: string; whyItMatters: string; priority: DailyInsightPriority; evidenceMetricKeys: string[] }>;
  risks: Array<{ title: string; detail: string; evidenceMetricKeys: string[] }>;
  recommendedFocus: Array<{ action: string; rationale: string; evidenceMetricKeys: string[] }>;
  dataCaveats: string[];
};
export type DailyInsightRun = {
  id: string;
  status: string;
  businessDate?: string | null;
  source?: 'MANUAL' | 'SCHEDULE';
  structuredOutput?: { answer: string; evidence: Evidence[]; limitations: string[]; dailyBriefing?: DailyInsightBriefing } | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  snapshotId?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
};
export type DailyInsightState = { businessDate: string; automaticScheduleEnabled: boolean; run: DailyInsightRun | null };
export type DailyInsightHistory = { items: DailyInsightRun[]; total: number; page: number; limit: number; totalPages: number };

export type Assignee = { id: string; name?: string | null; email: string; department?: string | null; title?: string | null };

export type IntelligenceRun = {
  id: string;
  module: IntelligenceModule;
  trigger: string;
  profileKey: string;
  status: string;
  modelProvider?: string | null;
  modelId?: string | null;
  costUsd?: string | number | null;
  errorCode?: string | null;
  correlationId?: string;
  toolAudit?: Array<{ stage: string; at: string; status: string; reason?: string }> | null;
  providerAttempts?: ProviderAttempt[];
  createdAt: string;
  completedAt?: string | null;
  structuredOutput?: { answer?: string; evidence?: Evidence[]; limitations?: string[]; dailyBriefing?: DailyInsightBriefing } | null;
};

export type ProviderAttempt = {
  id: string; operation: string; status: string; profileKey?: string | null;
  requestedModel?: string | null; resolvedModel?: string | null; provider?: string | null;
  httpStatus?: number | null; generationId?: string | null; providerRequestId?: string | null;
  inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null;
  costUsd?: string | number | null;
  latencyMs?: number | null; errorCategory?: string | null; startedAt: string;
};

export type IntelligenceOutcome = {
  id: string;
  recommendationId: string;
  taskId?: string | null;
  metricKey: string;
  expectedValue?: string | number | null;
  realizedValue?: string | number | null;
  variance?: string | number | null;
  absolutePercentageError?: string | number | null;
  unit: string;
  currency?: string | null;
  attributionMethod: string;
  provenance: string;
  outcomeStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'UNKNOWN' | string;
  quality: string;
  observedAt: string;
  recommendation?: { id: string; module: IntelligenceModule; title: string };
};

export type IntelligenceHealth = {
  status: string; generatedAt: string;
  configuredModels: { executive: string; specialist: string };
  modelProvider: { authentication: string; connection: string };
  worker: { status: string; lastHeartbeatAt: string | null; workerId: string | null };
  queue: { oldestPendingAt: string | null; ageSeconds: number };
  runtimes: Array<{ profile: string; status: string }>;
  models: Array<{ model: string; status: string; capabilities: { structured: string; toolCalling: string } }>;
  recentProviderFailures: number; snapshotCount: number; providerBoundary: string;
};

export type IntelligenceControls = {
  state: {
    globalPaused: boolean;
    providerPaused: boolean;
    schedulesPaused: boolean;
    eventTriggersPaused: boolean;
    notificationsPaused: boolean;
    pausedProfiles: string[];
    updatedAt?: string | null;
  };
  enabled: boolean;
  providerEnabled: boolean;
  schedulesEnabled: boolean;
  eventTriggersEnabled: boolean;
  notificationsEnabled: boolean;
  shadowMode: boolean;
  pausedProfiles: string[];
  infrastructure: {
    enabled: boolean;
    providerEnabled: boolean;
    schedulesEnabled: boolean;
    eventTriggersEnabled: boolean;
    notificationsEnabled: boolean;
  };
};
