const fs = require('fs');

const tailwindPath = 'apps/web/tailwind.config.js';
let tw = fs.readFileSync(tailwindPath, 'utf8');

// The Google Stitch colors
const gsColors = {
  "on-secondary": "#ffffff",
  "on-secondary-fixed-variant": "#3f465c",
  "on-error": "#ffffff",
  "primary": "#855300",
  "secondary-fixed-dim": "#bec6e0",
  "secondary-fixed": "#dae2fd",
  "on-tertiary-fixed": "#0b1c30",
  "secondary": "#565e74",
  "inverse-on-surface": "#edf1f5",
  "on-surface": "#171c1f",
  "error-container": "#ffdad6",
  "secondary-container": "#dae2fd",
  "tertiary": "#505f76",
  "on-primary": "#ffffff",
  "surface-container-high": "#e4e9ed",
  "on-tertiary": "#ffffff",
  "outline": "#867461",
  "surface": "#f6fafe",
  "primary-fixed-dim": "#ffb95f",
  "inverse-surface": "#2c3134",
  "on-background": "#171c1f",
  "surface-container-low": "#f0f4f8",
  "on-error-container": "#93000a",
  "tertiary-container": "#a2b2cb",
  "inverse-primary": "#ffb95f",
  "surface-dim": "#d6dade",
  "surface-container-lowest": "#ffffff",
  "surface-bright": "#f6fafe",
  "on-primary-fixed-variant": "#653e00",
  "background": "#f6fafe",
  "on-secondary-container": "#5c647a",
  "error": "#ba1a1a",
  "primary-container": "#f59e0b",
  "surface-container": "#eaeef2",
  "on-primary-container": "#613b00",
  "on-tertiary-fixed-variant": "#38485d",
  "on-primary-fixed": "#2a1700",
  "surface-tint": "#855300",
  "tertiary-fixed": "#d3e4fe",
  "surface-container-highest": "#dfe3e7",
  "on-surface-variant": "#534434",
  "on-tertiary-container": "#35455a",
  "on-secondary-fixed": "#131b2e",
  "tertiary-fixed-dim": "#b7c8e1",
  "primary-fixed": "#ffddb8",
  "outline-variant": "#d8c3ad",
  "surface-variant": "#dfe3e7"
};

// 1. Remove the old GS colors from tailwind.config.js
for (const key in gsColors) {
  // Regex to remove `"key": "#value",`
  const regex = new RegExp(`\\s*"${key}":\\s*"#[a-fA-F0-9]{6}",?`, 'g');
  tw = tw.replace(regex, '');
}

// 2. Add gs- prefixed colors
const prefixedColors = Object.entries(gsColors)
  .map(([k, v]) => `        "gs-${k}": "${v}",`)
  .join('\n');

tw = tw.replace('colors: {', `colors: {\n${prefixedColors}`);
fs.writeFileSync(tailwindPath, tw);

// 3. Replace in TSX files
const files = [
  'apps/web/src/app/(dashboard)/sales/page.tsx',
  'apps/web/src/app/(dashboard)/inventory/page.tsx'
];

const colorKeys = Object.keys(gsColors);
// sort by length descending to prevent partial replacements (e.g. replacing 'primary' inside 'primary-container')
colorKeys.sort((a, b) => b.length - a.length);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  colorKeys.forEach(key => {
    // Replace text-key
    const textRegex = new RegExp(`text-${key}(?![\\w-])`, 'g');
    content = content.replace(textRegex, `text-gs-${key}`);
    
    // Replace bg-key
    const bgRegex = new RegExp(`bg-${key}(?![\\w-])`, 'g');
    content = content.replace(bgRegex, `bg-gs-${key}`);
    
    // Replace border-key
    const borderRegex = new RegExp(`border-${key}(?![\\w-])`, 'g');
    content = content.replace(borderRegex, `border-gs-${key}`);
    
    // Replace ring-key
    const ringRegex = new RegExp(`ring-${key}(?![\\w-])`, 'g');
    content = content.replace(ringRegex, `ring-gs-${key}`);
  });
  
  fs.writeFileSync(file, content);
});

console.log('Fixed Tailwind colors!');
