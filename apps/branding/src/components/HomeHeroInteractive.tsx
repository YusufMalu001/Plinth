import React, { useState, useEffect } from 'react';
import { Sparkles, Check, CheckCircle2, AlertCircle } from 'lucide-react';

export const HomeHeroInteractive: React.FC = () => {
  const [displayText, setDisplayText] = useState('');
  const [step, setStep] = useState<'typing' | 'drafted' | 'approved'>('typing');
  const [isPaused, setIsPaused] = useState(false);

  const fullPrompt = 'Create purchase orders for everything below reorder level';

  useEffect(() => {
    // If prefers-reduced-motion is true, show static drafted state awaiting user approval
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      setDisplayText(fullPrompt);
      setStep('drafted');
      return;
    }

    if (isPaused) return;

    if (step === 'typing') {
      if (displayText.length < fullPrompt.length) {
        const timeout = setTimeout(() => {
          setDisplayText(fullPrompt.slice(0, displayText.length + 1));
        }, 35);
        return () => clearTimeout(timeout);
      } else {
        const timeout = setTimeout(() => {
          setStep('drafted');
        }, 600);
        return () => clearTimeout(timeout);
      }
    } else if (step === 'drafted') {
      // Stay on drafted state waiting indefinitely for user to click "Approve All"
      return;
    } else if (step === 'approved') {
      // Once approved by user, hold confirmation for 8s then loop back to re-demonstrate
      const timeout = setTimeout(() => {
        setDisplayText('');
        setStep('typing');
      }, 8000);
      return () => clearTimeout(timeout);
    }
  }, [displayText, step, isPaused, fullPrompt]);

  const handleApprove = () => {
    setStep('approved');
  };

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="w-full max-w-5xl mx-auto rounded-xl border border-border bg-surface shadow-modal overflow-hidden text-left"
    >
      {/* Top Header of Preview Card */}
      <div className="px-4 py-3 bg-muted border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-surface border border-border text-accent">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-ink ">
            Plinth AI Operator &bull; Live Preview
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-solid animate-pulse" />
          <span className="text-[11px] text-ink-muted">Preview Guard Active</span>
        </div>
      </div>

      {/* Input prompt area with typing animation */}
      <div className="p-4 sm:p-5 border-b border-border bg-surface">
        <div className="text-xs text-ink-muted mb-1.5 uppercase tracking-wider">
          User Request (Role: Plant Procurement Manager)
        </div>
        <div className="p-3 rounded-md bg-muted/60 border border-border flex items-center gap-2 text-xs sm:text-sm text-ink min-h-[44px]">
          <span className="text-accent">&gt;</span>
          <span>{displayText}</span>
          {step === 'typing' && (
            <span className="inline-block w-1.5 h-4 bg-accent animate-pulse" />
          )}
        </div>
      </div>

      {/* Result Card area */}
      <div className="p-4 sm:p-5 bg-surface space-y-4">
        {step === 'typing' && (
          <div className="p-6 text-center text-xs text-ink-muted flex flex-col items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span>Scanning real-time inventory ledger and active engineering BOM thresholds...</span>
          </div>
        )}

        {(step === 'drafted' || step === 'approved') && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-ink">
                  {step === 'drafted'
                    ? '6 Purchase Orders drafted, awaiting approval'
                    : '6 Purchase Orders released to vendors'}
                </h4>
                <p className="text-xs text-ink-secondary">
                  14 depleted raw material SKUs aggregated by vendor lead-time.
                </p>
              </div>

              {step === 'drafted' && (
                <button
                  type="button"
                  onClick={handleApprove}
                  className="px-3 py-1.5 rounded-md bg-inverse text-ink-inverse text-xs font-semibold hover:bg-ink-secondary/90 transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Approve All
                </button>
              )}

              {step === 'approved' && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-text bg-green-bg px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Approved &amp; Logged
                </span>
              )}
            </div>

            {/* List of Simulated drafted PO rows */}
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden text-xs">
              <div className="p-2.5 bg-muted/50 font-semibold text-ink-secondary flex items-center justify-between">
                <span>Vendor / Item</span>
                <span>Quantity</span>
                <span>Audit Status</span>
              </div>

              <div className="p-2.5 flex items-center justify-between hover:bg-hover transition-colors">
                <div>
                  <div className="font-semibold text-ink">Apex Fasteners &amp; Piping</div>
                  <div className="text-[11px] text-ink-muted">PO-2026-081 &bull; SS 304 Hex Bolts M12</div>
                </div>
                <div className="text-ink">2,500 pcs</div>
                <div>
                  {step === 'drafted' ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-bg text-red-text">
                      Draft
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-bg text-green-text">
                      Released
                    </span>
                  )}
                </div>
              </div>

              <div className="p-2.5 flex items-center justify-between hover:bg-hover transition-colors">
                <div>
                  <div className="font-semibold text-ink">Bharat Steel Tubes Ltd</div>
                  <div className="text-[11px] text-ink-muted">PO-2026-082 &bull; Seamless Pipe 1/2&quot; SCH40</div>
                </div>
                <div className="text-ink">450 m</div>
                <div>
                  {step === 'drafted' ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-bg text-orange-text">
                      To Receive
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-bg text-green-text">
                      Released
                    </span>
                  )}
                </div>
              </div>

              <div className="p-2.5 flex items-center justify-between hover:bg-hover transition-colors">
                <div>
                  <div className="font-semibold text-ink">Polymer Extrusions Corp</div>
                  <div className="text-[11px] text-ink-muted">PO-2026-083 &bull; PP Granules Natural</div>
                </div>
                <div className="text-ink">1,200 kg</div>
                <div>
                  {step === 'drafted' ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-bg text-red-text">
                      Draft
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-bg text-green-text">
                      Released
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Audit trail footer */}
            <div className="p-2.5 rounded bg-muted/60 border border-border flex items-center justify-between text-[11px] text-ink-muted ">
              <span className="flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-ink-muted" />
                Immutable ledger event logged
              </span>
              <span>Audit ID: #AUD-7721-09</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
