import React, { useState } from 'react';
import { DynamicIcon } from './DynamicIcon';
import { PRODUCTS } from '../content/products';

export const InteractiveModuleExplorer: React.FC = () => {
  const manufacturing = PRODUCTS.find((p) => p.slug === 'manufacturing') || PRODUCTS[0];
  const [selectedModuleIndex, setSelectedModuleIndex] = useState(0);

  const activeModule = manufacturing.modules[selectedModuleIndex] || manufacturing.modules[0];

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Module selector list */}
      <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
        {manufacturing.modules.map((mod, index) => {
          const isSelected = index === selectedModuleIndex;
          return (
            <button
              key={mod.name}
              type="button"
              onClick={() => setSelectedModuleIndex(index)}
              className={`text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 ${
                isSelected
                  ? 'bg-surface border-accent shadow-popover'
                  : 'bg-muted/40 border-border hover:bg-hover'
              }`}
            >
              <div
                className={`p-2 rounded-lg border shrink-0 ${
                  isSelected
                    ? 'bg-accent-soft text-accent border-accent/20'
                    : 'bg-surface text-ink-secondary border-border'
                }`}
              >
                <DynamicIcon name={mod.iconName} size={16} />
              </div>
              <div>
                <div className="text-sm font-semibold text-ink">{mod.name}</div>
                <p className="text-xs text-ink-secondary line-clamp-1 mt-0.5">{mod.benefit}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Mini Mock Screen for the active module */}
      <div className="lg:col-span-7 bg-surface border border-border rounded-xl shadow-popover overflow-hidden">
        {/* Mock Window Top Chrome */}
        <div className="px-4 py-3 bg-muted border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-surface border border-border text-ink">
              <DynamicIcon name={activeModule.iconName} size={14} />
            </div>
            <div>
              <span className="text-xs font-semibold text-ink block">{activeModule.name} Workspace</span>
              <span className="text-[10px] text-ink-muted">Single System of Record</span>
            </div>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-bg text-green-text">
            Live Synchronized
          </span>
        </div>

        {/* Mock Screen Content */}
        <div className="p-6 space-y-5">
          <div>
            <h4 className="text-base font-bold text-ink">{activeModule.name} Control</h4>
            <p className="text-xs text-ink-secondary mt-1">{activeModule.benefit}</p>
          </div>

          {/* Table list view */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-muted text-[11px] font-semibold text-ink-secondary grid grid-cols-4 ">
              <span>Code / Item</span>
              <span>Batch / Qty</span>
              <span>Status</span>
              <span className="text-right">Ledger Move</span>
            </div>
            <div className="divide-y divide-border text-xs">
              <div className="px-3 py-2.5 grid grid-cols-4 items-center hover:bg-hover">
                <span className="font-semibold text-ink ">MOD-2026-01</span>
                <span className="text-ink-secondary ">LOT-B01 (1,200)</span>
                <div>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-bg text-green-text">
                    Verified
                  </span>
                </div>
                <span className="text-right text-ink ">Bay A1 &rarr; Staging</span>
              </div>
              <div className="px-3 py-2.5 grid grid-cols-4 items-center hover:bg-hover">
                <span className="font-semibold text-ink ">MOD-2026-02</span>
                <span className="text-ink-secondary ">LOT-B02 (450)</span>
                <div>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-bg text-amber-text">
                    Pending QC
                  </span>
                </div>
                <span className="text-right text-ink ">In-Transit</span>
              </div>
              <div className="px-3 py-2.5 grid grid-cols-4 items-center hover:bg-hover">
                <span className="font-semibold text-ink ">MOD-2026-03</span>
                <span className="text-ink-secondary ">LOT-B03 (3,800)</span>
                <div>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-bg text-blue-text">
                    Active Run
                  </span>
                </div>
                <span className="text-right text-ink ">Workstation 3</span>
              </div>
            </div>
          </div>

          {/* Progress bar recipe from theme */}
          <div className="p-3.5 rounded-lg bg-muted/40 border border-border space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-ink">Daily Plant Dispatch Capacity</span>
              <span className="text-ink-muted">82% (4,100 / 5,000 units)</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-green-solid rounded-full" style={{ width: '82%' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
