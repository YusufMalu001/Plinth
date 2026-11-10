import React, { forwardRef, type InputHTMLAttributes } from 'react';
import { Check } from 'lucide-react';

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <span className={`relative inline-flex h-[18px] w-[18px] shrink-0 align-middle ${className}`}>
      <input
        {...props}
        ref={ref}
        type="checkbox"
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none rounded-full border-2 border-input bg-background transition-colors checked:border-primary checked:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <Check
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 m-auto h-3.5 w-3.5 stroke-[3.25] text-primary opacity-0 transition-opacity peer-checked:opacity-100"
      />
    </span>
  ),
);

Checkbox.displayName = 'Checkbox';
