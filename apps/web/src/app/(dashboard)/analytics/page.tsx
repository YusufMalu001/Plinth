import { DecisionCenterShell } from '../../../features/intelligence/components/DecisionCenterShell';
import { PerformanceView } from '../../../features/intelligence/components/PerformanceView';

export default function AnalyticsPage() {
  return <DecisionCenterShell title="Certified analytics" description="Live, reproducible metrics from ERP transactions. Placeholder figures have been removed."><PerformanceView /></DecisionCenterShell>;
}
