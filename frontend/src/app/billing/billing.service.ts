import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

export type BillingProduct =
  | 'single_saga'
  | 'five_sagas'
  | 'scribe'
  | 'chronicler'
  | 'realm_founder';

export interface BillingStatus {
  configured: boolean;
  enforcementEnabled: boolean;
  unlimited: boolean;
  balance: number;
  reserved: number;
  available: number | null;
  subscription: {
    plan: 'SCRIBE' | 'CHRONICLER' | 'REALM_FOUNDER';
    status: string;
    currentPeriodEnd: string | null;
  } | null;
}

@Injectable({ providedIn: 'root' })
export class BillingClientService {
  private readonly http = inject(HttpClient);
  private readonly statusState = signal<BillingStatus | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly status = this.statusState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  refresh(): void {
    this.loadingState.set(true);
    this.errorState.set(null);
    this.http
      .get<BillingStatus>('/api/billing/status', { withCredentials: true })
      .pipe(finalize(() => this.loadingState.set(false)))
      .subscribe({
        next: (status) => this.statusState.set(status),
        error: () => {
          this.statusState.set(null);
          this.errorState.set('Credit information is temporarily unavailable.');
        },
      });
  }

  clear(): void {
    this.statusState.set(null);
    this.errorState.set(null);
  }

  checkout(product: BillingProduct): void {
    this.loadingState.set(true);
    this.errorState.set(null);
    this.http
      .post<{ url: string }>(
        '/api/billing/checkout',
        { product },
        { withCredentials: true },
      )
      .pipe(finalize(() => this.loadingState.set(false)))
      .subscribe({
        next: ({ url }) => window.location.assign(url),
        error: (error: { error?: { message?: string } }) =>
          this.errorState.set(
            error.error?.message ?? 'Checkout could not be opened.',
          ),
      });
  }

  openPortal(): void {
    this.loadingState.set(true);
    this.errorState.set(null);
    this.http
      .post<{ url: string }>('/api/billing/portal', null, {
        withCredentials: true,
      })
      .pipe(finalize(() => this.loadingState.set(false)))
      .subscribe({
        next: ({ url }) => window.location.assign(url),
        error: () =>
          this.errorState.set('The subscription portal could not be opened.'),
      });
  }
}
