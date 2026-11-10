import { IntelligenceShell } from '../../../../features/intelligence/components/IntelligenceShell';
import { ObjectivesView } from '../../../../features/intelligence/components/ObjectivesView';

export default function IntelligenceObjectivesPage() {
  return (
    <IntelligenceShell
      title="Strategic Objectives & Policy Guardrails"
      description="Effective-dated strategic weights and operational controls enforced by the Intelligence Control Plane."
    >
      <ObjectivesView />
    </IntelligenceShell>
  );
}
