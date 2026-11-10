import { DecisionCenterShell } from '../../../../features/intelligence/components/DecisionCenterShell';
import { ObjectivesView } from '../../../../features/intelligence/components/ObjectivesView';

export default function BusinessObjectivesPage() {
  return <DecisionCenterShell title="Business objectives and guardrails" description="Effective-dated profitable-growth priorities and the non-negotiable controls that override them."><ObjectivesView /></DecisionCenterShell>;
}
