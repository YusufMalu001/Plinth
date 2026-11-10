'use client';

import React from 'react';

export default function ProcurementLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      {children}
    </div>
  );
}
