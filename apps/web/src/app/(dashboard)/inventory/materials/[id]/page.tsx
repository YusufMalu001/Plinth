'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { MaterialDetailWorkspace } from '../../../../../features/master-data/MaterialDetailWorkspace';

export default function MaterialsDetailPage() {
  const { id } = useParams();

  return <MaterialDetailWorkspace id={id as string} entityType="material" />;
}
