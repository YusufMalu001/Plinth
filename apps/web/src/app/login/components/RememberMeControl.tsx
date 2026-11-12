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
    <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-ink-secondary hover:text-ink transition-colors">
      <Checkbox
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 shrink-0 rounded-control border border-border-strong bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-brand cursor-pointer transition-colors"
      />
      <span>{label}</span>
    </label>
  )
}
