import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
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
    `,
  ],
})
export class AppComponent {
  readonly auth = inject(AuthService);
}
