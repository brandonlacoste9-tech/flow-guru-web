import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Define the public routes for search engine indexing
const ROUTES = [
  '/', 
  // Add new public routes here as you ship them
  // '/pricing',
  // '/about',
  // '/blog'
];

const DOMAIN = 'https://floguru.com';
const today = new Date().toISOString().split('T')[0];

const generateSitemap = () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ROUTES.map(route => `  <url>
    <loc>${DOMAIN}${route}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${route === '/' ? 'daily' : 'weekly'}</changefreq>
    <priority>${route === '/' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`;

  const outputPath = resolve(process.cwd(), 'client', 'public', 'sitemap.xml');
  writeFileSync(outputPath, xml);
  console.log(`✅ Sitemap generated at ${outputPath}`);
};

generateSitemap();
