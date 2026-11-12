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
          className="block text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]"
        >
          {label}
        </label>
        <div className="relative flex items-center group">
          <div className="pointer-events-none absolute left-3.5 flex items-center justify-center text-[#71717a] transition-colors z-10">
            <Lock className="h-4 w-4" />
          </div>
          <input
            id={id}
            ref={ref}
            type={showPassword ? "text" : "password"}
            placeholder={placeholder}
            className={`h-11 w-full rounded-control bg-white/[0.06] border border-white/10 text-sm font-medium text-white placeholder:text-[#71717a] pl-10 pr-10 transition-colors focus:bg-white/[0.10] focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-accent-brand ${
              error ? 'border-tone-red-solid focus:border-tone-red-solid' : ''
            } ${className || ''}`}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 flex items-center justify-center h-8 w-8 rounded-control text-[#a1a1aa] hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brand"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {error && (
          <p className="text-xs text-tone-red-solid font-medium pl-0.5 mt-1">
            {error}
          </p>
        )}
      </div>
    )
  }
)

PasswordField.displayName = "PasswordField"
