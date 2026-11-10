'use client';

import React, { Suspense } from 'react';
import { ProductCreationWorkspace } from '../../../../features/products/components/ProductCreationWorkspace';

export default function AddProductPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground font-semibold">Loading product creation workspace...</div>}>
      <ProductCreationWorkspace />
    </Suspense>
  );
}
