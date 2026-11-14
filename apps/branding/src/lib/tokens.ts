/**
 * TypeScript constants for PLINTH theme tokens.
 * Single source of truth for runtime styling, canvas, tests, and static generation.
 */
export const PLINTH_TOKENS = {
  surfaces: {
    page: '#FFFFFF',
    surface: '#FFFFFF',
    muted: '#F4F5F6',
    hover: '#F8F8F8',
    active: '#EDEDED',
    inverse: '#171717',
  },
  borders: {
    default: '#EDEDED',
    strong: '#D9D9D9',
  },
  text: {
    primary: '#171717',
    secondary: '#525252',
    muted: '#6B6B6B',
    placeholder: '#8D8D8D',
    inverse: '#FFFFFF',
    link: '#3E63DD',
  },
  accent: {
    default: '#3E63DD',
    soft: '#EAF3FF',
    hover: '#2F4FB8',
  },
  semantic: {
    green: { bg: '#E4F5E9', text: '#18794E', solid: '#30A46C' },
    red: { bg: '#FFF0F0', text: '#C62828', solid: '#E5484D' },
    orange: { bg: '#FFF2E5', text: '#B54708', solid: '#F76808' },
    amber: { bg: '#FFF8DB', text: '#946800', solid: '#F5B800' },
    blue: { bg: '#EAF3FF', text: '#1D5FBF', solid: '#3E63DD' },
    purple: { bg: '#F3EEFF', text: '#6B3FC4', solid: '#8E4EC6' },
    teal: { bg: '#E3F7F5', text: '#0F766E', solid: '#12A594' },
    pink: { bg: '#FFEEF7', text: '#B3256B', solid: '#D6409F' },
    grey: { bg: '#F1F1F1', text: '#525252', solid: '#8D8D8D' },
  },
} as const;

export type SemanticTone = keyof typeof PLINTH_TOKENS.semantic;
