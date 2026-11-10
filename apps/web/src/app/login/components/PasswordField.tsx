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
          className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
        >
          {label}
        </label>
        <div className="relative flex items-center group">
          <div className="pointer-events-none absolute left-3.5 flex items-center justify-center text-slate-400 group-focus-within:text-[#004a80] transition-colors z-10">
            <Lock className="h-4.5 w-4.5" />
          </div>
          <input
            id={id}
            ref={ref}
            type={showPassword ? "text" : "password"}
            placeholder={placeholder}
            className={`h-12 w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 pl-11 pr-11 transition-all duration-150 focus:outline-none focus:border-[#004a80] dark:focus:border-blue-500 focus:ring-4 focus:ring-[#004a80]/15 shadow-2xs ${
              error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : ''
            } ${className || ''}`}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004a80]"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {error && (
          <p className="text-xs text-rose-500 font-medium pl-1 leading-none mt-1">
            {error}
          </p>
        )}
      </div>
    )
  }
)

PasswordField.displayName = "PasswordField"
