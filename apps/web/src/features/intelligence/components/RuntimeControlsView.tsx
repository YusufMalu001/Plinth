'use client';

import { Checkbox } from '@plinth/ui';import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bot,
  Factory,
  Layers,
  Package,
  Power,
  Save,
  ShoppingCart,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { ErrorState } from '../../../components/ErrorState';
import { LoadingState } from '../../../components/LoadingState';
import { showToast } from '../../../components/toast-store';
import { intelligenceApi } from '../api';
import type { IntelligenceControls } from '../types';

const profiles = [
  { key: 'executive-advisor', name: 'Executive Super Agent', icon: Layers },
  { key: 'sales-advisor', name: 'Sales & Growth Advisor', icon: TrendingUp },
  { key: 'inventory-advisor', name: 'Inventory & Stock Advisor', icon: Package },
  { key: 'procurement-advisor', name: 'Procurement Advisor', icon: ShoppingCart },
  { key: 'production-advisor', name: 'Production & Plant Advisor', icon: Factory },
  { key: 'fulfillment-advisor', name: 'Fulfillment & Logistics', icon: Truck },
] as const;

const pauseControls: Array<{
  key: keyof IntelligenceControls['state'];
  label: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}> = [
  {
    key: 'globalPaused',
    label: 'Global Intelligence Kill Switch',
    description: 'Immediately pauses worker processing and all LLM advisor evaluations across the platform.',
    severity: 'high',
  },
  {
    key: 'providerPaused',
    label: 'Pause External Model Provider',
    description: 'Stops external AI model calls. Decision Center views and records remain accessible.',
    severity: 'high',
  },
  {
    key: 'schedulesPaused',
    label: 'Pause Scheduled Cron Reviews',
    description: 'Halts periodic background evaluation jobs while keeping event-driven analysis active.',
    severity: 'medium',
  },
  {
    key: 'eventTriggersPaused',
    label: 'Pause Domain Event Analysis',
    description: 'Prevents new transactional outbox events from spawning advisor jobs. ERP transactions continue unaffected.',
    severity: 'medium',
  },
  {
    key: 'notificationsPaused',
    label: 'Pause Notification Delivery',
    description: 'Suppresses review notification dispatch while continuing recommendation generation.',
    severity: 'low',
  },
];

export function RuntimeControlsView() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['intelligence', 'controls'], queryFn: intelligenceApi.controls });
  const [state, setState] = useState<IntelligenceControls['state'] | null>(null);

  useEffect(() => {
    if (query.data) setState(query.data.state);
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: intelligenceApi.updateControls,
    onSuccess: (data) => {
      client.setQueryData(['intelligence', 'controls'], data);
      void client.invalidateQueries({ queryKey: ['intelligence'] });
      showToast({ kind: 'success', title: 'Runtime control state updated successfully' });
    },
    onError: (error) => {
      showToast({
        kind: 'error',
        title: 'Could not update runtime controls',
        message: error instanceof Error ? error.message : 'Please check permissions.',
      });
    },
  });

  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (query.isLoading || !state) return <LoadingState message="Loading runtime security controls..." />;

  const toggleProfile = (key: string) =>
    setState((current) =>
      current
        ? {
            ...current,
            pausedProfiles: current.pausedProfiles.includes(key)
              ? current.pausedProfiles.filter((item) => item !== key)
              : [...current.pausedProfiles, key],
          }
        : current
    );

  const saveChanges = () => {
    if (state) mutation.mutate(state);
  };

  return (
    <div className="space-y-6">
      {/* Upper Security Rule Banner */}
      <div className="rounded-2xl border border-tone-amber-solid/25 bg-tone-amber-bg p-4 text-xs text-tone-amber-text">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-tone-amber-text shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Pause Controls & Operational Authority</p>
            <p className="text-tone-amber-text leading-relaxed">
              Environment switches in configuration (`INTELLIGENCE_ENABLED=false`) remain the upper authority. This control panel cannot enable capabilities that are restricted at the container infrastructure layer.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* System Level Kill Switches */}
        <div className="rounded-2xl border border-border/90 bg-surface p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <Power className="h-4 w-4 text-link" />
              <h3 className="text-sm font-bold text-ink">
                System Kill Switches
              </h3>
            </div>
            <span className="text-[10px] font-bold uppercase text-ink-placeholder">Immediate Effect</span>
          </div>

          <div className="space-y-3">
            {pauseControls.map(({ key, label, description }) => {
              const isChecked = Boolean(state[key]);
              return (
                <label
                  key={key}
                  className={`flex cursor-pointer items-start justify-between gap-4 rounded-xl border p-4 transition-all ${
                    isChecked
                      ? 'border-tone-amber-solid/25 bg-tone-amber-bg'
                      : 'border-border bg-muted/40 hover:bg-muted'
                  }`}
                >
                  <div className="space-y-1 pr-2">
                    <span className="flex items-center gap-2 text-xs font-bold text-ink">
                      <span>{label}</span>
                      {isChecked && (
                        <span className="rounded bg-tone-amber-bg px-1.5 py-0.2 text-[9px] font-bold text-tone-amber-text">
                          PAUSED
                        </span>
                      )}
                    </span>
                    <span className="block text-[11px] text-ink-muted leading-relaxed">{description}</span>
                  </div>

                  <Checkbox

                    className="mt-1 h-4 w-4 rounded border-border-strong text-link focus:ring-accent-brand"
                    checked={isChecked}
                    onChange={(e) => setState({ ...state, [key]: e.target.checked })}
                  />
                </label>
              );
            })}
          </div>
        </div>

        {/* Per-Advisor Profile Pausing Grid */}
        <div className="rounded-2xl border border-border/90 bg-surface p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-link" />
              <h3 className="text-sm font-bold text-ink">
                Advisor Profile Access Controls
              </h3>
            </div>
            <span className="text-[10px] font-bold uppercase text-ink-placeholder">Selective Isolation</span>
          </div>

          <div className="space-y-3">
            {profiles.map(({ key, name, icon: Icon }) => {
              const isPaused = state.pausedProfiles.includes(key);
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between gap-4 rounded-xl border p-3.5 transition-all ${
                    isPaused
                      ? 'border-tone-red-solid/25 bg-tone-red-bg'
                      : 'border-border bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface border border-border text-ink-secondary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-ink">{name}</p>
                      <p className="text-[10px] text-ink-placeholder">Profile Key: {key}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleProfile(key)}
                    className={`shrink-0 rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                      isPaused
                        ? 'border border-tone-red-solid/25 bg-tone-red-bg text-tone-red-text hover:bg-tone-red-bg'
                        : 'border border-border bg-surface text-ink-secondary hover:bg-muted'
                    }`}
                  >
                    {isPaused ? 'Resume Advisor' : 'Pause Advisor'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Save Button Floating Bar */}
      <div className="flex items-center justify-end border-t border-border/80 pt-4">
        <button
          type="button"
          onClick={saveChanges}
          disabled={mutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-action hover:bg-[color:var(--action-primary-bg-hover)] px-6 py-2.5 text-xs font-bold text-inverse shadow-sm transition-all disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          <span>{mutation.isPending ? 'Applying Changes...' : 'Save & Apply Runtime Controls'}</span>
        </button>
      </div>
    </div>
  );
}
