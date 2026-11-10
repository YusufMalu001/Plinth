import { IntelligenceShell } from '../../../../../features/intelligence/components/IntelligenceShell';
import { IntelligenceCaseDetailView } from '../../../../../features/intelligence/components/IntelligenceCaseDetailView';

export default function IntelligenceCaseDetailPage() {
  return (
    <IntelligenceShell title="Case Details" description="Review the persisted evidence and take an accountable case action.">
      <IntelligenceCaseDetailView />
    </IntelligenceShell>
  );
}
