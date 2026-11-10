import { DecisionCenterShell } from '../../../../features/intelligence/components/DecisionCenterShell';
import { TasksView } from '../../../../features/intelligence/components/TasksView';

export default function BusinessTasksPage() {
  return <DecisionCenterShell title="Business tasks" description="Assigned follow-up work with due dates, completion evidence, and measured outcomes."><TasksView /></DecisionCenterShell>;
}
