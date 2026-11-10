import { DecisionCenterShell } from '../../../../features/intelligence/components/DecisionCenterShell';
import { RunHistoryView } from '../../../../features/intelligence/components/RunHistoryView';

export default function IntelligenceAuditPage() {
  return <DecisionCenterShell title="Analysis run history" description="Sanitized operational metadata, models, cost, and safe failure codes without sensitive prompts or hidden reasoning."><RunHistoryView /></DecisionCenterShell>;
}
