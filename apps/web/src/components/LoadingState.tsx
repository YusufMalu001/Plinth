import React from 'react';
import { PlinthMark } from '../config/brand';

export function LoadingState({ message }: { message?: string }) {
  return (
    <div className="flex items-center justify-center w-full h-full min-h-[300px] p-8">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <div className="absolute inset-2 rounded-full border-2 border-border border-t-border-strong animate-spin" />
        <PlinthMark className="h-6 w-6 shrink-0 select-none" title="" />
      </div>
      {message && <p className="absolute mt-40 text-xs font-medium text-muted-foreground">{message}</p>}
    </div>
  );
}
