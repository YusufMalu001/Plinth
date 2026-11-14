import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brandingDir = path.resolve(__dirname, '..');

// Prohibited terms per Honesty Rule (rule 4)
// Checked against code and content files
const FORBIDDEN_WORDS = [
  'FDA' + ' compliant',
  'GMP' + ' compliant',
  '21' + ' CFR',
  'certi' + 'fied',
];

// Tailwind default palettes that MUST NOT compile/exist
const FORBIDDEN_TW_PALETTES = [
  'slate-', 'gray-', 'zinc-', 'neutral-', 'stone-',
  'red-', 'orange-', 'amber-', 'yellow-', 'lime-', 'green-',
  'emerald-', 'teal-', 'cyan-', 'sky-', 'blue-', 'indigo-',
  'violet-', 'purple-', 'fuchsia-', 'pink-', 'rose-'
];

let totalErrors = 0;

function auditFile(filePath) {
  // Only audit src/
  const relative = path.relative(brandingDir, filePath);
  if (!relative.startsWith('src/')) return;
  if (relative.endsWith('.d.ts') || relative.endsWith('.test.ts')) return;

  const content = fs.readFileSync(filePath, 'utf-8');

  // Check forbidden marketing terms
  for (const forbidden of FORBIDDEN_WORDS) {
    if (content.toLowerCase().includes(forbidden.toLowerCase())) {
      console.error(`❌ [Forbidden copy] in ${relative}: "${forbidden}" is prohibited by rule 4.`);
      totalErrors++;
    }
  }

  // Check forbidden Tailwind palette classes
  for (const palette of FORBIDDEN_TW_PALETTES) {
    const regex = new RegExp(`\\b(bg|text|border|ring|stroke|fill)-${palette}[0-9]+\\b`, 'g');
    const matches = content.match(regex);
    if (matches) {
      for (const m of matches) {
        console.error(`❌ [Forbidden Tailwind class] in ${relative}: "${m}" is not allowed. Use theme tokens.`);
        totalErrors++;
      }
    }
  }

  // Check raw hex outside tokens.css and tokens.ts
  if (!relative.includes('tokens.css') && !relative.includes('tokens.ts')) {
    const rawHexRegex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
    const hexMatches = content.match(rawHexRegex);
    if (hexMatches) {
      for (const hex of hexMatches) {
        console.error(`❌ [Raw hex color] in ${relative}: "${hex}". Use tokens from PLINTH_THEME.txt.`);
        totalErrors++;
      }
    }
  }
}

function traverse(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        traverse(fullPath);
      }
    } else if (entry.isFile() && /\.(tsx|ts|jsx|js|html)$/.test(entry.name)) {
      auditFile(fullPath);
    }
  }
}

console.log('🔍 Auditing branding app for theme tokens and compliance rules...');
traverse(path.join(brandingDir, 'src'));

if (totalErrors > 0) {
  console.error(`\n💥 Token & copy audit failed with ${totalErrors} error(s).`);
  process.exit(1);
} else {
  console.log('✅ Token & copy audit passed with 0 violations! 100% theme token compliant.\n');
}
