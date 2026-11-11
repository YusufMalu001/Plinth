'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

/** Stage 1: TechText letter reveal holds before the acronym sequence starts. */
const REVEAL_MS = 2400;
/** Crossfade from the TechText canvas to the DOM letter row. */
const HANDOFF_MS = 450;
/** Hold per acronym word. */
const WORD_MS = 800;
/** Beat after "6. Hub" lands, before the splash hands over. */
const FINAL_BEAT_MS = 700;
const BOOT_FADE_MS = 700;

/**
 * Stage 2: the letters of PLINTH highlight one at a time while the
 * corresponding full form morphs in beneath. Calls `onComplete` exactly once
 * after "Hub" has landed.
 */
function LetterWordReveal({ onComplete }: { onComplete: () => void }) {
  const [index, setIndex] = useState(-1);
  const completedRef = useRef(false);

  useEffect(() => {
    if (index >= LETTERS.length) {
      if (completedRef.current) return;
      completedRef.current = true;
      const beat = window.setTimeout(onComplete, FINAL_BEAT_MS);
      return () => window.clearTimeout(beat);
    }
    const hold = window.setTimeout(
      () => setIndex((i) => i + 1),
      index < 0 ? 350 : WORD_MS
    );
    return () => window.clearTimeout(hold);
  }, [index, onComplete]);

  const active = Math.min(Math.max(index, 0), LETTERS.length - 1);
  const word = useMemo(
    () => (index < 0 ? '' : ACRONYM_WORDS[active]),
    [index, active]
  );

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        className="flex items-baseline font-semibold leading-none tracking-[-0.05em] text-[80px] sm:text-[110px]"
        aria-label={PRODUCT_NAME.toUpperCase()}
      >
        {LETTERS.map((letter, i) => {
          const isActive = i === index;
          return (
            <span
              key={letter}
              className={`relative transition-colors duration-200 ${
                isActive
                  ? 'text-white'
                  : i < index
                    ? 'text-zinc-100'
                    : 'text-zinc-600'
              }`}
            >
              {letter}
              {/* The active letter carries the dashed-outline accent from the reveal. */}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute -bottom-1 left-1/2 h-0 w-full -translate-x-1/2 border-b-2 border-dashed border-white/70"
                />
              )}
            </span>
          );
        })}
      </div>
      <div className="h-10 text-lg sm:text-xl font-semibold tracking-tight text-zinc-300">
        <DynamicText mode="morph" text={word} />
      </div>
    </div>
  );
}

export interface BootSplashProps {
  /** Cross-fade the splash out once the content underneath is ready. */
  fading?: boolean;
  /**
   * Called exactly once, after the full acronym sequence — every letter of
   * PLINTH highlighted and its full form shown — has finished. Callers gate
   * their content on this so nothing shows early.
   */
  onSequenceComplete?: () => void;
}

/**
 * Boot splash, two stages:
 * 1. the TechText "PLINTH" dashed letter reveal;
 * 2. a handoff to the DOM letter row where each letter highlights in sequence
 *    (P→L→I→N→T→H) while its full form morphs in below.
 * Loading happens behind this splash, never in place of it.
 */
export function BootSplash({ fading = false, onSequenceComplete }: BootSplashProps) {
  const [stage, setStage] = useState<'reveal' | 'acronym'>('reveal');

  useEffect(() => {
    if (!onSequenceComplete) return;
    const handoff = window.setTimeout(() => setStage('acronym'), REVEAL_MS);
    return () => window.clearTimeout(handoff);
  }, [onSequenceComplete]);

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950 transition-opacity duration-700 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-6 text-zinc-100">
        {/* Stage 1: canvas reveal, fading out as the letter row takes over. */}
        <div
          className={`w-full max-w-3xl h-64 transition-opacity duration-500 ${
            stage === 'reveal' ? 'opacity-100' : 'pointer-events-none absolute opacity-0'
          }`}
        >
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
          />
        </div>

        {/* Stage 2: letter-by-letter highlight with the full form morphing below. */}
        {onSequenceComplete ? (
          <div
            className={`transition-opacity duration-500 ${
              stage === 'acronym' ? 'opacity-100' : 'pointer-events-none absolute opacity-0'
            }`}
          >
            <LetterWordReveal onComplete={onSequenceComplete} />
          </div>
        ) : (
          <div className="h-16" />
        )}
      </div>
    </div>
  );
}

export const BOOT_TIMINGS = {
  BOOT_FADE_MS,
  REVEAL_MS,
  HANDOFF_MS,
  WORD_MS,
  FINAL_BEAT_MS,
};
