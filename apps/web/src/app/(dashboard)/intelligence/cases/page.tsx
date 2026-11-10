import { IntelligenceShell } from '../../../../features/intelligence/components/IntelligenceShell';
import { IntelligenceCasesView } from '../../../../features/intelligence/components/IntelligenceResourcesView';

export default function IntelligenceCasesPage() {
  return (
    <IntelligenceShell
      title="Case Investigations"
      description="Deterministic operational anomaly detections with immutable snapshot chains and evidence attribution."
    >
      <IntelligenceCasesView />
    </IntelligenceShell>
  );
}
