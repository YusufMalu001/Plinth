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
          className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
        >
          {label}
        </label>
        <div className="relative flex items-center group">
          {Icon && (
            <div className="pointer-events-none absolute left-3.5 flex items-center justify-center text-slate-400 group-focus-within:text-[#004a80] transition-colors z-10">
              <Icon className="h-4.5 w-4.5" />
            </div>
          )}
          <input
            id={id}
            ref={ref}
            type={type}
            placeholder={placeholder}
            className={`h-12 w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all duration-150 focus:outline-none focus:border-[#004a80] dark:focus:border-blue-500 focus:ring-4 focus:ring-[#004a80]/15 shadow-2xs ${
              Icon ? 'pl-11 pr-4' : 'px-4'
            } ${error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : ''} ${className || ''}`}
            {...props}
          />
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

FormField.displayName = "FormField"
