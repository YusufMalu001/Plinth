import { IntelligenceShell } from '../../../../features/intelligence/components/IntelligenceShell';
import { PerformanceView } from '../../../../features/intelligence/components/PerformanceView';

export default function IntelligencePerformancePage() {
  return (
    <IntelligenceShell
      title="Certified Telemetry & System Health"
      description="Deterministic ERP operational metrics, data freshness scores, and cost coverage ratings calculated directly from database state."
    >
      <PerformanceView />
    </IntelligenceShell>
  );
}
