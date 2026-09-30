import { Component, DestroyRef, effect, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { BillingClientService } from './billing/billing.service';
import { PgnApiService } from './pgn-viewer/pgn-api.service';
import { PwaInstallComponent } from './pwa-install.component';
import { SeoService } from './seo/seo.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet, PwaInstallComponent],
  template: `
    <app-pwa-install />
    <nav class="account-bar" aria-label="Account navigation">
      <a class="home-link" routerLink="/">Chess Sagas</a>
      <div class="account-actions">
        <a class="pricing-link support-link" routerLink="/contact">Support</a>
        @if (auth.user()?.reportingAdmin) {
          <a class="pricing-link" routerLink="/admin/reports">Reports</a>
        }
        <a class="pricing-link" routerLink="/pricing">
          @if (billing.status(); as status) {
            {{ status.unlimited ? 'Unlimited' : status.available + ' credits' }}
          } @else {
            Saga credits
          }
        </a>
        @if (auth.loading()) {
          <span class="account-loading">Checking the records…</span>
        } @else {
          @if (auth.user(); as user) {
            <a class="account-link" routerLink="/login">
              @if (user.avatarUrl) {
                <img
                  [src]="user.avatarUrl"
                  alt=""
                  referrerpolicy="no-referrer"
                />
              }
              <span>{{ user.displayName }}</span>
            </a>
          } @else {
            <a class="account-link" routerLink="/login">Sign in</a>
          }
        }
      </div>
    </nav>
    @if (pgnApi.activeGenerationGameId(); as gameId) {
      <a
        class="generation-return"
        routerLink="/"
        [queryParams]="{ generation: gameId }"
      >
        <span class="generation-pulse" aria-hidden="true"></span>
        <span><strong>Saga in progress</strong> — return to the chronicler</span>
        <span aria-hidden="true">→</span>
      </a>
    }
    <router-outlet />
    <footer class="site-footer">
      <a routerLink="/terms">Terms</a>
      <a routerLink="/privacy">Privacy</a>
      <a routerLink="/refunds">Refunds & cancellations</a>
      @if (auth.user()) {
        <a routerLink="/profile">Delete account</a>
      } @else {
        <a routerLink="/privacy" fragment="deletion">Delete account or data</a>
      }
      <a routerLink="/contact">Contact</a>
      <span>© 2026 Chess Sagas</span>
    </footer>
    @if (billingNotice(); as notice) {
      <section class="billing-notice" role="status">
        <span>{{ notice }}</span>
        <a routerLink="/pricing">View saga credits</a>
        <button
          type="button"
          (click)="billingNotice.set(null)"
          aria-label="Dismiss"
        >
          ×
        </button>
      </section>
    }
    @if (updateReady()) {
      <section
        class="update-prompt"
        role="alertdialog"
        aria-labelledby="update-title"
        aria-describedby="update-description"
      >
        <div>
          <p class="update-kicker">A new chronicle is ready</p>
          <h2 id="update-title">Update Chess Sagas</h2>
          <p id="update-description">
            Reload to use the latest version. Your saved stories will remain
            available.
          </p>
        </div>
        <div class="update-actions">
          <button type="button" class="update-later" (click)="dismissUpdate()">
            Later
          </button>
          <button type="button" class="update-now" (click)="applyUpdate()">
            Reload now
          </button>
        </div>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
      }

      .account-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 3.5rem;
        padding: 0.55rem max(1rem, env(safe-area-inset-right)) 0.55rem
          max(1rem, env(safe-area-inset-left));
        border-bottom: 1px solid rgba(196, 168, 98, 0.22);
        background: rgba(7, 12, 19, 0.82);
        backdrop-filter: blur(12px);
      }

      .home-link,
      .account-link {
        color: var(--gold-bright);
        font-family: var(--font-display);
        font-size: 0.72rem;
        letter-spacing: 0.11em;
        text-decoration: none;
        text-transform: uppercase;
      }

      .account-actions {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .pricing-link {
        color: var(--seal);
        font-family: var(--font-display);
        font-size: 0.66rem;
        letter-spacing: 0.08em;
        text-decoration: none;
        text-transform: uppercase;
      }

      .account-link {
        display: flex;
        align-items: center;
        gap: 0.55rem;
      }

      .account-link img {
        width: 2rem;
        height: 2rem;
        border: 1px solid rgba(196, 168, 98, 0.65);
        border-radius: 50%;
      }

      .account-loading {
        color: var(--ink-dim);
        font-size: 0.72rem;
      }

      .generation-return {
        position: sticky;
        top: 0;
        z-index: 900;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.7rem;
        min-height: 2.7rem;
        padding: 0.55rem 1rem;
        border-bottom: 1px solid rgba(196, 168, 98, 0.48);
        color: var(--gold-bright);
        background: rgba(10, 18, 28, 0.96);
        font-family: var(--font-display);
        font-size: 0.72rem;
        letter-spacing: 0.06em;
        text-decoration: none;
        text-transform: uppercase;
        box-shadow: 0 0.75rem 2rem rgba(0, 0, 0, 0.28);
      }

      .generation-pulse {
        width: 0.55rem;
        height: 0.55rem;
        border-radius: 50%;
        background: var(--seal);
        box-shadow: 0 0 0.75rem var(--seal);
        animation: generation-pulse 1.8s ease-in-out infinite;
      }

      @keyframes generation-pulse {
        50% {
          opacity: 0.45;
          transform: scale(0.72);
        }
      }

      .site-footer {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.65rem 1.1rem;
        padding: 1.4rem max(1rem, env(safe-area-inset-right))
          max(1.4rem, env(safe-area-inset-bottom))
          max(1rem, env(safe-area-inset-left));
        border-top: 1px solid rgba(196, 168, 98, 0.22);
        color: var(--ink-dim);
        background: rgba(7, 12, 19, 0.88);
        font-size: 0.68rem;
      }

      .site-footer a {
        color: var(--ink-muted);
        text-decoration: none;
      }

      .site-footer a:hover,
      .site-footer a:focus-visible {
        color: var(--gold-bright);
      }

      .update-prompt {
        position: fixed;
        right: max(1rem, env(safe-area-inset-right));
        bottom: max(1rem, env(safe-area-inset-bottom));
        z-index: 1000;
        width: min(27rem, calc(100vw - 2rem));
        padding: 1.2rem;
        border: 1px solid var(--gold);
        background:
          linear-gradient(135deg, rgba(196, 168, 98, 0.12), transparent 45%),
          rgba(8, 15, 24, 0.98);
        box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.55);
      }

      .billing-notice {
        position: fixed;
        top: 4.25rem;
        left: 50%;
        z-index: 1001;
        display: flex;
        align-items: center;
        gap: 0.8rem;
        width: min(36rem, calc(100vw - 2rem));
        padding: 0.85rem 1rem;
        border: 1px solid var(--gold);
        background: rgba(8, 15, 24, 0.98);
        color: var(--ink);
        box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.45);
        transform: translateX(-50%);
      }

      .billing-notice a {
        color: var(--seal);
      }
      .billing-notice button {
        margin-left: auto;
        border: 0;
        color: var(--gold-bright);
        background: transparent;
        font-size: 1.4rem;
        cursor: pointer;
      }

      @media (max-width: 520px) {
        .account-actions {
          gap: 0.6rem;
        }
        .account-link span {
          display: none;
        }
        .pricing-link {
          font-size: 0.58rem;
        }
        .billing-notice {
          align-items: flex-start;
          flex-wrap: wrap;
        }
      }

      .update-kicker,
      .update-prompt h2,
      .update-prompt p {
        margin: 0;
      }

      .update-kicker {
        color: var(--seal);
        font-family: var(--font-display);
        font-size: 0.64rem;
        letter-spacing: 0.13em;
        text-transform: uppercase;
      }

      .update-prompt h2 {
        margin-top: 0.35rem;
        color: var(--gold-bright);
        font-family: var(--font-display);
        font-size: 1.15rem;
      }

      .update-prompt #update-description {
        margin-top: 0.45rem;
        color: var(--ink-muted);
        line-height: 1.45;
      }

      .update-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.65rem;
        margin-top: 1rem;
      }

      .update-actions button {
        min-height: 2.65rem;
        padding: 0.55rem 0.85rem;
        border: 1px solid rgba(196, 168, 98, 0.48);
        color: var(--gold-bright);
        background: transparent;
        font-family: var(--font-display);
        font-size: 0.68rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        cursor: pointer;
      }

      .update-actions .update-now {
        border-color: var(--gold);
        background: rgba(196, 168, 98, 0.18);
      }

      .update-actions button:focus-visible {
        outline: 2px solid var(--north);
        outline-offset: 2px;
      }
    `,
  ],
})
export class AppComponent {
  private readonly seo = inject(SeoService);
  readonly auth = inject(AuthService);
  readonly billing = inject(BillingClientService);
  readonly pgnApi = inject(PgnApiService);
  readonly updateReady = signal(false);
  readonly billingNotice = signal<string | null>(null);

  private readonly swUpdate = inject(SwUpdate);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect(() => {
      if (this.auth.user()) {
        this.billing.refresh();
      } else if (!this.auth.loading()) {
        this.billing.clear();
      }
    });

    const billingResult = new URLSearchParams(window.location.search).get(
      'billing',
    );
    if (billingResult === 'success') {
      this.billingNotice.set(
        'Payment received. Your saga credits are being added.',
      );
      [0, 1500, 4000].forEach((delay) =>
        window.setTimeout(() => this.billing.refresh(), delay),
      );
    } else if (billingResult === 'cancelled') {
      this.billingNotice.set('Checkout was cancelled. No charge was made.');
    }

    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(
        filter(
          (event): event is VersionReadyEvent => event.type === 'VERSION_READY',
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.updateReady.set(true));
  }

  dismissUpdate(): void {
    this.updateReady.set(false);
  }

  async applyUpdate(): Promise<void> {
    await this.swUpdate.activateUpdate();
    document.location.reload();
  }
}
