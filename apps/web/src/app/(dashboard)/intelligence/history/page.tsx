import { IntelligenceShell } from '../../../../features/intelligence/components/IntelligenceShell';
import { RunHistoryView } from '../../../../features/intelligence/components/RunHistoryView';

export default function AdvisorHistoryPage() {
  return (
    <IntelligenceShell
      title="Advisor History & Execution Audit"
      description="Traceable records of advisor inferences, token budgets, verified model routing, and past consultation sessions."
    >
      <RunHistoryView />
    </IntelligenceShell>
  );
}
