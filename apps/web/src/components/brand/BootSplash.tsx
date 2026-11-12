'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import TechText from './TechText';
import DynamicText from './DynamicText';

/** PLINTH — the acronym: Production, Logistics, Inventory, Network, Tracking, Hub. */
export const ACRONYM_WORDS = [
  'Production',
  'Logistics',
  'Inventory',
  'Network',
  'Tracking',
  'Hub',
] as const;

const LETTERS = ['P', 'L', 'I', 'N', 'T', 'H'] as const;

/**
 * Total branding splash display time (5 seconds).
 * The 6 acronym words (Production -> Hub) sequence across 4.2 seconds
 * (~700ms each), followed by an 800ms hold on "Hub" to total 5000ms.
 */
const BRANDING_DURATION_MS = 5000;
const ACRONYM_STEP_MS = 700;
const BOOT_FADE_MS = 600;

/**
 * The acronym cue beneath the brand reveal.
 * Displays "Production, Logistics, Inventory, Network, Tracking, Hub"
 * in sequence using smooth morphing typography.
 */
function AcronymCue({ wordIndex }: { wordIndex: number }) {
  const active = Math.min(Math.max(wordIndex, 0), LETTERS.length - 1);
  const word = useMemo(
    () => (wordIndex < 0 ? '' : ACRONYM_WORDS[active]),
    [wordIndex, active]
  );

  return (
    <div className="h-10 text-lg sm:text-xl font-semibold tracking-wide text-zinc-300">
      <DynamicText mode="morph" text={word} />
    </div>
  );
}

export interface BootSplashProps {
  /** Cross-fade the splash out once the content underneath is ready. */
  fading?: boolean;
  /**
   * Called exactly once when the 5-second branding sequence completes.
   */
  onSequenceComplete?: () => void;
}

/**
 * Branding Page Splash (5 seconds):
 * Renders the TechText "Plinth" brand animation with the exact requested configuration:
 * - fontWeight: 600, fontSize: 150, reveal: 'letter'
 * - dashLength: 4, dashGap: 2, specks: 15
 * - intro: 'none', introDuration: 2, clickKick: true, guides: false
 * Below the brand name, the acronym sequence steps through:
 * "Production" -> "Logistics" -> "Inventory" -> "Network" -> "Tracking" -> "Hub"
 */
export function BootSplash({ fading = false, onSequenceComplete }: BootSplashProps) {
  const [wordIndex, setWordIndex] = useState(0);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!onSequenceComplete) return;

    // Step through the acronym sequence: P, L, I, N, T, H
    const interval = window.setInterval(() => {
      setWordIndex((current) => {
        if (current < LETTERS.length - 1) {
          return current + 1;
        }
        return current;
      });
    }, ACRONYM_STEP_MS);

    // Handover precisely at 5 seconds
    const timer = window.setTimeout(() => {
      window.clearInterval(interval);
      if (!completedRef.current) {
        completedRef.current = true;
        onSequenceComplete();
      }
    }, BRANDING_DURATION_MS);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timer);
    };
  }, [onSequenceComplete]);

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-[#09090b] transition-opacity duration-600 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-4 text-white w-full px-4">
        {/* Exact container and configuration requested */}
        <div style={{ width: '100%', height: '480px', position: 'relative' }}>
          <TechText
            text="Plinth"
            fontWeight={600}
            fontSize={150}
            reveal="letter"
            dashLength={4}
            dashGap={2}
            specks={15}
            intro="none"
            introDuration={2}
            clickKick
            guides={false}
          />
        </div>

        {/* Acronym sequence beneath brand name */}
        <div className="-mt-16 sm:-mt-20 flex flex-col items-center">
          {onSequenceComplete ? (
            <AcronymCue wordIndex={wordIndex} />
          ) : (
            <div className="h-10" />
          )}
        </div>
      </div>
    </div>
  );
}

export const BOOT_TIMINGS = {
  BOOT_FADE_MS,
  BRANDING_DURATION_MS,
};
