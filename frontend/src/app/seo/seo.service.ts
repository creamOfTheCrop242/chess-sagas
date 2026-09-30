import { DOCUMENT, DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import config from './seo.config.json';

interface PageSeo { title: string; description: string; noindex?: boolean; }

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.update(this.document.location.pathname);
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((event) => this.update(event.urlAfterRedirects));
  }

  private update(url: string): void {
    const path = url.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    const pages: Record<string, PageSeo> = config.pages;
    const page = pages[path] ?? {
      title: path.startsWith('/records/') ? 'Read a Chess Saga | Chess Sagas' : 'Chronicler Profile | Chess Sagas',
      description: config.pages['/'].description,
    };
    const canonicalUrl = config.origin + path;
    this.title.setTitle(page.title);
    for (const [name, content] of Object.entries({
      description: page.description,
      robots: page.noindex ? 'noindex, follow' : 'index, follow',
      'twitter:card': 'summary',
      'twitter:title': page.title,
      'twitter:description': page.description,
      'twitter:image': config.origin + config.image,
      'twitter:image:alt': 'Chess Sagas emblem',
    })) this.meta.updateTag({ name, content });
    for (const [property, content] of Object.entries({
      'og:title': page.title, 'og:description': page.description,
      'og:url': canonicalUrl, 'og:type': 'website', 'og:site_name': 'Chess Sagas',
      'og:image': config.origin + config.image, 'og:image:alt': 'Chess Sagas emblem',
    })) this.meta.updateTag({ property, content });
    let canonical = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.rel = 'canonical';
      this.document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
  }
}
