'use client';

import React from "react"
import { RibbonFieldGradient, ColorStop } from "./RibbonFieldGradient"

export { RibbonFieldGradient }

export function RadialBackground({
  className,
  colors,
  paletteTheme = 'synergy-gold',
}: {
  className?: string;
  colors?: ColorStop[];
  paletteTheme?: 'synergy-gold' | 'ruby-coral';
}) {
  return (
    <RibbonFieldGradient
      className={className}
      colors={colors}
      paletteTheme={paletteTheme}
      angle={38}
      wave={14}
      softness={24}
      scale={68}
      speed={90}
      animated={true}
      grainOpacity={0.28}
    />
  )
}
