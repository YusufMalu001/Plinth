#!/usr/bin/env node
/**
 * One-shot codemod: `@synergy/*` → `@plinth/*` (Addendum #9, Phase 8).
 * Renames workspace package names, all import specifiers, tsconfig path
 * aliases, transpilePackages, jest moduleNameMapper and turbo pipeline refs.
 * Run once; kept in the repo as the record of the mechanical rename.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.next', 'dist', '.turbo', '.git', 'coverage', 'output']);
const EXTS = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs', '.json', '.yml', '.yaml']);

let files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue;
      walk(full);
    } else if (EXTS.has(path.extname(entry.name)) && !entry.name.endsWith('.svg')) {
      files.push(full);
    }
  }
})(ROOT);

let changed = 0;
for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (rel === 'package-lock.json' || rel.startsWith('REFACTOR_LOG') || rel.startsWith('PLINTH_REFACTOR') || rel === 'scripts/rename-packages.cjs') continue;
  const src = fs.readFileSync(file, 'utf8');
  const next = src
    .replace(/@synergy\//g, '@plinth/')
    .replace(/"name":\s*"synergy-erp"/g, '"name": "plinth-erp"')
    .replace(/synergy-validation/g, 'plinth-validation');
  if (next !== src) {
    fs.writeFileSync(file, next);
    changed += 1;
  }
}
console.log(`renamed imports/packages in ${changed} files`);
