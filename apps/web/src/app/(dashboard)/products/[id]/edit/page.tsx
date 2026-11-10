"use client";

import React, { Suspense } from "react";
import { useParams } from "next/navigation";
import { ProductCreationWorkspace } from "@/features/products/components/ProductCreationWorkspace";

export default function EditProductPage() {
  const params = useParams<{ id: string }>();

  return (
    <Suspense
      fallback={
        <div className="flex-1 p-8 flex items-center justify-center text-sm font-semibold text-muted-foreground">
          Loading product editor...
        </div>
      }
    >
      <ProductCreationWorkspace mode="edit" editId={params?.id} defaultType="PRODUCT" />
    </Suspense>
  );
}
