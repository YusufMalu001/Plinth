import React from 'react';
import { Link } from 'react-router-dom';

interface LogoProps {
  className?: string;
  showText?: boolean;
  tone?: 'ink' | 'paper';
}

export const PlinthMark: React.FC<{ className?: string; tone?: 'ink' | 'paper' }> = ({
  className = '',
  tone = 'ink',
}) => {
  const ink = tone === 'ink' ? 'var(--bg-inverse)' : 'var(--text-inverse)';
  return (
    <svg
      viewBox="0 0 44 48"
      className={`shrink-0 ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Base Plinth bar */}
      <rect x="0" y="43" width="44" height="5" rx="1" fill={ink} />
      {/* Vertical Pillar stem */}
      <rect x="3" y="0" width="13" height="38" rx="1" fill={ink} />
      {/* Upper-right accent block */}
      <path
        d="M20 0 H33 C37.42 0 41 3.58 41 8 V26 H20 V0 Z"
        fill="var(--accent)"
      />
    </svg>
  );
};

export const Logo: React.FC<LogoProps> = ({
  className = '',
  showText = true,
  tone = 'ink',
}) => {
  const textColor = tone === 'ink' ? 'text-ink' : 'text-surface';
  return (
    <Link
      to="/"
      aria-label="Plinth Home"
      className={`inline-flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm ${className}`}
    >
      <PlinthMark className="w-[24px] h-[26px]" tone={tone} />
      {showText && (
        <span className={`text-xl font-bold tracking-tight ${textColor}`}>
          Plinth
        </span>
      )}
    </Link>
  );
};
