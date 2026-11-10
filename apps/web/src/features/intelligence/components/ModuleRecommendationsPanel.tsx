'use client';

import { useEffect, useRef } from 'react';
import { useRecommendations } from '../hooks';
import type { IntelligenceModule } from '../types';
import { impactValue, percent } from './format';
import { showToast } from '@/components/toast-store';

export function ModuleRecommendationsPanel({ module }: { module: IntelligenceModule }) {
  const query = useRecommendations({ module, status: 'OPEN', limit: 3 });
  const toastedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (query.isError || !query.data?.items?.length) return;

    const recommendations = query.data.items;
    recommendations.forEach((item) => {
      if (toastedIds.current.has(item.id)) return;

      const sessionKey = `hermes-toast-seen-${item.id}`;
      try {
        if (typeof window !== 'undefined' && sessionStorage.getItem(sessionKey)) {
          toastedIds.current.add(item.id);
          return;
        }
      } catch {
        // sessionStorage safety
      }

      toastedIds.current.add(item.id);
      try {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(sessionKey, 'true');
        }
      } catch {
        /* ignore sessionStorage quota/disabled errors */
      }

      const impact = impactValue(item.expectedImpact);
      const confidence = percent(item.confidence);
      const moduleLabel = module.charAt(0) + module.slice(1).toLowerCase();

      showToast({
        kind: 'hermes',
        title: item.title,
        message: `${moduleLabel} Suggestion • Expected base impact: ${impact} (${confidence} confidence)`,
        badge: `${item.priority} SUGGESTION`,
        duration: 8000,
        action: {
          label: 'Review Suggestion',
          href: `/decision-center/recommendations/${item.id}`,
        },
      });
    });
  }, [query.data?.items, query.isError, module]);

  // Headless: Never render in-page cards that ruin page design
  return null;
}
