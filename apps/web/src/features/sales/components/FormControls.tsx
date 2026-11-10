'use client';

import React from 'react';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';

/* ========================================================================= */
/* Reusable Clean & Creative Form Controls (No Harsh Shadows)                 */
/* ========================================================================= */

export interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ElementType;
  label?: string;
  error?: string;
  prefixSymbol?: string;
}

export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  ({ icon: Icon, label, error, prefixSymbol, className, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-xs font-semibold text-foreground/85 tracking-tight">
            {label}
          </label>
        )}
        <div className="relative w-full">
          {Icon && !prefixSymbol && (
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground/70">
              <Icon className="h-4 w-4" />
            </div>
          )}
          {prefixSymbol && (
            <span className="absolute inset-y-0 left-3 flex items-center text-xs font-bold text-muted-foreground/70 pointer-events-none">
              {prefixSymbol}
            </span>
          )}
          <input
            ref={ref}
            className={clsx(
              'w-full h-10 rounded-xl border border-border/70 bg-background/70 hover:bg-background focus:bg-background text-xs sm:text-sm font-medium text-foreground transition-all duration-150 outline-none shadow-none placeholder:text-muted-foreground/45',
              'hover:border-border/90 focus:border-primary focus:ring-2 focus:ring-primary/15',
              prefixSymbol ? 'pl-8 pr-3' : Icon ? 'pl-9 pr-3' : 'px-3',
              error ? 'border-destructive focus:ring-destructive/15 focus:border-destructive' : '',
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="text-[11px] text-destructive font-medium">{error}</p>}
      </div>
    );
  }
);
FormInput.displayName = 'FormInput';

export interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  icon?: React.ElementType;
  label?: string;
}

export const FormSelect = React.forwardRef<HTMLSelectElement, FormSelectProps>(
  ({ icon: Icon, label, className, children, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-xs font-semibold text-foreground/85 tracking-tight">
            {label}
          </label>
        )}
        <div className="relative w-full">
          {Icon && (
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground/70">
              <Icon className="h-4 w-4" />
            </div>
          )}
          <select
            ref={ref}
            className={clsx(
              'w-full h-10 appearance-none rounded-xl border border-border/70 bg-background/70 hover:bg-background focus:bg-background text-xs sm:text-sm font-medium text-foreground transition-all duration-150 outline-none shadow-none cursor-pointer',
              'hover:border-border/90 focus:border-primary focus:ring-2 focus:ring-primary/15',
              Icon ? 'pl-9 pr-9' : 'pl-3 pr-9',
              className
            )}
            {...props}
          >
            {children}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-muted-foreground/70">
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
      </div>
    );
  }
);
FormSelect.displayName = 'FormSelect';

export interface TableNumericInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  prefixSymbol?: string;
}

export function TableNumericInput({ prefixSymbol, className, ...props }: TableNumericInputProps) {
  return (
    <div className="relative w-full">
      {prefixSymbol && (
        <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-bold text-muted-foreground/70 pointer-events-none">
          {prefixSymbol}
        </span>
      )}
      <input
        className={clsx(
          'w-full h-8 rounded-lg border border-border/70 bg-background/80 hover:bg-background focus:bg-background text-xs font-mono font-medium text-right transition-all duration-150 outline-none shadow-none',
          'hover:border-border focus:border-primary focus:ring-1 focus:ring-primary/20',
          prefixSymbol ? 'pl-5 pr-2' : 'px-2',
          className
        )}
        {...props}
      />
    </div>
  );
}

export interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  countryCode?: string;
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ label, error, value, onChange, countryCode = '+91', className, ...props }, ref) => {
    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Strictly extract digits and restrict to max 10 digits
      const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10);
      onChange(cleaned);
    };

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-xs font-semibold text-foreground/85 tracking-tight">
            {label}
          </label>
        )}
        <div className="relative flex w-full items-center">
          {/* Separated +91 Country Code Badge */}
          <div className="flex h-10 shrink-0 items-center justify-center rounded-l-xl border border-r-0 border-border/70 bg-muted/60 px-3 text-xs font-black text-foreground select-none font-mono">
            <span className="mr-1 text-[13px]">🇮🇳</span>
            <span>{countryCode}</span>
          </div>

          {/* 10-Digit Mobile Input */}
          <input
            ref={ref}
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={value}
            onChange={handlePhoneChange}
            placeholder="98765 43210"
            className={clsx(
              'w-full h-10 rounded-r-xl border border-border/70 bg-background/70 hover:bg-background focus:bg-background text-xs sm:text-sm font-medium text-foreground transition-all duration-150 outline-none shadow-none placeholder:text-muted-foreground/45 px-3 font-mono',
              'hover:border-border/90 focus:border-primary focus:ring-2 focus:ring-primary/15',
              error ? 'border-destructive focus:ring-destructive/15 focus:border-destructive' : '',
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="text-[11px] text-destructive font-medium">{error}</p>}
      </div>
    );
  }
);
PhoneInput.displayName = 'PhoneInput';

