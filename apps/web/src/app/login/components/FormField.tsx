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
          className="block text-xs font-bold uppercase tracking-wider text-ink-secondary"
        >
          {label}
        </label>
        <div className="relative flex items-center group">
          {Icon && (
            <div className="pointer-events-none absolute left-3.5 flex items-center justify-center text-ink-placeholder group-focus-within:text-accent-brand transition-colors z-10">
              <Icon className="h-4.5 w-4.5" />
            </div>
          )}
          <input
            id={id}
            ref={ref}
            type={type}
            placeholder={placeholder}
            className={`h-12 w-full rounded-control bg-muted border border-transparent text-sm font-semibold text-ink placeholder:text-ink-placeholder transition-all duration-150 focus:outline-none focus:bg-page focus:border-border-strong focus:ring-2 focus:ring-accent-brand ${
              Icon ? 'pl-11 pr-4' : 'px-4'
            } ${error ? 'border-tone-red-solid focus:border-tone-red-solid focus:ring-tone-red-solid/20' : ''} ${className || ''}`}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs text-tone-red-text font-medium pl-1 leading-none mt-1">
            {error}
          </p>
        )}
      </div>
    )
  }
)

FormField.displayName = "FormField"
