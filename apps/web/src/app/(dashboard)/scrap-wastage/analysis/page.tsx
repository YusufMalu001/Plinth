'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LossAnalysisPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/scrap-wastage');
  }, [router]);

  return null;
}
