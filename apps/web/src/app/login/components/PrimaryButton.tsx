import React from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@plinth/ui"

export interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean
}

export function PrimaryButton({
  children,
  className,
  loading = false,
  disabled,
  ...props
}: PrimaryButtonProps) {
  return (
    <button
      className={cn(
        "relative flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-xs font-semibold uppercase tracking-wider text-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/20 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 select-none",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-white" />
          <span>Signing in...</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}
