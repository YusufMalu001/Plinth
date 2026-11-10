import { DecisionCenterShell } from '../../../../features/intelligence/components/DecisionCenterShell';
import { RecommendationsView } from '../../../../features/intelligence/components/RecommendationsView';

export default function RecommendationsPage() {
  return <DecisionCenterShell title="Recommendations" description="Review evidence, assumptions, risks, and expected impact before assigning any work."><RecommendationsView /></DecisionCenterShell>;
}
