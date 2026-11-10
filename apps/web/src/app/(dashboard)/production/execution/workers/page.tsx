'use client';

import { Users } from 'lucide-react';
import { ShopFloorDepartmentList } from '@/features/production/components/ShopFloorDepartmentList';

export default function DepartmentWorkersPage() {
  return (
    <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Users className="h-5 w-5" /></div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Department Workers</h1>
            <p className="mt-1 text-sm text-muted-foreground">View your department roster and add shop-floor workers with their own login.</p>
          </div>
        </header>
        <ShopFloorDepartmentList />
      </div>
    </main>
  );
}
