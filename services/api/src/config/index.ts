/* eslint-disable no-console */
import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env file from root directory in development only (never in test or production)
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
}

const localSecret = 'local-development-secret-change-before-deploying';
export const PHASE0_INTELLIGENCE_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free' as const;
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production', 'staging']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  API_VERSION: z.string().default('v1'),
  JWT_SECRET: z.string().min(32).default(localSecret),
  JWT_REFRESH_SECRET: z.string().min(32).default(`${localSecret}-refresh`),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  STAGING_WEB_ORIGIN: z.string().url().optional(),
  PRODUCTION_WEB_ORIGIN: z.string().url().optional(),
  DATABASE_URL: z.string().default(''),
  DIRECT_URL: z.string().default(''),
  SUPABASE_URL: z.string().url().optional().or(z.literal('')),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  SUPABASE_SECRET_KEY: z.string().default(''),
  SUPABASE_PRODUCT_BUCKET: z.string().default('product-images'),
  SUPABASE_STORAGE_BUCKET: z.string().default('goods-receipts'),
  OPENROUTER_API_KEY: z.string().default(''),
  OPENROUTER_OCR_MODEL: z.string().default(''),
  OPENROUTER_VENDOR_MODEL: z.string().default(''),
  OPENROUTER_VENDOR_ADVISORY_ENABLED: z.enum(['true', 'false']).default('false'),
  GEMINI_API_KEY: z.string().default(''),
  // 2.5 Flash is the stable low-latency baseline for direct Gemini testing;
  // deployments can override this with a newer model explicitly.
  GEMINI_OCR_MODEL: z.string().default('gemini-2.5-flash'),
  OCR_PROVIDER: z.enum(['auto', 'openrouter', 'gemini']).default('auto'),
  OPENROUTER_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  OCR_TIMEOUT_MS: z.coerce.number().int().min(5000).default(90000),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  EMAIL_FROM_ADDRESS: z.string().email().or(z.literal('')).default(''),
  EMAIL_FROM_NAME: z.string().default('Synergy Procurement'),
  OPENROUTER_MONTHLY_BUDGET_USD: z.coerce.number().nonnegative().default(100),
  INTELLIGENCE_ENABLED: z.enum(['true', 'false']).default('false'),
  INTELLIGENCE_SHADOW_MODE: z.enum(['true', 'false']).default('true'),
  INTELLIGENCE_EVENT_TRIGGERS_ENABLED: z.enum(['true', 'false']).default('false'),
  INTELLIGENCE_SCHEDULES_ENABLED: z.enum(['true', 'false']).default('false'),
  INTELLIGENCE_NOTIFICATIONS_ENABLED: z.enum(['true', 'false']).default('false'),
  INTELLIGENCE_PROVIDER_ENABLED: z.enum(['true', 'false']).default('false'),
  INTELLIGENCE_CONVERSATIONS_ENABLED: z.enum(['true', 'false']).default('false'),
  INTELLIGENCE_CASES_ENABLED: z.enum(['true', 'false']).default('false'),
  INTELLIGENCE_SCENARIOS_ENABLED: z.enum(['true', 'false']).default('false'),
  INTELLIGENCE_DELEGATION_ENABLED: z.enum(['true', 'false']).default('false'),
  INTELLIGENCE_DISABLED_PROFILES: z.string().default(''),
  INTELLIGENCE_RUNTIME_URL: z.string().url().default('http://agent-runtime:8642'),
  INTELLIGENCE_EXECUTIVE_RUNTIME_URL: z.string().url().optional().or(z.literal('')),
  INTELLIGENCE_SALES_RUNTIME_URL: z.string().url().optional().or(z.literal('')),
  INTELLIGENCE_INVENTORY_RUNTIME_URL: z.string().url().optional().or(z.literal('')),
  INTELLIGENCE_PROCUREMENT_RUNTIME_URL: z.string().url().optional().or(z.literal('')),
  INTELLIGENCE_PRODUCTION_RUNTIME_URL: z.string().url().optional().or(z.literal('')),
  INTELLIGENCE_FULFILLMENT_RUNTIME_URL: z.string().url().optional().or(z.literal('')),
  INTELLIGENCE_RUNTIME_TIMEOUT_MS: z.coerce.number().int().min(5000).max(600000).default(180000),
  INTELLIGENCE_RUNTIME_POLL_MS: z.coerce.number().int().min(250).max(10000).default(1000),
  INTELLIGENCE_PROVIDER: z.string().min(1).default('openrouter'),
  INTELLIGENCE_MODULE_MODEL: z.string().min(1).default(PHASE0_INTELLIGENCE_MODEL),
  INTELLIGENCE_EXECUTIVE_MODEL: z.string().min(1).default(PHASE0_INTELLIGENCE_MODEL),
  INTELLIGENCE_FALLBACK_MODEL: z.string().default(''),
  INTELLIGENCE_FREE_ONLY: z.enum(['true', 'false']).default('false'),
  INTELLIGENCE_ALLOW_FREE_PROVIDER_DATA_USE: z.enum(['true', 'false']).default('false'),
  INTELLIGENCE_MONTHLY_BUDGET_USD: z.coerce.number().positive().default(250),
  INTELLIGENCE_INPUT_COST_PER_MILLION_USD: z.coerce.number().nonnegative().default(0),
  INTELLIGENCE_OUTPUT_COST_PER_MILLION_USD: z.coerce.number().nonnegative().default(0),
  INTELLIGENCE_FALLBACK_INPUT_COST_PER_MILLION_USD: z.coerce.number().nonnegative().default(0),
  INTELLIGENCE_FALLBACK_OUTPUT_COST_PER_MILLION_USD: z.coerce.number().nonnegative().default(0),
  INTELLIGENCE_MAX_CONCURRENT_RUNS: z.coerce.number().int().min(1).max(20).default(4),
  INTELLIGENCE_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(50).default(12),
  INTELLIGENCE_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).max(16384).default(4096),
  INTELLIGENCE_MCP_MAX_RESPONSE_BYTES: z.coerce.number().int().min(4096).max(1048576).default(65536),
  INTELLIGENCE_MIN_COST_COVERAGE: z.coerce.number().min(0).max(1).default(0.8),
  INTELLIGENCE_MIN_DATA_QUALITY: z.coerce.number().min(0).max(1).default(0.8),
  INTELLIGENCE_EXECUTIVE_RUNTIME_KEY: z.string().default(''),
  INTELLIGENCE_SALES_RUNTIME_KEY: z.string().default(''),
  INTELLIGENCE_INVENTORY_RUNTIME_KEY: z.string().default(''),
  INTELLIGENCE_PROCUREMENT_RUNTIME_KEY: z.string().default(''),
  INTELLIGENCE_PRODUCTION_RUNTIME_KEY: z.string().default(''),
  INTELLIGENCE_FULFILLMENT_RUNTIME_KEY: z.string().default(''),
  INTELLIGENCE_EXECUTIVE_MCP_TOKEN: z.string().default(''),
  INTELLIGENCE_SALES_MCP_TOKEN: z.string().default(''),
  INTELLIGENCE_INVENTORY_MCP_TOKEN: z.string().default(''),
  INTELLIGENCE_PROCUREMENT_MCP_TOKEN: z.string().default(''),
  INTELLIGENCE_PRODUCTION_MCP_TOKEN: z.string().default(''),
  INTELLIGENCE_FULFILLMENT_MCP_TOKEN: z.string().default('')
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

if (
  parsed.data.NODE_ENV === 'production' &&
  (parsed.data.JWT_SECRET === localSecret || parsed.data.JWT_REFRESH_SECRET === `${localSecret}-refresh`)
) {
  throw new Error('Production JWT secrets must be configured explicitly');
}

const supabaseKey = parsed.data.SUPABASE_SERVICE_ROLE_KEY || parsed.data.SUPABASE_SECRET_KEY;
if (parsed.data.NODE_ENV === 'production' && (!parsed.data.SUPABASE_URL || !supabaseKey)) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured explicitly in production');
}

export const config = {
  env: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  apiVersion: parsed.data.API_VERSION,
  jwtSecret: parsed.data.JWT_SECRET,
  jwtRefreshSecret: parsed.data.JWT_REFRESH_SECRET,
  accessTokenTtlMinutes: parsed.data.ACCESS_TOKEN_TTL_MINUTES,
  refreshTokenTtlDays: parsed.data.REFRESH_TOKEN_TTL_DAYS,
  webOrigin: (parsed.data.NODE_ENV === 'staging' && parsed.data.STAGING_WEB_ORIGIN)
    || (parsed.data.NODE_ENV === 'production' && parsed.data.PRODUCTION_WEB_ORIGIN)
    || parsed.data.WEB_ORIGIN,
  stagingWebOrigin: parsed.data.STAGING_WEB_ORIGIN,
  productionWebOrigin: parsed.data.PRODUCTION_WEB_ORIGIN,
  databaseUrl: parsed.data.DATABASE_URL,
  directUrl: parsed.data.DIRECT_URL,
  supabaseUrl: parsed.data.SUPABASE_URL || '',
  supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY || parsed.data.SUPABASE_SECRET_KEY,
  supabaseProductBucket: parsed.data.SUPABASE_PRODUCT_BUCKET,
  supabaseStorageBucket: parsed.data.SUPABASE_STORAGE_BUCKET,
  openRouterApiKey: parsed.data.OPENROUTER_API_KEY,
  openRouterOcrModel: parsed.data.OPENROUTER_OCR_MODEL.trim().toLowerCase() === 'openrouter/free' ? '' : parsed.data.OPENROUTER_OCR_MODEL,
  openRouterVendorModel: parsed.data.OPENROUTER_VENDOR_MODEL.trim().toLowerCase() === 'openrouter/free' ? '' : parsed.data.OPENROUTER_VENDOR_MODEL,
  openRouterVendorAdvisoryEnabled: parsed.data.OPENROUTER_VENDOR_ADVISORY_ENABLED === 'true',
  geminiApiKey: parsed.data.GEMINI_API_KEY,
  geminiOcrModel: parsed.data.GEMINI_OCR_MODEL,
  ocrProvider: parsed.data.OCR_PROVIDER,
  openRouterTimeoutMs: parsed.data.OPENROUTER_TIMEOUT_MS,
  ocrTimeoutMs: parsed.data.OCR_TIMEOUT_MS,
  email: {
    smtpHost: parsed.data.SMTP_HOST,
    smtpPort: parsed.data.SMTP_PORT,
    smtpSecure: parsed.data.SMTP_SECURE === 'true',
    smtpUser: parsed.data.SMTP_USER,
    smtpPassword: parsed.data.SMTP_PASSWORD,
    fromAddress: parsed.data.EMAIL_FROM_ADDRESS,
    fromName: parsed.data.EMAIL_FROM_NAME,
    enabled: Boolean(parsed.data.SMTP_HOST && parsed.data.SMTP_USER && parsed.data.SMTP_PASSWORD && parsed.data.EMAIL_FROM_ADDRESS),
  },
  openRouterMonthlyBudgetUsd: parsed.data.OPENROUTER_MONTHLY_BUDGET_USD,
  intelligence: {
    enabled: parsed.data.INTELLIGENCE_ENABLED === 'true',
    shadowMode: parsed.data.INTELLIGENCE_SHADOW_MODE === 'true',
    eventTriggersEnabled: parsed.data.INTELLIGENCE_EVENT_TRIGGERS_ENABLED === 'true',
    schedulesEnabled: parsed.data.INTELLIGENCE_SCHEDULES_ENABLED === 'true',
    notificationsEnabled: parsed.data.INTELLIGENCE_NOTIFICATIONS_ENABLED === 'true',
    providerEnabled: parsed.data.INTELLIGENCE_PROVIDER_ENABLED === 'true',
    conversationsEnabled: parsed.data.INTELLIGENCE_CONVERSATIONS_ENABLED === 'true',
    casesEnabled: parsed.data.INTELLIGENCE_CASES_ENABLED === 'true',
    scenariosEnabled: parsed.data.INTELLIGENCE_SCENARIOS_ENABLED === 'true',
    delegationEnabled: parsed.data.INTELLIGENCE_DELEGATION_ENABLED === 'true',
    disabledProfiles: parsed.data.INTELLIGENCE_DISABLED_PROFILES.split(',').map((value) => value.trim()).filter(Boolean),
    runtimeUrl: parsed.data.INTELLIGENCE_RUNTIME_URL.replace(/\/$/, ''),
    runtimeUrls: {
      executive: parsed.data.INTELLIGENCE_EXECUTIVE_RUNTIME_URL?.replace(/\/$/, '') ?? '',
      sales: parsed.data.INTELLIGENCE_SALES_RUNTIME_URL?.replace(/\/$/, '') ?? '',
      inventory: parsed.data.INTELLIGENCE_INVENTORY_RUNTIME_URL?.replace(/\/$/, '') ?? '',
      procurement: parsed.data.INTELLIGENCE_PROCUREMENT_RUNTIME_URL?.replace(/\/$/, '') ?? '',
      production: parsed.data.INTELLIGENCE_PRODUCTION_RUNTIME_URL?.replace(/\/$/, '') ?? '',
      fulfillment: parsed.data.INTELLIGENCE_FULFILLMENT_RUNTIME_URL?.replace(/\/$/, '') ?? '',
    },
    runtimeTimeoutMs: parsed.data.INTELLIGENCE_RUNTIME_TIMEOUT_MS,
    runtimePollMs: parsed.data.INTELLIGENCE_RUNTIME_POLL_MS,
    provider: parsed.data.INTELLIGENCE_PROVIDER,
    moduleModel: parsed.data.INTELLIGENCE_MODULE_MODEL,
    executiveModel: parsed.data.INTELLIGENCE_EXECUTIVE_MODEL,
    fallbackModel: parsed.data.INTELLIGENCE_FALLBACK_MODEL,
    freeOnly: parsed.data.INTELLIGENCE_FREE_ONLY === 'true',
    allowFreeProviderDataUse: parsed.data.INTELLIGENCE_ALLOW_FREE_PROVIDER_DATA_USE === 'true',
    monthlyBudgetUsd: parsed.data.INTELLIGENCE_MONTHLY_BUDGET_USD,
    inputCostPerMillionUsd: parsed.data.INTELLIGENCE_INPUT_COST_PER_MILLION_USD,
    outputCostPerMillionUsd: parsed.data.INTELLIGENCE_OUTPUT_COST_PER_MILLION_USD,
    fallbackInputCostPerMillionUsd: parsed.data.INTELLIGENCE_FALLBACK_INPUT_COST_PER_MILLION_USD,
    fallbackOutputCostPerMillionUsd: parsed.data.INTELLIGENCE_FALLBACK_OUTPUT_COST_PER_MILLION_USD,
    maxConcurrentRuns: parsed.data.INTELLIGENCE_MAX_CONCURRENT_RUNS,
    maxToolCalls: parsed.data.INTELLIGENCE_MAX_TOOL_CALLS,
    maxOutputTokens: parsed.data.INTELLIGENCE_MAX_OUTPUT_TOKENS,
    mcpMaxResponseBytes: parsed.data.INTELLIGENCE_MCP_MAX_RESPONSE_BYTES,
    minimumCostCoverage: parsed.data.INTELLIGENCE_MIN_COST_COVERAGE,
    minimumDataQuality: parsed.data.INTELLIGENCE_MIN_DATA_QUALITY,
    runtimeKeys: {
      executive: parsed.data.INTELLIGENCE_EXECUTIVE_RUNTIME_KEY,
      sales: parsed.data.INTELLIGENCE_SALES_RUNTIME_KEY,
      inventory: parsed.data.INTELLIGENCE_INVENTORY_RUNTIME_KEY,
      procurement: parsed.data.INTELLIGENCE_PROCUREMENT_RUNTIME_KEY,
      production: parsed.data.INTELLIGENCE_PRODUCTION_RUNTIME_KEY,
      fulfillment: parsed.data.INTELLIGENCE_FULFILLMENT_RUNTIME_KEY,
    },
    mcpTokens: {
      executive: parsed.data.INTELLIGENCE_EXECUTIVE_MCP_TOKEN,
      sales: parsed.data.INTELLIGENCE_SALES_MCP_TOKEN,
      inventory: parsed.data.INTELLIGENCE_INVENTORY_MCP_TOKEN,
      procurement: parsed.data.INTELLIGENCE_PROCUREMENT_MCP_TOKEN,
      production: parsed.data.INTELLIGENCE_PRODUCTION_MCP_TOKEN,
      fulfillment: parsed.data.INTELLIGENCE_FULFILLMENT_MCP_TOKEN,
    },
  }
};
