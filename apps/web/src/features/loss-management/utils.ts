import React from 'react';
import { Truck, Cog, ShieldAlert, RotateCcw } from 'lucide-react';

export interface LossScenarioMeta {
  number: string;
  label: string;
  shortLabel: string;
  tagline: string;
  color: string;
  badgeBg: string;
  icon: React.ElementType;
}

export function getLossScenarioMeta(evt: {
  materialId?: string | null;
  productId?: string | null;
  sourceType: string;
  reason?: string | null;
}): LossScenarioMeta {
  const r = (evt.reason || '').toLowerCase();
  if (
    evt.materialId ||
    evt.sourceType === 'GRN_DISCREPANCY' ||
    r.includes('raw material') ||
    r.includes('incoming') ||
    r.includes('dock') ||
    r.includes('supplier')
  ) {
    return {
      number: '01',
      label: 'Inward Raw Material QC',
      shortLabel: 'Inward QC',
      tagline: 'Dock Receiving & Incoming Inspection',
      color: 'border-border bg-muted/60 text-foreground',
      badgeBg: 'bg-muted text-foreground border-border',
      icon: Truck,
    };
  }
  if (
    evt.sourceType === 'DEPARTMENT_EXECUTION_EXCEPTION' ||
    r.includes('semi-finished') ||
    r.includes('wip') ||
    r.includes('machine') ||
    r.includes('cnc') ||
    r.includes('welding') ||
    r.includes('shopfloor')
  ) {
    return {
      number: '02',
      label: 'In-Process WIP Defect',
      shortLabel: 'WIP Defect',
      tagline: 'Shopfloor Execution Loss & Machine Run',
      color: 'border-border bg-muted/60 text-foreground',
      badgeBg: 'bg-muted text-foreground border-border',
      icon: Cog,
    };
  }
  if (
    r.includes('final') ||
    r.includes('assembly') ||
    r.includes('qa') ||
    r.includes('cosmetic') ||
    r.includes('testing') ||
    evt.sourceType === 'QC_REJECTION_NO_BATCH'
  ) {
    return {
      number: '03',
      label: 'Final Assembly QA Defect',
      shortLabel: 'Assembly QA',
      tagline: 'Pre/Post Assembly QC Rejection',
      color: 'border-border bg-muted/60 text-foreground',
      badgeBg: 'bg-muted text-foreground border-border',
      icon: ShieldAlert,
    };
  }
  return {
    number: '04',
    label: 'Customer / Dealer RMA',
    shortLabel: 'Customer RMA',
    tagline: 'Customer & Trader Defective Returns',
    color: 'border-border bg-muted/60 text-foreground',
    badgeBg: 'bg-muted text-foreground border-border',
    icon: RotateCcw,
  };
}
