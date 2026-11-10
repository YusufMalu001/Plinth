import { IntelligenceShell } from '../../../../features/intelligence/components/IntelligenceShell';
import { IntelligenceConversationsView } from '../../../../features/intelligence/components/IntelligenceResourcesView';

export default function AdvisorPage() {
  return (
    <IntelligenceShell
      title="AI Advisor"
      description="Domain-specialized enterprise advisors with real-time ERP inspection, zero-mutation safeguards, and evidence attribution."
    >
      <IntelligenceConversationsView />
    </IntelligenceShell>
  );
}
