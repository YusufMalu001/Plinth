/** Synchronize an existing checkout without resetting data or creating migrations. */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
if (Number(process.versions.node.split('.')[0]) !== 22) {
  console.error('Database sync requires Node 22.x (see package.json). Switch Node versions and retry.');
  process.exit(1);
}
if (!fs.existsSync(path.join(root, '.env'))) {
  console.error('Missing root .env. Configure the intended database before running db:sync.');
  process.exit(1);
}
// Resolve installed CLIs directly to preserve arguments consistently on Windows/Linux.
const dotenv = require.resolve('dotenv-cli/cli.js');
const prisma = require.resolve('prisma/build/index.js');
const schema = path.join(root, 'database/prisma/schema.prisma');
console.log('Syncing the database configured in root .env. Stop API/worker processes first if Windows reports a locked Prisma file.');
for (const args of [['validate'], ['migrate', 'deploy'], ['generate'], ['migrate', 'status']]) {
  console.log('Database sync: prisma ' + args.join(' '));
  const result = spawnSync(process.execPath, [dotenv, '-e', path.join(root, '.env'), '--',
    process.execPath, prisma, ...args, '--schema=' + schema], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    if (result.error) console.error('Could not start Prisma: ' + result.error.code);
    console.error('Database sync failed. Resolve the reported error before starting/restarting the API.');
    process.exit(result.status || 1);
  }
}
console.log('Database synchronized. Restart/rebuild the API and workers to load the generated client.');
