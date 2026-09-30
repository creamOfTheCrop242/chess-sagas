import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';

const config = JSON.parse(await readFile(new URL('../src/app/seo/seo.config.json', import.meta.url)));
const output = new URL('../dist/frontend/browser/', import.meta.url);
const read = (path) => readFile(new URL(path, output), 'utf8');

test('direct visits have unique metadata and the sitemap excludes private routes', async () => {
  const sitemap = new JSDOM(await read('sitemap.xml'), { contentType: 'text/xml' }).window.document;
  const urls = [...sitemap.querySelectorAll('loc')].map((node) => node.textContent);
  for (const [path, page] of Object.entries(config.pages)) {
    const html = await read(path === '/' ? 'index.html' : `${path.slice(1)}/index.html`);
    const document = new JSDOM(html).window.document;
    assert.equal(document.title, page.title);
    assert.equal(document.querySelectorAll('title').length, 1);
    assert.equal(document.querySelectorAll('meta[name="description"]').length, 1);
    assert.equal(document.querySelector('meta[property="og:title"]').content, page.title);
    assert.equal(document.querySelector('meta[property="og:url"]').content, config.origin + path);
    assert.equal(document.querySelectorAll('link[rel="canonical"]').length, 1);
    assert.equal(document.querySelector('link[rel="canonical"]').href, config.origin + path);
    assert.equal(document.querySelector('meta[name="robots"]').content, page.noindex ? 'noindex, follow' : 'index, follow');
    assert.equal(urls.includes(config.origin + path), !page.noindex);
    assert.equal(JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@type'], 'WebSite');
    assert.ok(document.querySelector('app-root'));
    assert.ok(document.querySelector('script[type="module"][src]'));
  }
  assert.match(await read('robots.txt'), /Sitemap: https:\/\/chesssagas.com\/sitemap.xml/);
  await read(config.image.slice(1));
});

test('dynamic fallback has no homepage canonical and the service worker hash matches the final HTML', async () => {
  const document = new JSDOM(await read('app-shell.html')).window.document;
  assert.equal(document.querySelector('link[rel="canonical"]'), null);
  assert.equal(document.querySelector('meta[property="og:url"]'), null);
  const manifest = JSON.parse(await read('ngsw.json'));
  const digest = createHash('sha1').update(await read('index.html')).digest('hex');
  assert.equal(manifest.hashTable['/index.html'], digest);
});
