import { IntelligenceModule } from '@prisma/client';
import { config } from '../../config';

export interface IntelligenceProfileDefinition {
  key: string;
  module: IntelligenceModule;
  displayName: string;
  runtimeUrl: string;
  runtimeKey: string;
  mcpToken: string;
  tools: readonly string[];
}

const sharedEvidenceTools = ['get_metric_definition', 'get_resource_evidence'] as const;

export function intelligenceProfiles(): IntelligenceProfileDefinition[] {
  return [
    {
      key: 'executive-advisor', module: 'EXECUTIVE', displayName: 'Executive Super Agent',
      runtimeUrl: config.intelligence.runtimeUrls.executive,
      runtimeKey: config.intelligence.runtimeKeys.executive, mcpToken: config.intelligence.mcpTokens.executive,
      tools: [
        'get_sales_performance', 'get_customer_opportunities', 'get_inventory_risk', 'get_replenishment_options',
        'get_vendor_performance', 'get_production_capacity', 'get_quality_and_loss', 'get_fulfillment_sla_risk',
        'get_financial_summary', 'get_seasonal_demand_forecast', 'simulate_bulk_purchase_tradeoff',
        'get_vendor_reliability_scorecard', 'get_production_bottleneck_matrix', 'get_margin_leakage_audit',
        'get_dispatch_consolidation_options', 'get_comprehensive_enterprise_pulse', ...sharedEvidenceTools,
      ],
    },
    {
      key: 'sales-advisor', module: 'SALES', displayName: 'Sales and customer growth advisor',
      runtimeUrl: config.intelligence.runtimeUrls.sales,
      runtimeKey: config.intelligence.runtimeKeys.sales, mcpToken: config.intelligence.mcpTokens.sales,
      tools: ['get_sales_performance', 'get_customer_opportunities', 'get_seasonal_demand_forecast', 'get_margin_leakage_audit', ...sharedEvidenceTools],
    },
    {
      key: 'inventory-advisor', module: 'INVENTORY', displayName: 'Inventory and stock advisor',
      runtimeUrl: config.intelligence.runtimeUrls.inventory,
      runtimeKey: config.intelligence.runtimeKeys.inventory, mcpToken: config.intelligence.mcpTokens.inventory,
      tools: ['get_inventory_risk', 'get_replenishment_options', 'simulate_bulk_purchase_tradeoff', ...sharedEvidenceTools],
    },
    {
      key: 'procurement-advisor', module: 'PROCUREMENT', displayName: 'Procurement and vendor advisor',
      runtimeUrl: config.intelligence.runtimeUrls.procurement,
      runtimeKey: config.intelligence.runtimeKeys.procurement, mcpToken: config.intelligence.mcpTokens.procurement,
      tools: ['get_vendor_performance', 'get_replenishment_options', 'simulate_bulk_purchase_tradeoff', 'get_vendor_reliability_scorecard', ...sharedEvidenceTools],
    },
    {
      key: 'production-advisor', module: 'PRODUCTION', displayName: 'Production and manufacturing advisor',
      runtimeUrl: config.intelligence.runtimeUrls.production,
      runtimeKey: config.intelligence.runtimeKeys.production, mcpToken: config.intelligence.mcpTokens.production,
      tools: ['get_production_capacity', 'get_inventory_risk', 'get_quality_and_loss', 'get_production_bottleneck_matrix', ...sharedEvidenceTools],
    },
    {
      key: 'fulfillment-advisor', module: 'FULFILLMENT', displayName: 'Fulfillment and dispatch advisor',
      runtimeUrl: config.intelligence.runtimeUrls.fulfillment,
      runtimeKey: config.intelligence.runtimeKeys.fulfillment, mcpToken: config.intelligence.mcpTokens.fulfillment,
      tools: ['get_fulfillment_sla_risk', 'get_sales_performance', 'get_dispatch_consolidation_options', ...sharedEvidenceTools],
    },
  ];
}

export function profileForModule(module: IntelligenceModule) {
  return intelligenceProfiles().find((profile) => profile.module === module);
}

export function profileByKey(key: string) {
  return intelligenceProfiles().find((profile) => profile.key === key);
}
