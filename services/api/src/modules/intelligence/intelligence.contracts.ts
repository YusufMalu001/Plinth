import { z } from 'zod';

export const intelligenceModules = [
  'EXECUTIVE',
  'SALES',
  'INVENTORY',
  'PROCUREMENT',
  'PRODUCTION',
  'FULFILLMENT',
  'QUALITY',
  'FINANCE',
  'SYSTEM',
] as const;

export const intelligenceModuleSchema = z.enum(intelligenceModules);

export const productPricingAnalysisSchema = z.object({
  productId: z.string().uuid(),
  targetMarginPercent: z.number().finite().gt(0).lt(90).default(45),
}).strict();

export const intelligenceAdvisorModules = [
  'EXECUTIVE',
  'SALES',
  'INVENTORY',
  'PROCUREMENT',
  'PRODUCTION',
  'FULFILLMENT',
] as const;

export const intelligenceAdvisorModuleSchema = z.enum(intelligenceAdvisorModules);

export const evidenceReferenceSchema = z.object({
  metricKey: z.string().min(1).max(120),
  metricVersion: z.string().min(1).max(40),
  value: z.number().finite(),
  unit: z.string().min(1).max(40),
  currency: z.string().length(3).optional(),
  sourceResource: z.string().min(1).max(80),
  sourceResourceId: z.string().max(120).optional(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  dataTimestamp: z.string().datetime(),
}).strict();

export const expectedImpactSchema = z.object({
  metricKey: z.string().min(1).max(120),
  unit: z.string().min(1).max(40),
  currency: z.string().length(3).optional(),
  horizonDays: z.number().int().min(1).max(365),
  low: z.number().finite(),
  base: z.number().finite(),
  high: z.number().finite(),
  sourceMetricKeys: z.array(z.string().min(1).max(120)).min(1).max(10),
}).strict().superRefine((value, context) => {
  if (value.low > value.base || value.base > value.high) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected impact must satisfy low <= base <= high.' });
  }
});

export const runtimeRecommendationSchema = z.object({
  opportunityRef: z.string().min(1).max(160),
  category: z.string().min(1).max(80),
  title: z.string().min(8).max(160),
  situation: z.string().min(12).max(1200),
  rationale: z.string().min(12).max(1200),
  proposedAction: z.object({
    code: z.string().min(1).max(100),
    summary: z.string().min(8).max(800),
  }).strict(),
  evidence: z.array(evidenceReferenceSchema).min(1).max(20),
  expectedImpact: expectedImpactSchema,
  assumptions: z.array(z.string().min(1).max(400)).max(12),
  risks: z.array(z.string().min(1).max(400)).min(1).max(12),
  dependencies: z.array(z.string().min(1).max(400)).max(12),
  alternatives: z.array(z.string().min(1).max(400)).max(8),
  confidence: z.number().min(0).max(1),
  confidenceExplanation: z.string().min(8).max(600),
  suggestedOwnerRole: z.string().min(1).max(80),
  urgency: z.enum(['LOW', 'NORMAL', 'HIGH', 'IMMEDIATE']),
  recommendedDueAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  requiredApprovalPermission: z.string().min(3).max(120),
  costCoverageScore: z.number().min(0).max(1),
  dataQualityScore: z.number().min(0).max(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
}).strict();

export const runtimeRecommendationEnvelopeSchema = z.object({
  schemaVersion: z.literal('1.0'),
  promptVersion: z.string().min(1).max(40),
  module: intelligenceModuleSchema,
  recommendations: z.array(runtimeRecommendationSchema).max(10),
}).strict();

export type RuntimeRecommendationEnvelope = z.infer<typeof runtimeRecommendationEnvelopeSchema>;
export type RuntimeRecommendation = z.infer<typeof runtimeRecommendationSchema>;

export const listRecommendationsQuerySchema = z.object({
  module: intelligenceModuleSchema.optional(),
  status: z.enum(['OPEN', 'ACCEPTED', 'DISMISSED', 'DEFERRED', 'EXPIRED', 'SUPERSEDED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export const acceptRecommendationSchema = z.object({
  assigneeId: z.string().uuid(),
  dueAt: z.string().datetime(),
  managerNotes: z.string().trim().max(2000).optional(),
}).strict();

export const dismissRecommendationSchema = z.object({
  reason: z.string().trim().min(5).max(2000),
}).strict();

export const deferRecommendationSchema = z.object({
  reason: z.string().trim().min(5).max(2000),
  deferredUntil: z.string().datetime(),
}).strict();

export const updateTaskSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'CANCELLED']).optional(),
  assigneeId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
  comment: z.string().trim().min(1).max(2000).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one task field is required.');

export const completeTaskSchema = z.object({
  comment: z.string().trim().min(3).max(2000),
  evidence: z.record(z.unknown()).optional(),
  outcome: z.object({
    metricKey: z.string().trim().min(1).max(120),
    expectedValue: z.number().finite().optional(),
    realizedValue: z.number().finite(),
    unit: z.string().trim().min(1).max(40),
    currency: z.string().length(3).optional(),
    attributionMethod: z.enum(['DIRECT_TRANSACTION_RECONCILIATION', 'CONTROLLED_COMPARISON', 'MANAGER_ESTIMATE']),
    observedAt: z.string().datetime(),
    notes: z.string().trim().max(1000).optional(),
  }).strict().optional(),
}).strict();

export const linkTaskActionSchema = z.object({
  actionResourceType: z.enum(['PurchaseOrder', 'SalesOrder', 'ProductionPlan']),
  actionResourceId: z.string().trim().min(1).max(120),
}).strict();

export const updateObjectivePolicySchema = z.object({
  weights: z.object({
    contributionMargin: z.number().min(0).max(1),
    orderRevenueGrowth: z.number().min(0).max(1),
    serviceLevel: z.number().min(0).max(1),
    workingCapital: z.number().min(0).max(1),
    operationalRisk: z.number().min(0).max(1),
  }).strict(),
  guardrails: z.object({
    reportingCurrency: z.string().length(3).default('INR'),
    minimumCostCoverage: z.number().min(0).max(1),
    minimumDataQuality: z.number().min(0).max(1),
    autonomousErpWrites: z.literal(false),
    protectConfirmedOrders: z.boolean(),
    protectSafetyStock: z.boolean(),
    maximumInventoryValue: z.number().nonnegative().optional(),
    maximumPurchaseExposure: z.number().nonnegative().optional(),
    minimumMarginByFamily: z.record(z.number().min(-1).max(1)).optional(),
  }).strict(),
  effectiveFrom: z.string().datetime(),
}).strict().superRefine((value, context) => {
  const total = Object.values(value.weights).reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(total - 1) > 0.0001) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Objective weights must total exactly 1.0.', path: ['weights'] });
  }
});

export const updateIntelligenceControlsSchema = z.object({
  globalPaused: z.boolean(),
  providerPaused: z.boolean(),
  schedulesPaused: z.boolean(),
  eventTriggersPaused: z.boolean(),
  notificationsPaused: z.boolean(),
  pausedProfiles: z.array(z.enum([
    'executive-advisor',
    'sales-advisor',
    'inventory-advisor',
    'procurement-advisor',
    'production-advisor',
    'fulfillment-advisor',
  ])).max(6),
}).strict();

export const askBusinessSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  module: intelligenceAdvisorModuleSchema.optional().default('EXECUTIVE'),
}).strict();

export const runtimeQuestionResponseSchema = z.object({
  schemaVersion: z.literal('1.0'),
  answer: z.string().trim().min(1).max(20_000),
  // Empty evidence is valid only for an explicit insufficient-evidence answer.
  evidence: z.array(evidenceReferenceSchema).max(20),
  limitations: z.array(z.string().trim().min(1).max(500)).max(10),
  dailyBriefing: z.object({
    headline: z.string().trim().min(1).max(180),
    overallStatus: z.enum(['GREEN', 'AMBER', 'RED', 'INSUFFICIENT_EVIDENCE']),
    executiveSummary: z.string().trim().min(1).max(1200),
    keyUpdates: z.array(z.object({
      title: z.string().trim().min(1).max(160),
      detail: z.string().trim().min(1).max(800),
      whyItMatters: z.string().trim().min(1).max(600),
      priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
      evidenceMetricKeys: z.array(z.string().min(1).max(120)).min(1).max(5),
    }).strict()).max(8),
    risks: z.array(z.object({
      title: z.string().trim().min(1).max(160),
      detail: z.string().trim().min(1).max(600),
      evidenceMetricKeys: z.array(z.string().min(1).max(120)).min(1).max(5),
    }).strict()).max(6),
    recommendedFocus: z.array(z.object({
      action: z.string().trim().min(1).max(240),
      rationale: z.string().trim().min(1).max(600),
      evidenceMetricKeys: z.array(z.string().min(1).max(120)).min(1).max(5),
    }).strict()).max(5),
    dataCaveats: z.array(z.string().trim().min(1).max(500)).max(6),
  }).strict().optional(),
}).strict();

export type RuntimeQuestionResponse = z.infer<typeof runtimeQuestionResponseSchema>;

export const mcpToolCallArgumentsSchema = z.object({
  snapshotId: z.string().uuid().optional(),
  metricKey: z.string().max(120).optional(),
  metricVersion: z.string().max(40).optional(),
  periodDays: z.number().int().min(1).max(365).optional(),
  resourceType: z.string().max(80).optional(),
  resourceId: z.string().max(120).optional(),
  categoryId: z.string().max(120).optional(),
  productId: z.string().max(120).optional(),
  vendorId: z.string().max(120).optional(),
  workCenterId: z.string().max(120).optional(),
  bulkDiscountPercent: z.number().min(0).max(100).optional(),
  holdingCostPercent: z.number().min(0).max(100).optional(),
  volumeMultiplier: z.number().min(0.1).max(10).optional(),
  horizonDays: z.number().int().min(1).max(365).optional(),
  minMarginRate: z.number().min(-1).max(1).optional(),
}).strict();
