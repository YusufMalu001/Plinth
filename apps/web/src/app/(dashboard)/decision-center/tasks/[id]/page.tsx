'use client';

import { useParams } from 'next/navigation';
import { DecisionCenterShell } from '../../../../../features/intelligence/components/DecisionCenterShell';
import { TaskDetailView } from '../../../../../features/intelligence/components/TaskDetailView';

export default function BusinessTaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <DecisionCenterShell title="Assigned business task" description="Execute work through the governed ERP module and record verifiable completion evidence here."><TaskDetailView id={id} /></DecisionCenterShell>;
}
