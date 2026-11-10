'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function VerificationQueuePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/receiving/goods-receipts');
  }, [router]);

  return null;
}
