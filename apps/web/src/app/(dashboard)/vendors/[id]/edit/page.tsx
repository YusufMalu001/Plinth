'use client';

import React, { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { VendorCreationWorkspace } from '../../../../../features/vendors/VendorCreationWorkspace';

export default function EditVendorPage() {
  const params = useParams<{ id: string }>();

  return (
    <Suspense
      fallback={
        <div className="flex-1 p-8 flex items-center justify-center text-sm font-semibold text-muted-foreground">
          Loading vendor editor...
        </div>
      }
    >
      <VendorCreationWorkspace mode="edit" editId={params?.id} />
    </Suspense>
  );
}
