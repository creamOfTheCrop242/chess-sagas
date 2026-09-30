import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SeoService } from './seo.service';

@Component({ template: '' })
class EmptyPage {}

describe('SEO navigation', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([
      { path: '**', component: EmptyPage },
    ])] });
    TestBed.inject(SeoService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.head.querySelectorAll('meta[name="robots"], meta[name^="twitter:"], meta[property^="og:"], link[rel="canonical"]').forEach((tag) => tag.remove());
  });

  it('restores public indexing after leaving an account page and strips query parameters', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/profile');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
    await router.navigateByUrl('/guide?billing=success#start');
    expect(document.title).toBe('How to Turn a Chess Game into a Story | Chess Sagas');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index, follow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://chesssagas.com/guide');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://chesssagas.com/guide');
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  });

  it('gives individual records their own canonical URL', async () => {
    await TestBed.inject(Router).navigateByUrl('/records/example?ref=share');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://chesssagas.com/records/example');
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Read a Chess Saga | Chess Sagas');
  });
});
