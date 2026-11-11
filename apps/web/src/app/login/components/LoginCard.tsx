import React from "react"
import { cn } from "@plinth/ui"

export interface LoginCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function LoginCard({ children, className, ...props }: LoginCardProps) {
  return (
    <div
      className={cn(
        "w-full flex flex-col justify-center",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
