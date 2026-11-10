'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { UomManagementWorkspace } from '../../../../../features/master-data/UomManagementWorkspace';

export default function UomDetailPage() {
  const { id } = useParams();

  return <UomManagementWorkspace initialId={id as string} />;
}
