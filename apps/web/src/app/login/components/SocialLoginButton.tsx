import React from "react"
import { cn } from "@plinth/ui"

export interface SocialLoginButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export function SocialLoginButton({
  children,
  className,
  ...props
}: SocialLoginButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-border bg-white dark:bg-card px-4 text-xs font-semibold text-foreground transition-all duration-200 hover:bg-neutral-50 dark:hover:bg-neutral-900 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className
      )}
      {...props}
    >
      <svg className="h-4.5 w-4.5 shrink-0" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 1h9v9H1V1z" fill="#f25022" />
        <path d="M11 1h9v9h-9V1z" fill="#7fba00" />
        <path d="M1 11h9v9H1v-9z" fill="#00a4ef" />
        <path d="M11 11h9v9h-9v-9z" fill="#ffb900" />
      </svg>
      <span>{children}</span>
    </button>
  )
}
