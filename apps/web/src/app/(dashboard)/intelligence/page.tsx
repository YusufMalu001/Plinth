import { IntelligenceShell } from '../../../features/intelligence/components/IntelligenceShell';
import { OverviewView } from '../../../features/intelligence/components/OverviewView';

export default function IntelligenceOverviewPage() {
  return (
    <IntelligenceShell
      title="AI Analytics"
      description="Executive overview of enterprise multi-agent telemetry, priority recommendations, active workflows, and verified business outcomes."
    >
      <OverviewView />
    </IntelligenceShell>
  );
}
