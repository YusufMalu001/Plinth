import { DecisionCenterShell } from '../../../../features/intelligence/components/DecisionCenterShell';
import { IntelligenceOutcomesView } from '../../../../features/intelligence/components/IntelligenceResourcesView';

export default function IntelligenceOutcomesPage() {
  return <DecisionCenterShell title="Recommendation outcomes" description="Forecast comparisons with explicit attribution and provenance. Unverified manager entries remain UNKNOWN."><IntelligenceOutcomesView /></DecisionCenterShell>;
}
