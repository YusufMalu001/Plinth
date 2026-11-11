'use client';

import React, { useState } from 'react';
import { Plus, Tag, Check, AlertCircle } from 'lucide-react';
import { Dialog, Button } from '@plinth/ui';
import { usePricingLevels, useCreatePricingLevel } from '../../../hooks/usePricingLevels';

export interface PricingLevelModalProps {
  open: boolean;
  onClose: () => void;
  onLevelCreated?: (levelName: string) => void;
}

export function PricingLevelModal({ open, onClose, onLevelCreated }: PricingLevelModalProps) {
  const { levels } = usePricingLevels();
  const createLevel = useCreatePricingLevel();
  const [levelName, setLevelName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = levelName.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a level name');
      return;
    }
    if (levels.some((l) => l.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMsg(`Level "${trimmed}" already exists`);
      return;
    }

    try {
      await createLevel.mutateAsync(trimmed);
      setLevelName('');
      setErrorMsg(null);
      if (onLevelCreated) {
        onLevelCreated(trimmed);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add level');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Customer Pricing Levels"
      className="max-w-md"
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure customer pricing levels (e.g. Dealer, E-Trade, Customer). These levels appear in the tier dropdown across Pricing Masters and Product Pricing.
        </p>

        {errorMsg && (
          <div className="p-2.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={levelName}
            onChange={(e) => {
              setLevelName(e.target.value);
              setErrorMsg(null);
            }}
            placeholder="e.g. Wholesale, Retail, Distributor"
            className="flex-1 h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <Button
            type="submit"
            disabled={createLevel.isPending || !levelName.trim()}
            className="h-10 px-4 rounded-xl text-xs font-bold bg-primary hover:bg-[#003c68] text-white shadow-xs shrink-0"
            icon={Plus}
          >
            {createLevel.isPending ? 'Adding...' : 'Add Level'}
          </Button>
        </form>

        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Available Levels ({levels.length})
          </span>
          <div className="flex flex-wrap gap-2 pt-1">
            {levels.map((lvl) => (
              <div
                key={lvl}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-2xs"
              >
                <Tag className="w-3 h-3 text-primary" />
                <span>{lvl}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-9 px-4 rounded-xl text-xs font-bold"
            icon={Check}
          >
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
