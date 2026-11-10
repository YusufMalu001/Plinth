'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { MaterialDetailWorkspace } from '../../../../features/master-data/MaterialDetailWorkspace';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();

  return <MaterialDetailWorkspace id={params.id} entityType="product" />;
}
