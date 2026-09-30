import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

// Keep crawler-visible HTML and client-side navigation metadata in sync.
const config = JSON.parse(await readFile(new URL('../src/app/seo/seo.config.json', import.meta.url)));
const output = resolve('dist/frontend/browser');
const template = (await readFile(resolve(output, 'index.html'), 'utf8'))
  .replace(/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/g, '')
  .replace(/<title>.*?<\/title>/s, '')
  .replace(/<meta name="description"[^>]*>/, '');
const escape = (value) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function render(page, path) {
  const names = {
    description: page.description,
    robots: page.noindex ? 'noindex, follow' : 'index, follow',
    'twitter:card': 'summary',
    'twitter:title': page.title,
    'twitter:description': page.description,
    'twitter:image': config.origin + config.image,
    'twitter:image:alt': 'Chess Sagas emblem',
  };
  const properties = {
    'og:type': 'website', 'og:site_name': 'Chess Sagas',
    'og:title': page.title, 'og:description': page.description,
    'og:image': config.origin + config.image, 'og:image:alt': 'Chess Sagas emblem',
    ...(path !== null ? { 'og:url': config.origin + path } : {}),
  };
  const schema = {
    '@context': 'https://schema.org', '@type': 'WebSite',
    name: 'Chess Sagas', url: config.origin + '/',
    description: config.pages['/'].description, inLanguage: 'en',
  };
  const head = [
    `<title>${escape(page.title)}</title>`,
    ...Object.entries(names).map(([name, content]) => `<meta name="${name}" content="${escape(content)}">`),
    ...Object.entries(properties).map(([property, content]) => `<meta property="${property}" content="${escape(content)}">`),
    ...(path !== null ? [`<link rel="canonical" href="${escape(config.origin + path)}">`] : []),
    `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`,
  ].join('\n  ');
  return template.replace('</head>', `<!-- seo:start -->\n${head}\n<!-- seo:end -->\n</head>`);
}

for (const [path, page] of Object.entries(config.pages)) {
  const file = resolve(output, path === '/' ? 'index.html' : `${path.slice(1)}/index.html`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, render(page, path));
}
// Dynamic saga/profile URLs must not inherit the homepage's canonical URL.
await writeFile(resolve(output, 'app-shell.html'), render({
  title: 'Chess Sagas', description: config.pages['/'].description,
}, null));
const urls = Object.entries(config.pages).filter(([, page]) => !page.noindex)
  .map(([path]) => `  <url><loc>${escape(config.origin + path)}</loc></url>`);
await writeFile(resolve(output, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
await writeFile(resolve(output, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${config.origin}/sitemap.xml\n`);
// Angular hashes index.html during its build; refresh hashes after adding metadata.
execFileSync(process.execPath, [
  'node_modules/@angular/service-worker/ngsw-config.js', 'dist/frontend/browser', 'ngsw-config.json',
], { stdio: 'inherit' });
console.log(`Generated SEO HTML for ${Object.keys(config.pages).length} routes, sitemap.xml, and robots.txt.`);
