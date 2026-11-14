/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    // Ground Rule: set theme.colors (not extend), so default Tailwind palette does NOT compile
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      page: 'var(--bg-page)',
      surface: 'var(--bg-surface)',
      muted: 'var(--bg-muted)',
      hover: 'var(--bg-hover)',
      active: 'var(--bg-active)',
      inverse: 'var(--bg-inverse)',
      border: {
        DEFAULT: 'var(--border)',
        strong: 'var(--border-strong)',
      },
      ink: {
        DEFAULT: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        placeholder: 'var(--text-placeholder)',
        inverse: 'var(--text-inverse)',
        link: 'var(--text-link)',
      },
      accent: {
        DEFAULT: 'var(--accent)',
        soft: 'var(--accent-soft)',
        hover: 'var(--accent-hover)',
      },
      green: {
        bg: 'var(--green-bg)',
        text: 'var(--green-text)',
        solid: 'var(--green-solid)',
      },
      red: {
        bg: 'var(--red-bg)',
        text: 'var(--red-text)',
        solid: 'var(--red-solid)',
      },
      orange: {
        bg: 'var(--orange-bg)',
        text: 'var(--orange-text)',
        solid: 'var(--orange-solid)',
      },
      amber: {
        bg: 'var(--amber-bg)',
        text: 'var(--amber-text)',
        solid: 'var(--amber-solid)',
      },
      blue: {
        bg: 'var(--blue-bg)',
        text: 'var(--blue-text)',
        solid: 'var(--blue-solid)',
      },
      purple: {
        bg: 'var(--purple-bg)',
        text: 'var(--purple-text)',
        solid: 'var(--purple-solid)',
      },
      teal: {
        bg: 'var(--teal-bg)',
        text: 'var(--teal-text)',
        solid: 'var(--teal-solid)',
      },
      pink: {
        bg: 'var(--pink-bg)',
        text: 'var(--pink-text)',
        solid: 'var(--pink-solid)',
      },
      grey: {
        bg: 'var(--grey-bg)',
        text: 'var(--grey-text)',
        solid: 'var(--grey-solid)',
      },
    },
    fontFamily: {
      sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
    },
    borderRadius: {
      none: '0px',
      sm: '6px',
      DEFAULT: '8px',
      md: '8px',
      lg: '12px',
      xl: '16px',
      full: '999px',
    },
    boxShadow: {
      none: 'none',
      popover: '0 6px 24px rgba(0,0,0,0.08)',
      modal: '0 12px 40px rgba(0,0,0,0.12)',
    },
    extend: {
      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
      },
      maxWidth: {
        content: '1200px',
      },
    },
  },
  plugins: [],
};
