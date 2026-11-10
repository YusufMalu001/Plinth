import { DecisionCenterShell } from '../../../../features/intelligence/components/DecisionCenterShell';
import { IntelligenceConversationsView } from '../../../../features/intelligence/components/IntelligenceResourcesView';

export default function IntelligenceConversationsPage() {
  return <DecisionCenterShell title="Advisor conversations" description="Persistent, owner scoped questions linked to Synergy runs and evidence."><IntelligenceConversationsView /></DecisionCenterShell>;
}
