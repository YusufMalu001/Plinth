import React from "react"

export interface FeaturePillProps {
  icon: React.ElementType
  label: string
}

export function FeaturePill({ icon: Icon, label }: FeaturePillProps) {
  return (
    <div className="flex items-center gap-3 rounded-control border border-border bg-surface px-4 py-3 text-xs font-semibold text-ink transition-colors select-none">
      <Icon className="h-4.5 w-4.5 text-ink shrink-0" strokeWidth={2} />
      <span>{label}</span>
    </div>
  )
}
