'use client';

import { useParams } from 'next/navigation';
import { IntelligenceShell } from '../../../../../features/intelligence/components/IntelligenceShell';
import { RecommendationDetailView } from '../../../../../features/intelligence/components/RecommendationDetailView';

export default function IntelligenceRecommendationDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <IntelligenceShell
      title="Recommendation Evidence Dossier"
      description="Inspect verifiable ERP snapshot evidence, risk sensitivity analysis, and execute audited manager decisions."
    >
      <RecommendationDetailView id={id} />
    </IntelligenceShell>
  );
}
