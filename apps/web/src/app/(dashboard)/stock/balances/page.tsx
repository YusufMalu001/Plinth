"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingState } from '../../../../components/LoadingState';

export default function StockBalancesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/inventory');
  }, [router]);

  return <LoadingState message="Redirecting to Unified Inventory Dashboard..." />;
}
