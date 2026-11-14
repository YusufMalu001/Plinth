const fs = require('fs');
const path = require('path');

const brandingDist = path.resolve(__dirname, '../../branding/dist');
const webPublicBranding = path.resolve(__dirname, '../public/branding');

if (fs.existsSync(brandingDist)) {
  fs.mkdirSync(webPublicBranding, { recursive: true });
  fs.cpSync(brandingDist, webPublicBranding, { recursive: true });
  console.log('✓ Synced branding build into apps/web/public/branding');
} else {
  console.log('Notice: apps/branding/dist not found. Run npm run build in apps/branding first.');
}
