import { IntelligenceShell } from '../../../../features/intelligence/components/IntelligenceShell';
import { AiInsightsView } from '../../../../features/intelligence/components/AiInsightsView';

export default function AiInsightsPage() {
  return (
    <IntelligenceShell
      title="Daily AI Insights"
      description="Validated recommendations based on Synergy evidence, refreshed automatically as new runs complete."
    >
      <AiInsightsView />
    </IntelligenceShell>
  );
}
