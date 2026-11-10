import { IntelligenceShell } from '../../../../features/intelligence/components/IntelligenceShell';
import { RecommendationsView } from '../../../../features/intelligence/components/RecommendationsView';

export default function IntelligenceRecommendationsPage() {
  return (
    <IntelligenceShell
      title="Strategic Recommendations"
      description="Actionable intelligence opportunities across Sales, Inventory, Production, and Procurement awaiting manager authorization."
    >
      <RecommendationsView />
    </IntelligenceShell>
  );
}
