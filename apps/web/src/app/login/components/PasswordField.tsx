import React, { useState } from "react"
import { Lock, Eye, EyeOff } from "lucide-react"

export interface PasswordFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  id: string
  error?: string
}

export const PasswordField = React.forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ label, id, error, placeholder, className, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)

    return (
      <div className="space-y-1.5 w-full">
        <label
          htmlFor={id}
          className="block text-xs font-medium text-ink-secondary"
        >
          {label}
        </label>
        <div className="relative flex items-center group">
          <div className="pointer-events-none absolute left-3.5 flex items-center justify-center text-ink-muted transition-colors z-10">
            <Lock className="h-4 w-4" />
          </div>
          <input
            id={id}
            ref={ref}
            type={showPassword ? "text" : "password"}
            placeholder={placeholder}
            className={`h-11 w-full rounded-control bg-muted border-0 text-sm font-normal text-ink placeholder:text-ink-placeholder pl-10 pr-10 transition-colors focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent-brand ${
              error ? 'ring-1 ring-tone-red-solid focus:ring-tone-red-solid' : 'focus:ring-1 focus:ring-border-strong'
            } ${className || ''}`}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 flex items-center justify-center h-8 w-8 rounded-control text-ink-muted hover:text-ink hover:bg-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brand"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {error && (
          <p className="text-xs text-tone-red-text font-normal pl-0.5 mt-1">
            {error}
          </p>
        )}
      </div>
    )
  }
)

PasswordField.displayName = "PasswordField"
