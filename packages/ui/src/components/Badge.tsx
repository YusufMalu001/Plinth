import * as React from "react"
import { cn } from "../index"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "muted" | "outline" | "success" | "warning" | "info" | "draft"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "bg-primary text-primary-foreground": variant === "default",
          "bg-secondary text-secondary-foreground": variant === "secondary",
          "bg-destructive text-destructive-foreground": variant === "destructive",
          "bg-muted text-muted-foreground": variant === "muted",
          "border border-border text-foreground": variant === "outline",
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400": variant === "success",
          "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400": variant === "warning",
          "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400": variant === "info",
          "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400": variant === "draft",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
