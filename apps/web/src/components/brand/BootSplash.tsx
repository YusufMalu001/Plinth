'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TechText from './TechText';
import DynamicText from './DynamicText';
import { PRODUCT_NAME } from '../../config/brand';

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

/** Fallback step if the lens focus events never arrive (e.g. reduced motion). */
const FALLBACK_MS = 650;
/** Grace period before the fallback timer takes over. */
const FALLBACK_GRACE_MS = 6000;
/** Beat after "Hub" lands, before the splash hands over. */
const FINAL_BEAT_MS = 700;
const BOOT_FADE_MS = 700;

/**
 * The acronym cue beneath the brand reveal. The word only loads when its
 * letter enters the "dark phase" of the TechText lens sweep — i.e. exactly
 * when that letter is drawn as dashes. Driven by real focus events from the
 * canvas, never by wall-clock page timing; a timer only kicks in if no focus
 * events arrive at all (reduced motion, sweep disabled).
 */
function AcronymCue({ focusIndex }: { focusIndex: number }) {
  const active = Math.min(Math.max(focusIndex, 0), LETTERS.length - 1);
  const word = useMemo(
    () => (focusIndex < 0 ? '' : ACRONYM_WORDS[active]),
    [focusIndex, active]
  );

  return (
    <div className="h-10 text-lg sm:text-xl font-semibold tracking-tight text-ink-secondary">
      <DynamicText mode="morph" text={word} />
    </div>
  );
}

export interface BootSplashProps {
  /** Cross-fade the splash out once the content underneath is ready. */
  fading?: boolean;
  /**
   * Called exactly once, after the full acronym sequence — every word of
   * PLINTH shown beneath the brand reveal — has finished. Callers gate
   * their content on this so nothing shows early.
   */
  onSequenceComplete?: () => void;
}

/**
 * Boot splash, one single composition:
 * the TechText "PLINTH" letters shine via the sweeping lens while each letter
 * is in its dashed "dark phase", and the matching full form morphs in beneath
 * at exactly that moment. The sequence is driven by the canvas itself, so it
 * runs at its own full pace — decoupled from any page loading.
 */
export function BootSplash({ fading = false, onSequenceComplete }: BootSplashProps) {
  const [focusIndex, setFocusIndex] = useState(-1);
  const seenFocusRef = useRef(false);
  const completedRef = useRef(false);

  const handleFocusGlyph = useCallback((index: number) => {
    if (index < 0) return; // lens between letters — keep the current word
    seenFocusRef.current = true;
    setFocusIndex(index);
  }, []);

  // Completion: once the last letter (H) has been focused, hold a beat and
  // hand over. Also a safety fallback that cycles the words on a timer if the
  // canvas never reports focus (reduced motion etc.), so the splash can't hang.
  useEffect(() => {
    if (!onSequenceComplete || completedRef.current) return;

    if (seenFocusRef.current) {
      if (focusIndex >= LETTERS.length - 1) {
        completedRef.current = true;
        const beat = window.setTimeout(onSequenceComplete, FINAL_BEAT_MS);
        return () => window.clearTimeout(beat);
      }
      return;
    }

    // Fallback: after the grace period, advance words on a fixed step.
    let fallback: number | undefined;
    const grace = window.setTimeout(() => {
      let index = 0;
      setFocusIndex(0);
      fallback = window.setInterval(() => {
        index += 1;
        setFocusIndex(Math.min(index, LETTERS.length - 1));
        if (index >= LETTERS.length - 1) {
          window.clearInterval(fallback);
          completedRef.current = true;
          window.setTimeout(onSequenceComplete, FINAL_BEAT_MS);
        }
      }, FALLBACK_MS);
    }, FALLBACK_GRACE_MS);

    return () => {
      window.clearTimeout(grace);
      if (fallback) window.clearInterval(fallback);
    };
  }, [focusIndex, onSequenceComplete]);

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-inverse transition-opacity duration-700 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-6 text-inverse">
        {/* The brand text shines letter by letter as the lens passes over it. */}
        <div className="w-full max-w-3xl h-64">
          <TechText
            text={PRODUCT_NAME.toUpperCase()}
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
            fontFamily=""
            letterSpacing={-0.05}
            accentColor="currentColor"
            reach={200}
            softness={0.7}
            lineStyle="dashed"
            strokeWidth={1.5}
            speed={1}
            bounce={0.4}
            selection={false}
            labels={false}
            color="currentColor"
            align="center"
            draggable={false}
            sweep
            interactive={false}
            onFocusGlyph={onSequenceComplete ? handleFocusGlyph : undefined}
          />
        </div>

        {/* The full form loads only when its letter is in the dark phase. */}
        {onSequenceComplete ? (
          <AcronymCue focusIndex={focusIndex} />
        ) : (
          <div className="h-10" />
        )}
      </div>
    </div>
  );
}

export const BOOT_TIMINGS = {
  BOOT_FADE_MS,
  FINAL_BEAT_MS,
};
