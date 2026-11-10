'use client';

import React from 'react';
import { IntelligenceShell } from './IntelligenceShell';

export function DecisionCenterShell(props: {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actionSlot?: React.ReactNode;
}) {
  return <IntelligenceShell {...props} />;
}
