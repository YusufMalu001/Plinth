import { IntelligenceShell } from '../../../../features/intelligence/components/IntelligenceShell';
import { IntelligenceConversationsView } from '../../../../features/intelligence/components/IntelligenceResourcesView';

export default function IntelligenceConversationsPage() {
  return (
    <IntelligenceShell
      title="AI Advisor"
      description="Interactive multi-agent advisory channels with live tool execution, zero-mutation snapshot context, and certified citation traces."
    >
      <IntelligenceConversationsView />
    </IntelligenceShell>
  );
}
