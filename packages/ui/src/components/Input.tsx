import * as React from "react"
import { cn } from "../index"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  icon?: React.ElementType;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, icon: Icon, ...props }, ref) => {
    return (
      <div className="relative w-full">
        {Icon && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-xl border border-border/80 bg-background/60 hover:bg-background focus:bg-background px-3 py-2 text-sm transition-all duration-150 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
            Icon && "pl-9",
            error 
              ? "border-destructive focus-visible:ring-destructive/20 focus-visible:border-destructive" 
              : "focus-visible:ring-primary/20 focus-visible:border-primary hover:border-border",
            className
          )}
          ref={ref}
          {...props}
        />
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
