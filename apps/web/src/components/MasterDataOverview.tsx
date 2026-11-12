'use client';

import React from 'react';
import { Card } from '@plinth/ui';
import { useMasterDataSummary } from '../features/master-data/hooks';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';
import { StatusBadge } from './StatusBadge';
import { LifecycleStatus } from '@plinth/types';

export function MasterDataOverview() {
 const { data: summary, isLoading, error, refetch } = useMasterDataSummary();

 if (isLoading) return <LoadingState message="Loading Master Data Overview..." />;
 if (error) return <ErrorState error={error as Error} retry={refetch} />;
 if (!summary || summary.length === 0) return null;

 return (
 <div className="space-y-6">
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
 {summary.map((entity) => {
 const statuses: LifecycleStatus[] = [
 'DRAFT',
 'PENDING_VALIDATION',
 'APPROVED',
 'ACTIVE',
 'INACTIVE',
 'SUPERSEDED'
 ];
 
 return (
 <Card key={entity.entityType} className="p-4 flex flex-col hover:shadow-md transition-shadow">
 <div className="flex justify-between items-center mb-4">
 <h3 className="font-semibold text-lg">{entity.entityType}</h3>
 <span className="text-ink-secondary text-sm">{entity.total} Total</span>
 </div>
 
 <div className="space-y-2 flex-grow">
 {statuses.map(status => {
 const count = entity.statusCounts[status] || 0;
 if (count === 0 && status !== 'ACTIVE' && status !== 'DRAFT') return null; // Hide zeros for less common states to save space, but show active/draft
 
 return (
 <div key={status} className="flex justify-between items-center text-sm">
 <StatusBadge status={status} className="scale-90 origin-left" />
 <span className="font-medium text-ink-secondary">{count}</span>
 </div>
 );
 })}
 </div>
 </Card>
 );
 })}
 </div>
 </div>
 );
}
