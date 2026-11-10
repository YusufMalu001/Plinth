import { IntelligenceShell } from '../../../../features/intelligence/components/IntelligenceShell';
import { IntelligenceOutcomesView } from '../../../../features/intelligence/components/IntelligenceResourcesView';

export default function IntelligenceOutcomesPage() {
  return (
    <IntelligenceShell
      title="ROI & Verified Outcomes"
      description="Financial impact ledger tracking realized business outcomes versus forecast projections with strict attribution accounting."
    >
      <IntelligenceOutcomesView />
    </IntelligenceShell>
  );
}
