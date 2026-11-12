import React from "react"
import { Loader2, ArrowRight } from "lucide-react"

export interface PrimaryAuthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean
}

export function PrimaryAuthButton({
  children,
  className = '',
  loading = false,
  disabled,
  ...props
}: PrimaryAuthButtonProps) {
  return (
    <button
      className={`group relative flex h-11 w-full items-center justify-center gap-2 rounded-control bg-inverse hover:bg-[#2E2E2E] active:bg-[#000000] text-inverse text-xs font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brand focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-inverse" />
          <span>Authenticating…</span>
        </>
      ) : (
        <>
          <span>{children}</span>
          <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform duration-150" />
        </>
      )}
    </button>
  )
}
