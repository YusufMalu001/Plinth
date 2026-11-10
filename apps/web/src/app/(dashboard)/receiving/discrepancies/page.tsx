'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DiscrepancyHubPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/receiving/goods-receipts?status=DISCREPANCY_PENDING');
  }, [router]);

  return null;
}
