import { NextFunction, Request, Response, Router } from 'express';
import { config } from '../../config';
import { AppError, ForbiddenError, ValidationError } from '../../common/errors/AppError';
import { DbAuditWriter } from '../../common/audit/db-audit-writer';
import { servicePrincipalService } from './services/service-principal.service';
import { mcpToolCallArgumentsSchema } from './intelligence.contracts';
import { intelligenceToolsService } from './services/intelligence-tools.service';
import { intelligenceControlsService } from './services/intelligence-controls.service';

const router = Router();
const audit = new DbAuditWriter();

const toolDescriptions: Record<string, string> = {
  get_sales_performance: 'Return the latest immutable certified sales and contribution-margin snapshot.',
  get_customer_opportunities: 'Return deterministic sales/customer opportunities without contact details or free-text notes.',
  get_inventory_risk: 'Return certified inventory value, availability, cost coverage, expiry, and replenishment risk.',
  get_replenishment_options: 'Return deterministic read-only replenishment review options.',
  get_vendor_performance: 'Return certified procurement exposure and vendor risk summaries.',
  get_production_capacity: 'Return certified production output, attainment, yield, late plan, and shortage metrics.',
  get_quality_and_loss: 'Return certified quality and loss metrics when available.',
  get_fulfillment_sla_risk: 'Return certified fulfillment backlog, late-dispatch, and delivery service metrics.',
  get_financial_summary: 'Return tax-excluded revenue, actual-cost COGS, collections, and known contribution margin. Never returns net profit.',
  get_metric_definition: 'Return deterministic definitions and versions for certified metrics. Optional metricKey and metricVersion filter the results.',
  get_resource_evidence: 'Return an allowlisted, PII-minimized business resource referenced by evidence. Requires resourceType and resourceId from a metric sourceRef; do not pass metricKey or metricVersion.',
  get_seasonal_demand_forecast: 'Project category-level sales surges using historical trends and active quotes.',
  simulate_bulk_purchase_tradeoff: 'Compare volume discount savings against inventory holding/carrying costs over a specified time horizon.',
  get_vendor_reliability_scorecard: 'Dynamically score suppliers on on-time delivery %, price variance, and quality defect rates.',
  get_production_bottleneck_matrix: 'Analyze active work order demand vs machine center capacity and material shortages.',
  get_margin_leakage_audit: 'Audit orders and customer contracts where freight, discounts, or production variances eroded contribution margin.',
  get_dispatch_consolidation_options: 'Identify multi-order vehicle consolidation opportunities to reduce outbound freight spend.',
  get_comprehensive_enterprise_pulse: 'Synthesize cross-departmental KPI pulse matrix and risk indicators for the Executive Super Agent.',
};

const inputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    snapshotId: { type: 'string', format: 'uuid' },
    metricKey: { type: 'string', maxLength: 120 },
    metricVersion: { type: 'string', maxLength: 40 },
    periodDays: { type: 'integer', minimum: 1, maximum: 365 },
    resourceType: { type: 'string', maxLength: 80 },
    resourceId: { type: 'string', maxLength: 120 },
    categoryId: { type: 'string', maxLength: 120 },
    productId: { type: 'string', maxLength: 120 },
    vendorId: { type: 'string', maxLength: 120 },
    workCenterId: { type: 'string', maxLength: 120 },
    bulkDiscountPercent: { type: 'number', minimum: 0, maximum: 100 },
    holdingCostPercent: { type: 'number', minimum: 0, maximum: 100 },
    volumeMultiplier: { type: 'number', minimum: 0.1, maximum: 10 },
    horizonDays: { type: 'integer', minimum: 1, maximum: 365 },
    minMarginRate: { type: 'number', minimum: -1, maximum: 1 },
  },
};

router.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authorization = req.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) return res.status(401).json({ jsonrpc: '2.0', id: req.body?.id ?? null, error: { code: -32001, message: 'Service credential required.' } });
    req.servicePrincipal = await servicePrincipalService.authenticate(token);
    const controls = await intelligenceControlsService.effective();
    if (!controls.enabled || controls.pausedProfiles.includes(req.servicePrincipal.profileKey)) {
      return res.status(503).json({ jsonrpc: '2.0', id: req.body?.id ?? null, error: { code: -32004, message: 'This intelligence profile is paused.' } });
    }
    return next();
  } catch (error) {
    const message = error instanceof AppError ? error.message : 'Service authentication failed.';
    return res.status(401).json({ jsonrpc: '2.0', id: req.body?.id ?? null, error: { code: -32001, message } });
  }
});

router.post('/', async (req: Request, res: Response, _next: NextFunction) => {
  const id = req.body?.id ?? null;
  const result = (value: unknown) => res.json({ jsonrpc: '2.0', id, result: value });
  const failure = (code: number, message: string) => res.status(code === -32601 ? 404 : 400).json({ jsonrpc: '2.0', id, error: { code, message } });
  try {
    const method = String(req.body?.method ?? '');
    if (method === 'initialize') return result({ protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'synergy-intelligence-read-tools', version: '1.0.0' } });
    if (method === 'ping') return result({});
    if (method === 'notifications/initialized') return res.status(202).end();
    if (method === 'tools/list') {
      const tools = (req.servicePrincipal?.tools ?? []).filter((name) => name in toolDescriptions).map((name) => ({ name, description: toolDescriptions[name], inputSchema }));
      return result({ tools });
    }
    if (method !== 'tools/call') return failure(-32601, 'Method not found.');
    const name = String(req.body?.params?.name ?? '');
    if (!req.servicePrincipal?.tools.includes(name)) throw new ForbiddenError(`Tool '${name}' is not granted to this service principal.`);
    const parsed = mcpToolCallArgumentsSchema.safeParse(req.body?.params?.arguments ?? {});
    if (!parsed.success) throw new ValidationError('Invalid tool arguments.', parsed.error.flatten());
    const output = await intelligenceToolsService.execute(name, parsed.data, req.servicePrincipal.module);
    const serialized = JSON.stringify(output);
    if (Buffer.byteLength(serialized, 'utf8') > config.intelligence.mcpMaxResponseBytes) {
      throw new ValidationError('Tool response exceeded the configured safe response size. Narrow the request.');
    }
    await audit.record({
      actorId: 'system',
      action: 'intelligence.read_tool_call',
      entityType: 'ServicePrincipal',
      entityId: req.servicePrincipal.id,
      after: { profileKey: req.servicePrincipal.profileKey, tool: name, argumentKeys: Object.keys(parsed.data) },
      requestId: req.id,
    });
    return result({ content: [{ type: 'text', text: serialized }], isError: false });
  } catch (error) {
    const rpcCode = error instanceof ValidationError ? -32602 : error instanceof ForbiddenError ? -32003 : -32603;
    const message = error instanceof AppError ? error.message : 'Internal read-tool error.';
    return res.status(200).json({ jsonrpc: '2.0', id, error: { code: rpcCode, message } });
  }
});

export default router;
