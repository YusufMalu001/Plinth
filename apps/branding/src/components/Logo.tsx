import React from 'react';
import { Link } from 'react-router-dom';

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className = '', showText = true }) => {
  return (
    <Link
      to="/"
      aria-label="Plinth Home"
      className={`inline-flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm ${className}`}
    >
      {/* 
        Inline SVG Logo built from approved brand rules:
        Solid black blocky "P" built from stacked blocks:
        - Base tier
        - Pillar
        - Upper block with accent mark
      */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-hidden="true"
      >
        {/* Base Tier block */}
        <rect x="5" y="23" width="22" height="4" rx="1" fill="var(--bg-inverse)" />
        {/* Pillar column */}
        <rect x="7" y="9" width="6" height="14" fill="var(--bg-inverse)" />
        {/* Upper block */}
        <rect x="13" y="9" width="12" height="9" rx="1" fill="var(--bg-inverse)" />
        {/* Accent mark inside upper block */}
        <rect x="16" y="11" width="6" height="5" rx="0.5" fill="var(--accent)" />
      </svg>
      {showText && (
        <span className="text-xl font-bold tracking-tight text-ink">
          Plinth
        </span>
      )}
    </Link>
  );
};
