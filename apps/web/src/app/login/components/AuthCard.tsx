import React from "react"
import { cn } from "@plinth/ui"

export interface AuthCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function AuthCard({ children, className, ...props }: AuthCardProps) {
  return (
    <div
      className={cn(
        "w-full bg-surface border border-border rounded-card p-6 md:p-8 transition-all duration-300",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
