import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility to merge Tailwind CSS classes safely using clsx and tailwind-merge.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Components
export * from "./components/Button"
export * from "./components/Card"
export * from "./components/Input"
export * from "./components/Badge"
export * from "./components/Table"
export * from "./components/Dialog"
export * from "./components/PageHeader"
export * from "./components/EmptyState"
export * from "./components/Checkbox"
