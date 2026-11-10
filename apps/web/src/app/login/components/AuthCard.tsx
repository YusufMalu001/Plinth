import React from "react"
import { cn } from "@synergy/ui"

export interface AuthCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function AuthCard({ children, className, ...props }: AuthCardProps) {
  return (
    <div
      className={cn(
        "w-full bg-white dark:bg-card border border-border/80 dark:border-border/40 rounded-2xl p-6 md:p-8 shadow-xs dark:shadow-none transition-all duration-300",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
