import { IntelligenceShell } from '../../../../features/intelligence/components/IntelligenceShell';
import { RuntimeControlsView } from '../../../../features/intelligence/components/RuntimeControlsView';

export default function IntelligenceControlsPage() {
  return (
    <IntelligenceShell
      title="Runtime Engine Controls & Kill Switches"
      description="Audited operational kill-switches, subsystem pause toggles, and advisor profile isolation for authorized administrators."
    >
      <RuntimeControlsView />
    </IntelligenceShell>
  );
}
