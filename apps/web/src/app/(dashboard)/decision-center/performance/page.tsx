import { DecisionCenterShell } from '../../../../features/intelligence/components/DecisionCenterShell';
import { PerformanceView } from '../../../../features/intelligence/components/PerformanceView';

export default function IntelligencePerformancePage() {
  return <DecisionCenterShell title="Certified performance" description="Deterministic revenue, cost, inventory, production, and fulfillment measures—the model never calculates these values."><PerformanceView /></DecisionCenterShell>;
}
