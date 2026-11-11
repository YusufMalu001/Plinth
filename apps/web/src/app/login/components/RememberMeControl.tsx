import { Checkbox } from '@plinth/ui';
import React from "react"

export interface RememberMeControlProps {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label: string
}

export function RememberMeControl({
  id,
  checked,
  onChange,
  disabled = false,
  label
}: RememberMeControlProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
      <Checkbox

        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 shrink-0 appearance-none rounded-md border border-slate-300/80 dark:border-slate-600 bg-white/50 dark:bg-black/30 backdrop-blur-md checked:bg-[#004a80] checked:border-[#004a80] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#004a80] cursor-pointer transition-all relative after:content-[''] after:absolute after:hidden checked:after:block after:left-[4.5px] after:top-[1.5px] after:w-[4.5px] after:h-[7.5px] after:border-white after:border-r-2 after:border-b-2 after:rotate-45 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <span>{label}</span>
    </label>
  )
}
