'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BomCompareRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/production/bom');
  }, [router]);

  return (
    <div className="flex-1 w-full p-8 text-center text-xs text-muted-foreground animate-pulse">
      Redirecting to Bill of Materials registry…
    </div>
  );
}
