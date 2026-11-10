import { IntelligenceShell } from '../../../../features/intelligence/components/IntelligenceShell';
import { TasksView } from '../../../../features/intelligence/components/TasksView';

export default function IntelligenceTasksPage() {
  return (
    <IntelligenceShell
      title="Action Workflows & Tasks"
      description="Track execution of accepted recommendations, assign accountable owners, manage blocker dependencies, and verify work delivery."
    >
      <TasksView />
    </IntelligenceShell>
  );
}
