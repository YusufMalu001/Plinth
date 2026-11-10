import { IntelligenceShell } from '../../../../features/intelligence/components/IntelligenceShell';
import { RunHistoryView } from '../../../../features/intelligence/components/RunHistoryView';

export default function IntelligenceAuditPage() {
  return (
    <IntelligenceShell
      title="Execution Audit & Run Observability"
      description="Immutable execution records, model routing telemetry, token budget consumption, latency, and manual analysis dispatch."
    >
      <RunHistoryView />
    </IntelligenceShell>
  );
}
