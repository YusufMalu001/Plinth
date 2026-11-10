import { IntelligenceModule } from '@prisma/client';

export interface IntelligenceActionDefinition {
  code: string;
  module: IntelligenceModule;
  label: string;
  requiredApprovalPermission: string;
}

const actions: IntelligenceActionDefinition[] = [
  { code: 'sales.repeat_order_outreach', module: 'SALES', label: 'Contact customers whose repeat-order window is due', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'sales.dormant_customer_follow_up', module: 'SALES', label: 'Review dormant customers for a targeted follow-up', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'sales.available_stock_campaign', module: 'SALES', label: 'Prepare a stock-aware sales campaign for review', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'sales.margin_review', module: 'SALES', label: 'Review low-margin orders or products before further selling', requiredApprovalPermission: 'review:Recommendation' },
  { code: 'sales.seasonal_surge_preparation', module: 'SALES', label: 'Prepare pricing, promotions, and stock for seasonal demand surge', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'sales.margin_leakage_remediation', module: 'SALES', label: 'Remediate unrecorded freight or discount margin leakage', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'sales.marketplace_order_exception_review', module: 'SALES', label: 'Resolve an Amazon or E-Trade order validation exception', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'inventory.replenishment_review', module: 'INVENTORY', label: 'Review a replenishment proposal', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'inventory.excess_stock_action', module: 'INVENTORY', label: 'Review excess or ageing inventory disposition options', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'inventory.stock_accuracy_check', module: 'INVENTORY', label: 'Schedule a targeted physical stock verification', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'inventory.bulk_purchase_evaluation', module: 'INVENTORY', label: 'Evaluate bulk purchase discount vs holding cost trade-off', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'procurement.vendor_follow_up', module: 'PROCUREMENT', label: 'Follow up with a vendor about delivery risk', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'procurement.purchase_timing_review', module: 'PROCUREMENT', label: 'Review purchase timing, quantity, and exposure', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'procurement.vendor_mix_review', module: 'PROCUREMENT', label: 'Review vendor concentration and alternate approved sources', requiredApprovalPermission: 'review:Recommendation' },
  { code: 'procurement.bulk_purchase_evaluation', module: 'PROCUREMENT', label: 'Evaluate seasonal bulk raw material discount advantage', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'procurement.vendor_reliability_action', module: 'PROCUREMENT', label: 'Address vendor SLA and quality variance with corrective action', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'production.schedule_review', module: 'PRODUCTION', label: 'Review production sequence against demand and material availability', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'production.shortage_resolution', module: 'PRODUCTION', label: 'Resolve a material shortage blocking confirmed demand', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'production.capacity_review', module: 'PRODUCTION', label: 'Review a capacity or bottleneck conflict', requiredApprovalPermission: 'review:Recommendation' },
  { code: 'production.bottleneck_rebalancing', module: 'PRODUCTION', label: 'Rebalance workstation load and shift planning for bottleneck relief', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'production.quality_loss_review', module: 'PRODUCTION', label: 'Investigate certified inspection defects or abnormal production loss', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'fulfillment.priority_review', module: 'FULFILLMENT', label: 'Review dispatch priority for at-risk orders', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'fulfillment.carrier_follow_up', module: 'FULFILLMENT', label: 'Follow up on carrier or delivery performance risk', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'fulfillment.backlog_resolution', module: 'FULFILLMENT', label: 'Review pick, pack, or dispatch backlog', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'fulfillment.freight_consolidation', module: 'FULFILLMENT', label: 'Consolidate multi-order dispatches for freight cost reduction', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'executive.cross_module_review', module: 'EXECUTIVE', label: 'Coordinate a cross-module profitable-growth action', requiredApprovalPermission: 'review:Recommendation' },
  { code: 'executive.data_quality_remediation', module: 'EXECUTIVE', label: 'Assign remediation for a decision-critical data gap', requiredApprovalPermission: 'accept:Recommendation' },
  { code: 'executive.festive_capital_allocation', module: 'EXECUTIVE', label: 'Allocate seasonal working capital to high-turnover bulk inventory', requiredApprovalPermission: 'accept:Recommendation' },
];

export const INTELLIGENCE_ACTION_CATALOGUE = Object.freeze(actions);

export function findActionDefinition(code: string) {
  return INTELLIGENCE_ACTION_CATALOGUE.find((action) => action.code === code);
}

export function actionsForModule(module: IntelligenceModule) {
  return INTELLIGENCE_ACTION_CATALOGUE.filter((action) => action.module === module || module === 'EXECUTIVE');
}
