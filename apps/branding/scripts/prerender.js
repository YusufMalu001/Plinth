import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

async function prerender() {
  console.log('--- Starting Static Prerender (SSG) ---');

  const templatePath = path.resolve(distDir, 'index.html');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`dist/index.html not found. Run client build first.`);
  }
  const template = fs.readFileSync(templatePath, 'utf-8');

  // Load server bundle
  const serverEntryPath = path.resolve(distDir, 'server/entry-server.js');
  if (!fs.existsSync(serverEntryPath)) {
    throw new Error(`dist/server/entry-server.js not found. Run SSR build first.`);
  }

  const { render } = await import(serverEntryPath);

  // List of all routes to render
  const routesToRender = [
    '/',
    '/products',
    '/products/manufacturing',
    '/products/provenance',
    '/products/trade',
    '/products/build',
    '/products/fleet',
    '/products/campus',
    '/platform',
    '/pricing',
    '/about',
    '/demo',
    '/privacy',
    '/terms',
    '/404',
  ];

  for (const url of routesToRender) {
    const helmetContext = {};
    const { html: appHtml, helmet } = render(url, helmetContext);

    let finalHtml = template.replace('<!--app-html-->', appHtml);

    if (helmet) {
      const helmetTitle = helmet.title?.toString() || '';
      const helmetMeta = helmet.meta?.toString() || '';
      const helmetLink = helmet.link?.toString() || '';
      const helmetScript = helmet.script?.toString() || '';

      finalHtml = finalHtml
        .replace(/<title>.*?<\/title>/, helmetTitle || '<title>Plinth</title>')
        .replace('</head>', `${helmetMeta}\n${helmetLink}\n${helmetScript}\n</head>`);
    }

    // Determine output file path
    let filePath;
    if (url === '/') {
      filePath = path.resolve(distDir, 'index.html');
    } else if (url === '/404') {
      filePath = path.resolve(distDir, '404.html');
    } else {
      const subDir = path.resolve(distDir, url.slice(1));
      fs.mkdirSync(subDir, { recursive: true });
      filePath = path.resolve(subDir, 'index.html');
    }

    fs.writeFileSync(filePath, finalHtml, 'utf-8');
    console.log(`✓ Prerendered: ${url} -> ${path.relative(rootDir, filePath)}`);
  }

  // Generate sitemap.xml
  const domain = 'https://plinth.erp';
  const sitemapUrls = routesToRender.filter((r) => r !== '/404');
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls
  .map(
    (r) => `  <url>
    <loc>${domain}${r === '/' ? '' : r}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${r === '/' || r === '/products' ? 'weekly' : 'monthly'}</changefreq>
    <priority>${r === '/' ? '1.0' : r.startsWith('/products') ? '0.8' : '0.6'}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  fs.writeFileSync(path.resolve(distDir, 'sitemap.xml'), sitemapXml, 'utf-8');
  console.log('✓ Generated dist/sitemap.xml');

  // Ensure robots.txt is present
  const robotsTxt = `User-agent: *
Allow: /
Sitemap: ${domain}/sitemap.xml
`;
  fs.writeFileSync(path.resolve(distDir, 'robots.txt'), robotsTxt, 'utf-8');
  console.log('✓ Generated dist/robots.txt');

  console.log('--- SSG Prerender Complete ---');
}

prerender().catch((err) => {
  console.error('Prerender failed:', err);
  process.exit(1);
});
