import * as React from "react"
import { cn } from "../index"
import { Loader2 } from "lucide-react"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "destructive" | "danger" | "outline" | "secondary" | "ghost" | "link"
  size?: "sm" | "default" | "md" | "lg" | "icon"
  loading?: boolean
  icon?: React.ElementType
  iconPosition?: "left" | "right"
  fullWidth?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, icon: Icon, iconPosition = "left", fullWidth, children, disabled, ...props }, ref) => {
    
    const mappedVariant = variant === "primary" ? "default" : variant === "danger" ? "destructive" : variant;
    const mappedSize = size === "md" ? "default" : size;

    return (
      <button
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25 active:translate-y-0":
              mappedVariant === "default",
            "bg-destructive text-destructive-foreground shadow-sm hover:-translate-y-0.5 hover:bg-destructive/90":
              mappedVariant === "destructive",
            "border border-border bg-background shadow-sm hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent hover:text-accent-foreground":
              mappedVariant === "outline",
            "bg-secondary text-secondary-foreground hover:bg-secondary/80":
              mappedVariant === "secondary",
            "hover:bg-accent hover:text-accent-foreground": mappedVariant === "ghost",
            "text-primary underline-offset-4 hover:underline": mappedVariant === "link",
          },
          {
            "h-10 px-4 py-2": mappedSize === "default",
            "h-9 rounded-md px-3 text-xs": mappedSize === "sm",
            "h-11 rounded-lg px-8 text-base": mappedSize === "lg",
            "h-10 w-10 p-0": mappedSize === "icon",
          },
          fullWidth ? "w-full" : "",
          className
        )}
        disabled={loading || disabled}
        ref={ref}
        {...props}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {!loading && Icon && iconPosition === "left" && <Icon className={cn("h-4 w-4", children ? "mr-2" : "")} />}
        {children}
        {!loading && Icon && iconPosition === "right" && <Icon className={cn("h-4 w-4", children ? "ml-2" : "")} />}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button }
