'use client';

import TechText from './TechText';
import { PRODUCT_NAME } from '../../config/brand';

const BOOT_HOLD_MS = 2600;
const BOOT_FADE_MS = 700;

/**
 * Boot splash: full-screen black canvas playing the TechText "Plinth" letter
 * reveal. Shown while the app boots (auth check, login gate) so the brand
 * intro covers loading time. `fading` cross-fades it out once the content
 * underneath is ready.
 */
export function BootSplash({ fading = false }: { fading?: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950 transition-opacity duration-700 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-hidden="true"
    >
      <div className="w-full max-w-3xl h-64 text-zinc-100">
        <TechText
          text={PRODUCT_NAME}
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
    </div>
  );
}

export const BOOT_TIMINGS = { BOOT_HOLD_MS, BOOT_FADE_MS };
