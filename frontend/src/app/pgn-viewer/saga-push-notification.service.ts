import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { catchError, from, Observable, of, switchMap, take } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SagaPushNotificationService {
  constructor(
    private readonly http: HttpClient,
    private readonly swPush: SwPush,
  ) {}

  subscriptionForSaga(): Observable<PushSubscription | null> {
    if (!this.swPush.isEnabled || !('Notification' in globalThis)) {
      return of(null);
    }
    if (Notification.permission === 'denied') return of(null);

    return this.swPush.subscription.pipe(
      take(1),
      switchMap((existing) =>
        existing ? of(existing) : this.requestSubscription(),
      ),
      catchError(() => of(null)),
    );
  }

  private requestSubscription(): Observable<PushSubscription> {
    return this.http.get<{ publicKey: string }>('/api/push/public-key').pipe(
      switchMap(({ publicKey }) =>
        from(
          this.swPush.requestSubscription({
            serverPublicKey: publicKey,
          }),
        ),
      ),
    );
  }
}
