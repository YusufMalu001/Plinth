'use client';

import { useParams } from 'next/navigation';
import { VendorDetailWorkspace } from '../../../../features/vendors/VendorDetailWorkspace';

export default function VendorDetailPage() {
  const params = useParams<{ id: string }>();
  return <VendorDetailWorkspace id={params.id} />;
}
