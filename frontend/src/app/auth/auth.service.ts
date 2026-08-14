import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  reportingAdmin: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly userState = signal<AuthUser | null>(null);
  private readonly loadingState = signal(true);

  readonly user = this.userState.asReadonly();
  readonly loading = this.loadingState.asReadonly();

  constructor() {
    this.refresh();
  }

  refresh(): void {
    this.loadingState.set(true);
    this.http
      .get<{ user: AuthUser | null }>('/api/auth/me', {
        withCredentials: true,
      })
      .pipe(finalize(() => this.loadingState.set(false)))
      .subscribe({
        next: ({ user }) => this.userState.set(user),
        error: () => this.userState.set(null),
      });
  }

  signInWithGoogle(): void {
    window.location.assign('/api/auth/google?acceptLegal=true');
  }

  signInWithApple(): void {
    window.location.assign('/api/auth/apple?acceptLegal=true');
  }

  logout(): void {
    this.http
      .post('/api/auth/logout', null, {
        withCredentials: true,
        observe: 'response',
      })
      .subscribe({
        next: () => this.userState.set(null),
        error: () => this.refresh(),
      });
  }

  deleteAccount(confirmation: string) {
    return this.http
      .delete('/api/auth/account', {
        body: { confirmation },
        withCredentials: true,
        observe: 'response' as const,
      })
      .pipe(finalize(() => this.loadingState.set(false)));
  }

  clearUser(): void {
    this.userState.set(null);
  }
}
