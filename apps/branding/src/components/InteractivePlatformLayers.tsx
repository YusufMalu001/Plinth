import React, { useState } from 'react';
import { Cpu, ShieldCheck, Database, Layers } from 'lucide-react';

interface Layer {
  id: string;
  name: string;
  title: string;
  description: string;
  specs: string[];
  icon: React.FC<{ className?: string }>;
}

const LAYERS: Layer[] = [
  {
    id: 'ai-operator',
    name: 'Layer 4: AI Operator Control',
    title: 'Plain-language drafting with preview gates',
    description:
      'Translates natural language prompts into verified operational drafts. Constrained strictly to authenticated user roles with no unsanctioned direct DB writes.',
    specs: ['Plain language execution', 'Pre-save visual diff preview', 'Strict role enforcement', 'Deterministic error checks'],
    icon: Cpu,
  },
  {
    id: 'integrations',
    name: 'Layer 3: Integrations & Connectors',
    title: 'Bi-directional financial and logistics pipelines',
    description:
      'Seamlessly exports vouchers to Tally Prime, pushes invoices to GST portals, generates E-Way bills, and triggers automated WhatsApp vendor alerts.',
    specs: ['Tally Prime bi-directional sync', 'GST E-Invoice & E-Way bills', 'Direct WhatsApp dispatch links', 'Standard REST & CSV bridges'],
    icon: Layers,
  },
  {
    id: 'config-security',
    name: 'Layer 2: Configuration & Security',
    title: 'Custom fields, sequences, and RBAC control',
    description:
      'Configure custom attributes, document numbering sequences, and role-based policies without writing custom code or branching source repositories.',
    specs: ['Granular role-based permissions', 'Custom document serial formats', 'Configurable QC checklists', 'Multi-plant boundary locks'],
    icon: ShieldCheck,
  },
  {
    id: 'core-ledger',
    name: 'Layer 1: Unified Core & Immutable Ledger',
    title: 'Production, stock, and double-entry consistency',
    description:
      'The single industrial source of truth. Every raw material movement, BOM issue, scrap entry, and shipment creates an immutable, timestamped audit log.',
    specs: ['Double-entry stock ledger', 'Multi-level engineering BOM', 'Lot & batch provenance', 'Zero unaccounted stock variance'],
    icon: Database,
  },
];

export const InteractivePlatformLayers: React.FC = () => {
  const [activeLayerId, setActiveLayerId] = useState<string>('ai-operator');
  const activeLayer = LAYERS.find((l) => l.id === activeLayerId) || LAYERS[0];
  const Icon = activeLayer.icon;

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left interactive layer buttons / stack */}
      <div className="lg:col-span-5 space-y-2.5">
        {LAYERS.map((layer) => {
          const isSelected = layer.id === activeLayerId;
          const LayerIcon = layer.icon;
          return (
            <button
              key={layer.id}
              type="button"
              onClick={() => setActiveLayerId(layer.id)}
              onFocus={() => setActiveLayerId(layer.id)}
              className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between ${
                isSelected
                  ? 'bg-surface border-accent shadow-popover'
                  : 'bg-muted/50 border-border hover:bg-hover'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg border ${
                    isSelected
                      ? 'bg-accent-soft text-accent border-accent/30'
                      : 'bg-surface text-ink-secondary border-border'
                  }`}
                >
                  <LayerIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    {layer.name}
                  </div>
                  <div className="text-sm font-semibold text-ink">{layer.title}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Right detail preview panel */}
      <div className="lg:col-span-7 bg-surface border border-border rounded-xl p-6 sm:p-8 shadow-popover">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-lg bg-accent-soft text-accent border border-accent/20">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-accent">
              {activeLayer.name}
            </span>
            <h3 className="text-lg font-bold text-ink">{activeLayer.title}</h3>
          </div>
        </div>

        <p className="text-sm text-ink-secondary leading-relaxed mb-6">
          {activeLayer.description}
        </p>

        <div className="border-t border-border pt-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted block mb-3">
            Core Specifications &amp; Architectural Guarantees
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {activeLayer.specs.map((spec, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-ink p-2 rounded bg-muted/60 border border-border"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span>{spec}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
