import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AuthService } from './auth/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  template: `
    <nav class="account-bar" aria-label="Account navigation">
      <a class="home-link" routerLink="/">Chess Sagas</a>
      @if (auth.loading()) {
        <span class="account-loading">Checking the records…</span>
      } @else {
        @if (auth.user(); as user) {
          <a class="account-link" routerLink="/login">
            @if (user.avatarUrl) {
              <img [src]="user.avatarUrl" alt="" referrerpolicy="no-referrer" />
            }
            <span>{{ user.displayName }}</span>
          </a>
        } @else {
          <a class="account-link" routerLink="/login">Sign in</a>
        }
      }
    </nav>
    <router-outlet />
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
  readonly auth = inject(AuthService);
  readonly updateReady = signal(false);

  private readonly swUpdate = inject(SwUpdate);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
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
