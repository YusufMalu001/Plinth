'use client';

import React from 'react';

export default function ReceivingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      {children}
    </div>
  );
}
