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
      className={`group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#004a80] via-[#1b42b0] to-[#004a80] hover:from-[#132e80] hover:via-[#004a80] hover:to-[#132e80] text-white text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-md shadow-[#004a80]/25 hover:shadow-lg hover:shadow-[#004a80]/35 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#004a80]/25 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {/* Animated Light Sweep Shimmer Effect */}
      <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />

      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-white" />
          <span>Authenticating…</span>
        </>
      ) : (
        <>
          <span>{children}</span>
          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-200" />
        </>
      )}
    </button>
  )
}
