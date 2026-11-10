"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function VendorsListPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/vendors'); }, [router]);
  return <div className="p-8 text-sm text-muted-foreground">Opening vendor control center…</div>;
}
