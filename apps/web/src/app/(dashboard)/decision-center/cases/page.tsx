import { DecisionCenterShell } from '../../../../features/intelligence/components/DecisionCenterShell';
import { IntelligenceCasesView } from '../../../../features/intelligence/components/IntelligenceResourcesView';

export default function IntelligenceCasesPage() {
  return <DecisionCenterShell title="Intelligence cases" description="Deterministic conditions with linked snapshots and evidence. Cases do not authorize ERP actions."><IntelligenceCasesView /></DecisionCenterShell>;
}
