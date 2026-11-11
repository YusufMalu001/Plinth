'use client';

import { useEffect, useRef } from 'react';

/**
 * SatinRidges — flowing satin folds catching soft highlights.
 * Local canvas implementation matching the React Bits Pro "Satin Ridges"
 * look (light monochrome satin); swap for the official
 * `@reactbits-starter/satin-ridges-tw` component once a license key is
 * configured (see apps/web/components.json).
 */
export interface SatinRidgesProps {
  className?: string;
  /** Fold frequency across the width. */
  ridges?: number;
  /** Flow speed. */
  speed?: number;
}

export function SatinRidges({ className = '', ridges = 7, speed = 1 }: SatinRidgesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    let width = 1;
    let height = 1;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let dirty = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, canvas.clientWidth);
      height = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
    };

    const shade = (v: number) => {
      // v in [-1, 1] → soft satin greys with gentle highlight/sheen bands.
      const base = 244 + v * 7; // 237..251
      const sheen = Math.max(0, v) * 4;
      const l = Math.round(Math.min(255, base + sheen));
      return `rgb(${l},${l},${Math.round(l + 1)})`;
    };

    const draw = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) t += dt * speed;

      if (dirty) {
        dirty = false;
        ctx.fillStyle = shade(0);
        ctx.fillRect(0, 0, width, height);
      }

      const cols = Math.max(2, Math.floor(width));
      const mid = height * 0.5;
      const amp = height * 0.28;
      for (let x = 0; x < cols; x++) {
        const u = x / width;
        const fold =
          Math.sin(u * ridges * Math.PI * 2 + t * 0.7) * 0.62 +
          Math.sin(u * ridges * Math.PI * 3.1 - t * 0.45 + 1.7) * 0.28 +
          Math.sin(u * ridges * Math.PI * 0.8 + t * 0.22 + 4.1) * 0.35;
        const highlight =
          Math.sin(u * ridges * Math.PI * 2 + t * 0.7 + 0.9) * 0.5 +
          Math.sin(u * ridges * Math.PI * 5.3 - t * 0.6) * 0.2;
        const y = mid + fold * amp;
        ctx.fillStyle = shade(highlight * 0.9);
        // Ridge body with soft falloff (drawn as a vertical gradient column).
        const column = ctx.createLinearGradient(0, y - amp * 0.55, 0, y + amp * 0.55);
        column.addColorStop(0, 'rgba(255,255,255,0)');
        column.addColorStop(0.42, shade(highlight * 0.9));
        column.addColorStop(0.58, shade(-Math.abs(highlight) * 0.35));
        column.addColorStop(1, 'rgba(250,250,250,0)');
        ctx.fillStyle = column;
        ctx.fillRect(x, Math.max(0, y - amp * 0.55), 1.2, amp * 1.1);
      }

      // Very soft vertical vignette so the fold field reads as one cloth.
      const top = ctx.createLinearGradient(0, 0, 0, height);
      top.addColorStop(0, 'rgba(255,255,255,0.35)');
      top.addColorStop(0.5, 'rgba(255,255,255,0)');
      top.addColorStop(1, 'rgba(240,240,240,0.28)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, width, height);

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    const wake = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(draw);
    };

    resize();
    wake();
    const ro = new ResizeObserver(() => {
      resize();
      wake();
    });
    ro.observe(canvas);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ridges, speed]);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} aria-hidden="true" />;
}
