import React from 'react';
import Image from 'next/image';

export function LoadingState({ message }: { message?: string }) {
  return (
    <div className="flex items-center justify-center w-full h-full min-h-[300px] p-8">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <div className="absolute inset-2 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <Image
          src="/synergy-favicon.png"
          alt="Loading"
          width={64}
          height={64}
          className="h-12 w-12 object-contain sm:h-14 sm:w-14"
          priority
        />
      </div>
      {message && <p className="absolute mt-40 text-xs font-medium text-muted-foreground">{message}</p>}
    </div>
  );
}
