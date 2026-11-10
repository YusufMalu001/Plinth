import React from "react"

export interface FeaturePillProps {
  icon: React.ElementType
  label: string
}

export function FeaturePill({ icon: Icon, label }: FeaturePillProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 dark:bg-black/10 px-4 py-3 text-xs font-semibold text-white backdrop-blur-xs transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/15 dark:hover:bg-black/15 hover:shadow-2xs select-none">
      <Icon className="h-4.5 w-4.5 text-white shrink-0" strokeWidth={2} />
      <span>{label}</span>
    </div>
  )
}
