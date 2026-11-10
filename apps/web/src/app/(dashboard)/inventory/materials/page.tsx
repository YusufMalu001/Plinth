"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MaterialsListPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/products?type=MATERIAL');
  }, [router]);

  return (
    <div className="flex-1 p-8 flex items-center justify-center text-sm font-semibold text-muted-foreground">
      Redirecting to Inventory Materials...
    </div>
  );
}
