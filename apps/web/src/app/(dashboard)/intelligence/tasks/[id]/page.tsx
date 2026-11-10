'use client';

import { useParams } from 'next/navigation';
import { IntelligenceShell } from '../../../../../features/intelligence/components/IntelligenceShell';
import { TaskDetailView } from '../../../../../features/intelligence/components/TaskDetailView';

export default function IntelligenceTaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <IntelligenceShell
      title="Business Task Execution"
      description="Inspect task provenance, collaborate with assigned team members, update progress status, and record completion evidence."
    >
      <TaskDetailView id={id} />
    </IntelligenceShell>
  );
}
