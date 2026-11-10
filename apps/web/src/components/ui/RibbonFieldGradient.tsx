'use client';

import React, { useEffect, useRef } from 'react';

export interface ColorStop {
  hex: string;
  pos: number; // 0 to 100
  name?: string;
}

export interface RibbonFieldGradientProps {
  className?: string;
  colors?: ColorStop[];
  angle?: number;
  wave?: number;
  softness?: number;
  scale?: number;
  speed?: number;
  animated?: boolean;
  grainOpacity?: number;
  paletteTheme?: 'synergy-gold' | 'ruby-coral';
}

// 1. Synergy Navy Blue Theme (Multi-chromatic Luminous Silk Gradient based on #004a80)
export const SYNERGY_GOLD_PALETTE: ColorStop[] = [
  { hex: '#FFFFFF', pos: 0, name: 'Luminous Silk White' },
  { hex: '#8bb0fc', pos: 12, name: 'Luminous Azure Sheen' },
  { hex: '#3b82f6', pos: 28, name: 'Radiant Sapphire Blue' },
  { hex: '#1d4ed8', pos: 42, name: 'Cobalt Blue' },
  { hex: '#004a80', pos: 58, name: 'Synergy Brand Royal Navy' },
  { hex: '#0e2366', pos: 74, name: 'Deep Royal Navy' },
  { hex: '#07133b', pos: 88, name: 'Midnight Navy' },
  { hex: '#020617', pos: 100, name: 'Velvet Abyss' },
];

// 2. 21st.dev Original "gg" Ruby Coral Palette
export const RUBY_CORAL_PALETTE: ColorStop[] = [
  { hex: '#FFFFFF', pos: 0, name: 'White' },
  { hex: '#F472B6', pos: 30, name: 'Coral Rose' },
  { hex: '#B96A96', pos: 55, name: 'Coral red' },
  { hex: '#950F46', pos: 75, name: 'Ruby' },
  { hex: '#310018', pos: 100, name: 'Charcoal Plum' },
];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function RibbonFieldGradient({
  className = '',
  colors,
  angle = 38,
  wave = 32,
  softness = 36,
  scale = 72,
  speed = 95,
  animated = true,
  grainOpacity = 0.20,
  paletteTheme = 'synergy-gold',
}: RibbonFieldGradientProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeColors = colors || (paletteTheme === 'ruby-coral' ? RUBY_CORAL_PALETTE : SYNERGY_GOLD_PALETTE);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let startTime: number | null = null;

    // Parse color stops with precomputed RGB
    const parsedStops = activeColors
      .map((c) => ({
        pos: c.pos / 100,
        rgb: hexToRgb(c.hex),
      }))
      .sort((a, b) => a.pos - b.pos);

    // Fast color sampling at normalized coordinate t [0, 1]
    const sampleColor = (t: number): [number, number, number] => {
      const clampedT = Math.max(0, Math.min(1, t));
      if (clampedT <= parsedStops[0].pos) return parsedStops[0].rgb;
      if (clampedT >= parsedStops[parsedStops.length - 1].pos)
        return parsedStops[parsedStops.length - 1].rgb;

      for (let i = 0; i < parsedStops.length - 1; i++) {
        const s0 = parsedStops[i];
        const s1 = parsedStops[i + 1];
        if (clampedT >= s0.pos && clampedT <= s1.pos) {
          const range = s1.pos - s0.pos || 0.0001;
          const rawFactor = (clampedT - s0.pos) / range;
          const factor =
            softness > 0
              ? smoothStep(0, 1, rawFactor)
              : rawFactor;

          const r = Math.round(s0.rgb[0] + (s1.rgb[0] - s0.rgb[0]) * factor);
          const g = Math.round(s0.rgb[1] + (s1.rgb[1] - s0.rgb[1]) * factor);
          const b = Math.round(s0.rgb[2] + (s1.rgb[2] - s0.rgb[2]) * factor);
          return [r, g, b];
        }
      }
      return parsedStops[0].rgb;
    };

    // Internal resolution buffer for fluid 60fps rendering
    const bufferW = 400;
    const bufferH = 260;
    const offscreen = document.createElement('canvas');
    offscreen.width = bufferW;
    offscreen.height = bufferH;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    const imgData = offCtx.createImageData(bufferW, bufferH);
    const data32 = new Uint32Array(imgData.data.buffer);

    const renderFrame = (now: number) => {
      if (!startTime) startTime = now;
      const elapsedSeconds = (now - startTime) / 1000;

      // Dynamic multi-frequency fluid wave mechanics
      const ph = animated ? elapsedSeconds * (speed / 100) : 0;
      const waveClock1 = ph * 0.85;
      const waveClock2 = ph * 1.25 + 1.4;
      const waveClock3 = ph * 0.65 + 3.1;
      const waveClock4 = ph * 1.65 + 4.8;

      const curAngleDeg = angle + (animated ? Math.sin(ph * 0.4) * 8 : 0);
      const rad = (curAngleDeg * Math.PI) / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);

      const scaleFactor = (scale / 50) * 1.1;

      // Render pixels across full area with multi-harmonic wave turbulence
      for (let y = 0; y < bufferH; y++) {
        const ny = y / bufferH - 0.5;
        const rowOffset = y * bufferW;

        for (let x = 0; x < bufferW; x++) {
          const nx = x / bufferW - 0.5;

          // Primary projected coordinates
          const u = nx * cosA + ny * sinA;
          const v = -nx * sinA + ny * cosA;

          // Multi-harmonic fluid wave interference
          const wave1 = Math.sin(v * 3.2 * Math.PI + waveClock1) * 0.22;
          const wave2 = Math.cos(u * 2.6 * Math.PI - waveClock2) * 0.18;
          const wave3 = Math.sin((nx * 1.8 + ny * 1.4) * 2.8 * Math.PI + waveClock3) * 0.14;
          const wave4 = Math.cos((nx * 2.2 - ny * 1.8) * 3.4 * Math.PI + waveClock4) * 0.08;

          const totalWave = (wave / 100) * (wave1 + wave2 + wave3 + wave4);
          const uEff = u + totalWave;

          // Smooth radial vortex influence creating luxurious depth
          const centerDist = Math.sqrt(nx * nx + ny * ny);
          const radial = Math.sin(centerDist * Math.PI * 1.2 - waveClock1 * 0.6) * 0.15;

          const tPos = (uEff + radial) / scaleFactor + 0.45;
          const [r, g, b] = sampleColor(tPos);

          // Little-endian RGBA packing (0xAABBGGRR)
          data32[rowOffset + x] = (255 << 24) | (b << 16) | (g << 8) | r;
        }
      }

      offCtx.putImageData(imgData, 0, 0);

      // Blit to destination canvas
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth || bufferW;
        canvas.height = canvas.clientHeight || bufferH;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);

      animationFrameId = requestAnimationFrame(renderFrame);
    };

    animationFrameId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [activeColors, angle, wave, softness, scale, speed, animated]);

  return (
    <div className={`absolute inset-0 w-full h-full overflow-hidden select-none pointer-events-none ${className}`}>
      {/* Dynamic Animated Ribbon Field Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block object-cover scale-105"
      />

      {/* SVG Grain Noise Texture Overlay */}
      <div
        className="absolute inset-0 w-full h-full mix-blend-overlay pointer-events-none"
        style={{
          opacity: grainOpacity,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: '140px 140px',
        }}
      />

      {/* Dynamic Luminous Sheen / Light Flare */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.04] to-blue-400/[0.08] pointer-events-none" />

      {/* Subtle Depth Vignette */}
      <div className="absolute inset-0 bg-radial from-transparent via-transparent to-black/25 pointer-events-none" />
    </div>
  );
}
