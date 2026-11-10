'use client';

import { useParams } from 'next/navigation';
import { VendorDetailWorkspace } from '../../../../../features/vendors/VendorDetailWorkspace';

export default function VendorsDetailPage() {
  const { id } = useParams();
  return <VendorDetailWorkspace id={id as string} />;
}
