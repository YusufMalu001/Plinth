import React from "react"
import { LucideIcon } from "lucide-react"

export interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  id: string
  error?: string
  icon?: LucideIcon
}

export const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, id, error, placeholder, className, icon: Icon, type = "text", ...props }, ref) => {
    return (
      <div className="space-y-1.5 w-full">
        <label
          htmlFor={id}
          className="block text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]"
        >
          {label}
        </label>
        <div className="relative flex items-center group">
          {Icon && (
            <div className="pointer-events-none absolute left-3.5 flex items-center justify-center text-[#71717a] group-focus-within:text-accent-brand transition-colors z-10">
              <Icon className="h-4.5 w-4.5" />
            </div>
          )}
          <input
            id={id}
            ref={ref}
            type={type}
            placeholder={placeholder}
            className={`h-11 w-full rounded-control bg-white/[0.06] border border-white/10 text-sm font-medium text-white placeholder:text-[#71717a] transition-all duration-150 focus:outline-none focus:bg-white/[0.10] focus:border-white/30 focus:ring-2 focus:ring-accent-brand ${
              Icon ? 'pl-11 pr-4' : 'px-4'
            } ${error ? 'border-tone-red-solid focus:border-tone-red-solid focus:ring-tone-red-solid/20' : ''} ${className || ''}`}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs text-tone-red-solid font-medium pl-1 leading-none mt-1">
            {error}
          </p>
        )}
      </div>
    )
  }
)

FormField.displayName = "FormField"
