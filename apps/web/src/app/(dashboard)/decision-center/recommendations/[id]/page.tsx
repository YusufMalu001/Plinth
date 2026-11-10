'use client';

import { useParams } from 'next/navigation';
import { DecisionCenterShell } from '../../../../../features/intelligence/components/DecisionCenterShell';
import { RecommendationDetailView } from '../../../../../features/intelligence/components/RecommendationDetailView';

export default function RecommendationDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <DecisionCenterShell title="Recommendation review" description="Only evidence-backed, policy-valid suggestions reach this review step."><RecommendationDetailView id={id} /></DecisionCenterShell>;
}
