import { DecisionCenterShell } from '@/features/intelligence/components/DecisionCenterShell';
import { RuntimeControlsView } from '@/features/intelligence/components/RuntimeControlsView';

export default function RuntimeControlsPage() {
  return <DecisionCenterShell title="Runtime health and pause controls" description="Audited operational kill switches for authorized administrators."><RuntimeControlsView /></DecisionCenterShell>;
}
